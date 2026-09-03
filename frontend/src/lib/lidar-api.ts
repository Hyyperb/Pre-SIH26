/**
 * N3DC LIDAR ingest contract — frontend + backend share this shape.
 *
 * Primary key is the 14-digit 3D ULPIN (DoLR). caseId is an audit
 * reference only — never the join key.
 *
 * Send `public/n3dc_lidar_ingest.py` to the backend team. They implement
 * POST /v1/lidar/ingest; this client already speaks that API.
 *
 * Browser can parse: uncompressed LAS, XYZ/CSV, n3dc-lidar-tile JSON.
 * Backend REQUIRED for: LAZ, COPC, E57, EPSG reprojection, EGM2008, parcel clip.
 *
 * Indian defaults:
 *   Horizontal CRS  EPSG:32643 (WGS 84 / UTM 43N) for MH / west coast
 *   Vertical datum  EGM2008 orthometric (MSL)
 *   Classification  ASPRS LAS 1.4
 *   Parcel key      14-digit ULPIN
 */

export const N3DC_LIDAR_SPEC = "n3dc-lidar-tile/1.0" as const;

export const LIDAR_ACCEPT = [
  ".las",
  ".laz",
  ".copc.laz",
  ".e57",
  ".ply",
  ".xyz",
  ".txt",
  ".csv",
  ".json",
] as const;

export type AsprsClass =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 9
  | 10
  | 11
  | 13
  | 14
  | 17
  | 18;

export const ASPRS_LABEL: Record<number, string> = {
  1: "Unclassified",
  2: "Ground",
  3: "Low vegetation",
  4: "Medium vegetation",
  5: "High vegetation",
  6: "Building",
  7: "Noise",
  9: "Water",
  10: "Rail",
  11: "Road surface",
  13: "Wire — conductor",
  14: "Transmission tower",
  17: "Bridge deck",
  18: "High noise",
};

export interface GeoOrigin {
  lat: number;
  lng: number;
  zMsl: number;
  easting: number;
  northing: number;
  utmZone: number;
  epsg: number;
}

export interface LidarIngestRequestMeta {
  /** Required 14-digit DoLR ULPIN — the join key for Building / v-ULPIN records. */
  ulpin: string;
  /** Optional registrar file number. Audit reference only. */
  caseId?: string;
  filename: string;
  sourceEpsg?: number;
  targetEpsg?: number;
  verticalDatum?: "EGM2008" | "EGM96" | "ellipsoidal";
  clipToParcel?: boolean;
  maxPoints?: number;
}

export interface N3dcLidarTileHeader {
  spec: typeof N3DC_LIDAR_SPEC;
  jobId: string;
  status: "queued" | "running" | "ready" | "failed";
  ulpin: string;
  caseId?: string;
  crs: string;
  verticalDatum: string;
  origin: GeoOrigin;
  scale: number;
  count: number;
  densityPtsM2: number;
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  classes: Record<string, number>;
  sensor: string;
  capturedAt: string;
  city: string;
  state: string;
  encoding: "i16-xyz-u16i-u8c-u8rgb";
  pointsUrl?: string;
  error?: string;
  groundZ?: number;
  buildingZMax?: number;
  measuredHeightM?: number;
}

export interface N3dcLidarTile extends N3dcLidarTileHeader {
  /** Packed little-endian records, 12 bytes each. Present on local parse / JSON tiles. */
  points?: ArrayBuffer;
  pointsB64?: string;
}

export const POINT_STRIDE = 12;

export function packPoint(
  view: DataView,
  offset: number,
  x: number,
  y: number,
  z: number,
  intensity: number,
  klass: number,
  r: number,
  g: number,
  b: number,
  scale: number,
) {
  view.setInt16(offset + 0, Math.round(x / scale), true);
  view.setInt16(offset + 2, Math.round(y / scale), true);
  view.setInt16(offset + 4, Math.round(z / scale), true);
  view.setUint16(offset + 6, Math.max(0, Math.min(65535, Math.round(intensity))), true);
  view.setUint8(offset + 8, klass & 0xff);
  view.setUint8(offset + 9, r & 0xff);
  view.setUint8(offset + 10, g & 0xff);
  view.setUint8(offset + 11, b & 0xff);
}

