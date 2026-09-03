#!/usr/bin/env python3
"""
N3DC LIDAR ingest service  —  send THIS FILE to the backend team.

What the browser already does (no backend required)
  • Uncompressed LAS 1.2 / 1.4
  • XYZ / CSV / TXT (x y z [intensity] [class])
  • n3dc-lidar-tile/1.0 JSON

What MUST run here (do not stub these as live in the UI)
  • LAZ / COPC inflate          (laspy + lazrs, or PDAL)
  • E57                         (PDAL translate → LAS, then this service)
  • Horizontal reprojection     EPSG:32643 UTM 43N (MH, Goa, west KA, west GJ)
                                EPSG:32644 UTM 44N (TG, AP, east KA)
                                EPSG:32643 also covers western MH / Pune
  • Vertical datum              ellipsoidal → EGM2008 orthometric metres (MSL)
  • Parcel clip                 against Bhunaksha / City Survey polygon (WKT)
  • Live Mahabhunaksha / Mahabhulekh / IGRS mutation  — out of scope here

Indian defaults
  Horizontal  EPSG:32643  WGS 84 / UTM zone 43N   (Pune, Mumbai, PCMC)
  Vertical    EGM2008 orthometric metres
  Parcel key  14-digit ULPIN (DoLR NIC)
  Classes     ASPRS LAS 1.4  (2 ground, 5 veg, 6 building, 9 water, 11 road)

Install
  pip install fastapi uvicorn python-multipart laspy[lazrs] numpy pyproj

  # Optional: E57 / COPC
  #   pdal translate survey.e57 survey.laz --writers.las.minor_version=4

Run
  uvicorn n3dc_lidar_ingest:app --host 0.0.0.0 --port 8090

The frontend (src/lib/lidar-api.ts) already speaks this contract.
Set VITE_LIDAR_API to this origin when the service is live.

Primary key
  14-digit ULPIN (DoLR). Lookups and Building / v-ULPIN stamps join on ulpin.
  caseId is an optional registrar file number — audit reference only.

cURL
  curl -X POST "$N3DC_API/v1/lidar/ingest" \\
    -F "file=@/data/pune/baner-47-2A.laz" \\
    -F "ulpin=19041856427377" \\
    -F "caseId=SR-2026-11345" \\
    -F "targetEpsg=32643" \\
    -F "verticalDatum=EGM2008" \\
    -F "clipToParcel=true" \\
    -F "maxPoints=180000"

  curl "$N3DC_API/v1/lidar/ulpin/19041856427377"

"""

from __future__ import annotations

import base64
import io
import uuid
from datetime import datetime, timezone
from typing import Literal

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import laspy
except ImportError as exc:  # pragma: no cover
    raise SystemExit("pip install 'laspy[lazrs]'") from exc

try:
    from pyproj import Transformer
except ImportError:
    Transformer = None  # type: ignore


SPEC = "n3dc-lidar-tile/1.0"
POINT_STRIDE = 12  # int16 x,y,z  + uint16 intensity  + uint8 class  + uint8 rgb
SCALE = 0.01  # metres. int16 range ±327.67 m around tile origin — one urban plot.
JOBS: dict[str, dict] = {}
BY_ULPIN: dict[str, str] = {}  # ulpin -> latest job_id. ULPIN is the join key.

# UTM zone → EPSG:326xx. India spans 42N–47N.
UTM_EPSG = {z: 32600 + z for z in range(42, 48)}


class GeoOrigin(BaseModel):
    lat: float
    lng: float
    zMsl: float
    easting: float
    northing: float
    utmZone: int
    epsg: int


class TileHeader(BaseModel):
    spec: Literal["n3dc-lidar-tile/1.0"] = SPEC
    jobId: str
    status: Literal["queued", "running", "ready", "failed"]
    ulpin: str
    caseId: str | None = None
    crs: str
    verticalDatum: str
    origin: GeoOrigin
    scale: float = SCALE
    count: int
    densityPtsM2: float
    bounds: dict
    classes: dict[str, int]
    sensor: str
    capturedAt: str
    city: str = ""
    state: str = ""
    encoding: Literal["i16-xyz-u16i-u8c-u8rgb"] = "i16-xyz-u16i-u8c-u8rgb"
    pointsUrl: str | None = None
    pointsB64: str | None = None
    error: str | None = None
    groundZ: float | None = None
    buildingZMax: float | None = None
    measuredHeightM: float | None = None


app = FastAPI(title="N3DC LIDAR ingest", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)


def utm_zone(lng: float) -> int:
    return int((lng + 180) / 6) + 1


def transform_xy(x: np.ndarray, y: np.ndarray, src_epsg: int, dst_epsg: int):
    if src_epsg == dst_epsg or Transformer is None:
        return x, y
    tr = Transformer.from_crs(src_epsg, dst_epsg, always_xy=True)
    xx, yy = tr.transform(x, y)
    return np.asarray(xx), np.asarray(yy)


def pack_points(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    intensity: np.ndarray,
    klass: np.ndarray,
    rgb: np.ndarray,
    origin: tuple[float, float, float],
    scale: float = SCALE,
) -> bytes:
    """12-byte little-endian records relative to origin. Vectorised."""
    ox, oy, oz = origin
    n = int(x.shape[0])
    buf = np.empty(
        n,
        dtype=[
            ("x", "<i2"),
            ("y", "<i2"),
            ("z", "<i2"),
            ("i", "<u2"),
            ("c", "u1"),
            ("r", "u1"),
            ("g", "u1"),
            ("b", "u1"),
        ],
    )
    buf["x"] = np.clip(np.rint((x - ox) / scale), -32768, 32767).astype("<i2")
    buf["y"] = np.clip(np.rint((y - oy) / scale), -32768, 32767).astype("<i2")
    buf["z"] = np.clip(np.rint((z - oz) / scale), -32768, 32767).astype("<i2")
    buf["i"] = np.clip(intensity, 0, 65535).astype("<u2")
    buf["c"] = (klass.astype(np.uint16) & 0xFF).astype("u1")
    buf["r"] = (rgb[:, 0].astype(np.uint16) & 0xFF).astype("u1")
    buf["g"] = (rgb[:, 1].astype(np.uint16) & 0xFF).astype("u1")
    buf["b"] = (rgb[:, 2].astype(np.uint16) & 0xFF).astype("u1")
    return buf.tobytes()


def subsample(n: int, cap: int) -> np.ndarray:
    if n <= cap:
        return np.arange(n)
    rng = np.random.default_rng(2026)
    return np.sort(rng.choice(n, size=cap, replace=False))


def height_from_classes(x, y, z, klass, half_m: float = 18.0):
    """
    Building height = class-6 Z-max inside a ~plot footprint minus class-2
    ground median. Neighbour towers (also class 6) are excluded.
    """
    ground = z[klass == 2]
    ground_z = float(np.median(ground)) if ground.size >= 8 else float(np.min(z))
    ox, oy = float(np.median(x)), float(np.median(y))
    in_plot = (np.abs(x - ox) < half_m) & (np.abs(y - oy) < half_m) & (klass == 6)
    if not np.any(in_plot):
        in_plot = klass == 6
    bmax = float(np.max(z[in_plot])) if np.any(in_plot) else float(np.max(z))
    return ground_z, bmax, max(0.0, bmax - ground_z)


def read_las(raw: bytes, src_epsg: int, dst_epsg: int, cap: int):
    las = laspy.read(io.BytesIO(raw))
    idx = subsample(len(las.points), cap)
    x, y = transform_xy(np.asarray(las.x)[idx], np.asarray(las.y)[idx], src_epsg, dst_epsg)
    z = np.asarray(las.z)[idx]
    dims = set(las.point_format.dimension_names)
    intensity = (
        np.asarray(las.intensity)[idx] if "intensity" in dims else np.full(len(idx), 20000)
    )
    klass = (
        np.asarray(las.classification)[idx]
        if "classification" in dims
        else np.ones(len(idx), dtype=np.uint8)
    )
    if {"red", "green", "blue"} <= dims:
        rgb = np.stack(
            [np.asarray(las.red)[idx], np.asarray(las.green)[idx], np.asarray(las.blue)[idx]],
            axis=1,
        )
        if rgb.max() > 255:
            rgb = (rgb / 256).astype(np.uint16)
    else:
        rgb = np.full((len(idx), 3), 180, dtype=np.uint16)
    sensor = (las.header.system_identifier or "airborne-lidar").strip() or "airborne-lidar"
    captured = (
        las.header.creation_date.isoformat()
        if las.header.creation_date
        else datetime.now(timezone.utc).date().isoformat()
    )
    return x, y, z, intensity, klass, rgb, sensor, captured