export function unpackTilePoints(tile: N3dcLidarTile): {
  positions: Float32Array;
  colors: Float32Array;
  intensity: Float32Array;
  classification: Uint8Array;
  height: Float32Array;
} {
  const buf =
    tile.points ??
    (tile.pointsB64
      ? Uint8Array.from(atob(tile.pointsB64), (c) => c.charCodeAt(0)).buffer
      : new ArrayBuffer(0));
  const view = new DataView(buf);
  const count = Math.floor(view.byteLength / POINT_STRIDE);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const intensity = new Float32Array(count);
  const classification = new Uint8Array(count);
  const height = new Float32Array(count);
  const s = tile.scale || 0.01;
  for (let i = 0; i < count; i++) {
    const o = i * POINT_STRIDE;
    const x = view.getInt16(o + 0, true) * s;
    const y = view.getInt16(o + 2, true) * s;
    const z = view.getInt16(o + 4, true) * s;
    positions[i * 3] = x;
    positions[i * 3 + 1] = z;
    positions[i * 3 + 2] = y;
    intensity[i] = view.getUint16(o + 6, true) / 65535;
    classification[i] = view.getUint8(o + 8);
    height[i] = z;
    colors[i * 3] = view.getUint8(o + 9) / 255;
    colors[i * 3 + 1] = view.getUint8(o + 10) / 255;
    colors[i * 3 + 2] = view.getUint8(o + 11) / 255;
  }
  return { positions, colors, intensity, classification, height };
}

export function lidarApiBase(): string {
  const env = import.meta.env.VITE_LIDAR_API as string | undefined;
  return (env ?? "").replace(/\/$/, "");
}

export async function ingestLidarRemote(
  file: File,
  meta: LidarIngestRequestMeta,
): Promise<N3dcLidarTile> {
  const base = lidarApiBase();
  if (!base) {
    throw new Error("VITE_LIDAR_API is not set — falling back to local parse.");
  }
  if (!/^\d{14}$/.test(meta.ulpin)) {
    throw new Error("ulpin must be the 14-digit DoLR identifier (join key).");
  }
  const body = new FormData();
  body.append("file", file);
  body.append("ulpin", meta.ulpin);
  if (meta.caseId) body.append("caseId", meta.caseId);
  body.append("targetEpsg", String(meta.targetEpsg ?? 32643));
  body.append("verticalDatum", meta.verticalDatum ?? "EGM2008");
  body.append("clipToParcel", meta.clipToParcel === false ? "false" : "true");
  body.append("maxPoints", String(meta.maxPoints ?? 180_000));

  const res = await fetch(`${base}/v1/lidar/ingest`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ingest failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const tile = (await res.json()) as N3dcLidarTile;
  if (tile.pointsUrl && !tile.points && !tile.pointsB64) {
    const bin = await fetch(
      tile.pointsUrl.startsWith("http") ? tile.pointsUrl : `${base}${tile.pointsUrl}`,
    );
    if (bin.ok) tile.points = await bin.arrayBuffer();
  }
  return tile;
}

export const BACKEND_CURL = `# N3DC LIDAR ingest — ULPIN is the required join key
# caseId is an optional audit reference (linked registrar file), never the lookup key.
# Accepts LAS / LAZ / E57 (via PDAL) / XYZ. Returns a quantized web tile.
# Indian default CRS: EPSG:32643 (UTM 43N) · vertical: EGM2008 MSL

curl -X POST "$N3DC_API/v1/lidar/ingest" \\
  -F "file=@/data/pune/baner-47-2A.laz" \\
  -F "ulpin=19041856427377" \\
  -F "caseId=SR-2026-11345" \\
  -F "targetEpsg=32643" \\
  -F "verticalDatum=EGM2008" \\
  -F "clipToParcel=true" \\
  -F "maxPoints=180000"

# Look up the latest tile for a parcel:
#   GET $N3DC_API/v1/lidar/ulpin/19041856427377
#
# Response: ulpin first. measuredHeightM = class-6 Zmax − class-2 ground.
# 12-byte packed points.bin (or pointsB64 for small tiles).
`;