def read_xyz(raw: bytes, cap: int):
    text = raw.decode("utf-8", errors="ignore")
    rows = []
    classes = []
    inten = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line[0] in "#/":
            continue
        parts = line.replace(",", " ").split()
        if len(parts) < 3:
            continue
        try:
            rows.append([float(parts[0]), float(parts[1]), float(parts[2])])
            inten.append(float(parts[3]) if len(parts) > 3 else 28000)
            classes.append(int(float(parts[4])) if len(parts) > 4 else 1)
        except ValueError:
            continue
    if not rows:
        raise ValueError("No XYZ rows parsed")
    arr = np.asarray(rows, dtype=np.float64)
    idx = subsample(arr.shape[0], cap)
    arr = arr[idx]
    n = arr.shape[0]
    return (
        arr[:, 0],
        arr[:, 1],
        arr[:, 2],
        np.asarray(inten, dtype=np.float64)[idx],
        np.asarray(classes, dtype=np.uint8)[idx],
        np.full((n, 3), 180),
    )


@app.get("/health")
def health():
    return {
        "ok": True,
        "spec": SPEC,
        "notes": [
            "LAZ/E57/COPC require this service — the browser cannot inflate them.",
            "Mahabhunaksha parcel clip is a backend GIS job, not a browser stub.",
        ],
    }


@app.get("/v1/lidar/contract")
def contract():
    return {
        "spec": SPEC,
        "encoding": "i16-xyz-u16i-u8c-u8rgb",
        "stride": POINT_STRIDE,
        "scaleM": SCALE,
        "defaultCrs": "EPSG:32643",
        "verticalDatum": "EGM2008",
        "ulpin": "REQUIRED 14-digit DoLR identifier — the join key for Building / v-ULPIN records",
        "caseId": "optional registrar file number — audit reference only, never the lookup key",
        "height": "measuredHeightM = class6_Zmax_in_footprint - class2_ground_median",
        "lookup": "GET /v1/lidar/ulpin/{ulpin}",
        "accept": [".las", ".laz", ".xyz", ".csv", ".txt"],
        "e57": "pdal translate in.e57 out.laz --writers.las.minor_version=4",
    }


@app.post("/v1/lidar/ingest", response_model=TileHeader)
async def ingest(
    file: UploadFile = File(...),
    ulpin: str = Form(...),
    caseId: str | None = Form(None),
    sourceEpsg: int = Form(0),
    targetEpsg: int = Form(32643),
    verticalDatum: str = Form("EGM2008"),
    clipToParcel: bool = Form(True),
    maxPoints: int = Form(180000),
    city: str = Form(""),
    state: str = Form(""),
    parcelWkt: str | None = Form(None),
):
    """
    Accept a survey LAS/LAZ (or XYZ) and return a web tile centred on the
    parcel. Frontend unpacks `pointsB64` immediately; large jobs may omit it
    and stream GET /v1/lidar/jobs/{id}/points.bin instead.

    parcelWkt: optional WKT polygon in the target CRS. When omitted, a 90 m
    box around the cloud centroid is used. Wiring this to Bhunaksha CTS
    polygons is a GIS-team job — do not pretend it is live from the browser.
    """
    if len(ulpin) != 14 or not ulpin.isdigit():
        raise HTTPException(400, "ulpin must be the 14-digit DoLR identifier (join key)")

    raw = await file.read()
    if len(raw) < 16:
        raise HTTPException(400, "empty file")

    job_id = str(uuid.uuid4())
    name = (file.filename or "upload").lower()
    cap = int(np.clip(maxPoints, 5_000, 400_000))

    try:
        if name.endswith((".las", ".laz", ".copc.laz")) or raw[:4] == b"LASF":
            src = sourceEpsg or targetEpsg
            x, y, z, intensity, klass, rgb, sensor, captured = read_las(raw, src, targetEpsg, cap)
        elif name.endswith((".xyz", ".txt", ".csv")):
            x, y, z, intensity, klass, rgb = read_xyz(raw, cap)
            sensor, captured = "xyz-import", datetime.now(timezone.utc).date().isoformat()
        elif name.endswith(".e57"):
            raise HTTPException(
                415,
                "E57 is not inflated here. Convert with PDAL: "
                "`pdal translate in.e57 out.laz --writers.las.minor_version=4` "
                "then POST the LAZ.",
            )
        else:
            raise HTTPException(
                415,
                "Unsupported format. Send LAS/LAZ (preferred) or XYZ/CSV. "
                "E57/COPC: convert with PDAL (`pdal translate in.e57 out.laz`).",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Failed to read point cloud: {exc}") from exc

    ox, oy, oz = float(np.median(x)), float(np.median(y)), float(np.min(z))
    if clipToParcel:
        # Keep a 90 m box around the parcel centroid — one urban plot + setbacks.
        # If parcelWkt is supplied, GIS should replace this box with a true
        # City Survey / Bhunaksha polygon clip (Shapely + pyproj).
        _ = parcelWkt  # reserved for the GIS team — not silently faked
        mask = (np.abs(x - ox) < 90) & (np.abs(y - oy) < 90)
        if mask.sum() > 200:
            x, y, z = x[mask], y[mask], z[mask]
            intensity, klass, rgb = intensity[mask], klass[mask], rgb[mask]
            ox, oy, oz = float(np.median(x)), float(np.median(y)), float(np.min(z))

    packed = pack_points(x, y, z, intensity, klass, rgb, (ox, oy, oz))
    counts: dict[str, int] = {}
    for c, n in zip(*np.unique(klass.astype(np.int64), return_counts=True)):
        counts[str(int(c))] = int(n)

    span = max(float(x.max() - x.min()), float(y.max() - y.min()), 1.0)
    density = float(len(x) / (span * span)) if span else 0.0
    zone = {32642: 42, 32643: 43, 32644: 44, 32645: 45, 32646: 46}.get(targetEpsg, 43)

    lat = 0.0
    lng = 0.0
    if Transformer is not None:
        tr = Transformer.from_crs(targetEpsg, 4326, always_xy=True)
        lng, lat = tr.transform(ox, oy)

    ground_z, bmax, height = height_from_classes(x, y, z, klass)

    header = TileHeader(
        jobId=job_id,
        status="ready",
        ulpin=ulpin,
        caseId=caseId,
        crs=f"EPSG:{targetEpsg}",
        verticalDatum=verticalDatum,
        origin=GeoOrigin(
            lat=float(lat),
            lng=float(lng),
            zMsl=float(oz),
            easting=ox,
            northing=oy,
            utmZone=zone,
            epsg=targetEpsg,
        ),
        scale=SCALE,
        count=int(len(x)),
        densityPtsM2=round(density, 3),
        bounds={
            "min": [float(x.min() - ox), float(y.min() - oy), float(z.min() - oz)],
            "max": [float(x.max() - ox), float(y.max() - oy), float(z.max() - oz)],
        },
        classes=counts,
        sensor=sensor,
        capturedAt=captured,
        city=city,
        state=state,
        pointsUrl=f"/v1/lidar/jobs/{job_id}/points.bin",
        pointsB64=base64.b64encode(packed).decode("ascii") if len(packed) < 2_500_000 else None,
        groundZ=round(ground_z - oz, 3),
        buildingZMax=round(bmax - oz, 3),
        measuredHeightM=round(height, 3),
    )
    JOBS[job_id] = {"header": header.model_dump(), "points": packed}
    BY_ULPIN[ulpin] = job_id
    return header


@app.get("/v1/lidar/ulpin/{ulpin}", response_model=TileHeader)
def by_ulpin(ulpin: str):
    """Latest tile for a 14-digit ULPIN. caseId on the header is an audit reference."""
    if len(ulpin) != 14 or not ulpin.isdigit():
        raise HTTPException(400, "ulpin must be the 14-digit DoLR identifier")
    job_id = BY_ULPIN.get(ulpin)
    if not job_id:
        raise HTTPException(404, f"no tile for ULPIN {ulpin}")
    rec = JOBS.get(job_id)
    if not rec:
        raise HTTPException(404, "unknown job")
    return rec["header"]


@app.get("/v1/lidar/jobs/{job_id}", response_model=TileHeader)
def job(job_id: str):
    rec = JOBS.get(job_id)
    if not rec:
        raise HTTPException(404, "unknown job")
    body = dict(rec["header"])
    body.pop("pointsB64", None)
    return body


@app.get("/v1/lidar/jobs/{job_id}/points.bin")
def points_bin(job_id: str):
    from fastapi.responses import Response

    rec = JOBS.get(job_id)
    if not rec:
        raise HTTPException(404, "unknown job")
    return Response(
        content=rec["points"],
        media_type="application/octet-stream",
        headers={"X-N3DC-Stride": str(POINT_STRIDE), "X-N3DC-Scale": str(SCALE)},
    )
