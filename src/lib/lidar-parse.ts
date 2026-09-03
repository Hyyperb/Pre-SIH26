import {
  N3DC_LIDAR_SPEC,
  POINT_STRIDE,
  packPoint,
  unpackTilePoints,
  type N3dcLidarTile,
} from "@/lib/lidar-api";
import { emptyOrigin, type LidarCloud } from "@/lib/lidar-cloud";

const BUDGET = 20_000;

function budget(): number {
  if (typeof window === "undefined") return 16_000;
  return window.innerWidth < 640 ? 12_000 : 20_000;
}

export function detectKind(file: File, bytes: ArrayBuffer): "las" | "laz" | "xyz" | "json" | "unknown" {
  const name = file.name.toLowerCase();
  const u8 = new Uint8Array(bytes);
  if (name.endsWith(".laz") || name.endsWith(".copc.laz")) return "laz";
  if (name.endsWith(".e57")) return "unknown";
  if (name.endsWith(".json") || name.endsWith(".n3dc.json")) return "json";
  if (name.endsWith(".xyz") || name.endsWith(".txt") || name.endsWith(".csv")) return "xyz";
  if (u8.length >= 4 && u8[0] === 0x4c && u8[1] === 0x41 && u8[2] === 0x53 && u8[3] === 0x46) {
    return "las";
  }
  if (name.endsWith(".las")) return "las";
  return "unknown";
}

function tileToCloud(tile: N3dcLidarTile): LidarCloud {
  const unpacked = unpackTilePoints(tile);
  return {
    header: tile,
    positions: unpacked.positions,
    rgb: unpacked.colors,
    intensity: unpacked.intensity,
    classification: unpacked.classification,
    height: unpacked.height,
    count: unpacked.positions.length / 3,
  };
}

export function parseJsonTile(text: string): LidarCloud {
  const tile = JSON.parse(text) as N3dcLidarTile;
  if (tile.spec !== N3DC_LIDAR_SPEC && !tile.pointsB64 && !tile.points) {
    throw new Error("JSON is not an n3dc-lidar-tile/1.0 payload");
  }
  return tileToCloud(tile);
}

export function parseXyz(text: string, fileName: string): LidarCloud {
  const lines = text.split(/\r?\n/);
  const cap = Math.min(budget(), BUDGET);
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const is: number[] = [];
  const cs: number[] = [];
  let headerUlpin = "";
  let headerCase = "";
  let headerCrs = "local-metres";
  let headerDatum = "file";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("#") || t.startsWith("//")) {
      const u = t.match(/ULPIN\s+(\d{14})/i);
      if (u?.[1]) headerUlpin = u[1];
      const cid = t.match(/linked-case\s+(SR-\d{4}-\d+)/i) ?? t.match(/caseId\s+(SR-\d{4}-\d+)/i);
      if (cid?.[1]) headerCase = cid[1];
      const crs = t.match(/CRS\s+(EPSG:\d+)/i);
      if (crs?.[1]) headerCrs = crs[1];
      if (/EGM2008/i.test(t)) headerDatum = "EGM2008";
      continue;
    }
    const p = t.split(/[,\s]+/);
    const x = Number(p[0]);
    const y = Number(p[1]);
    const z = Number(p[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    xs.push(x);
    ys.push(y);
    zs.push(z);
    is.push(p[3] !== undefined ? Number(p[3]) : 0.55);
    cs.push(p[4] !== undefined ? Number(p[4]) : 1);
  }
  if (xs.length < 8) throw new Error("XYZ file has no usable rows (need x y z per line).");
  const stride = Math.max(1, Math.ceil(xs.length / cap));
  let ox = 0;
  let oy = 0;
  let oz = Infinity;
  for (let i = 0; i < xs.length; i++) {
    ox += xs[i]!;
    oy += ys[i]!;
    if (zs[i]! < oz) oz = zs[i]!;
  }
  ox /= xs.length;
  oy /= ys.length;
  const count = Math.ceil(xs.length / stride);
  const packed = new ArrayBuffer(count * POINT_STRIDE);
  const view = new DataView(packed);
  let w = 0;
  const classes: Record<string, number> = {};
  let zMax = -Infinity;
  for (let i = 0; i < xs.length; i += stride) {
    const x = xs[i]! - ox;
    const y = ys[i]! - oy;
    const z = zs[i]! - oz;
    if (z > zMax) zMax = z;
    const klass = Number.isFinite(cs[i]) ? (cs[i] as number) : 1;
    const inten = Number.isFinite(is[i]) ? (is[i] as number) : 0.55;
    packPoint(
      view,
      w * POINT_STRIDE,
      x,
      y,
      z,
      inten > 1 ? inten : inten * 65535,
      klass,
      180,
      180,
      190,
      0.01,
    );
    classes[String(klass | 0)] = (classes[String(klass | 0)] ?? 0) + 1;
    w += 1;
  }
  return tileToCloud({
    spec: N3DC_LIDAR_SPEC,
    jobId: `local-xyz-${Date.now()}`,
    status: "ready",
    ulpin: headerUlpin,
    caseId: headerCase || undefined,
    crs: headerCrs,
    verticalDatum: headerDatum,
    origin: emptyOrigin(0, 0),
    scale: 0.01,
    count: w,
    densityPtsM2: 0,
    bounds: { min: [-40, -40, 0], max: [40, 40, zMax] },
    classes,
    sensor: fileName,
    capturedAt: new Date().toISOString(),
    city: "",
    state: "",
    encoding: "i16-xyz-u16i-u8c-u8rgb",
    points: packed.slice(0, w * POINT_STRIDE),
  });
}

export function parseLas(buffer: ArrayBuffer, fileName: string): LidarCloud {
  const view = new DataView(buffer);
  if (buffer.byteLength < 227) throw new Error("LAS header truncated");
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== "LASF") throw new Error("Not a LAS file (missing LASF signature).");

  const versionMinor = view.getUint8(25);
  const headerSize = view.getUint16(94, true);
  const offset = view.getUint32(96, true);
  const fmt = view.getUint8(104);
  const recLen = view.getUint16(105, true);
  let n = view.getUint32(107, true);
  if (n === 0 && versionMinor >= 4 && headerSize >= 375) {
    const lo = view.getUint32(247, true);
    const hi = view.getUint32(251, true);
    n = lo + hi * 0x100000000;
  }
  const xScale = view.getFloat64(131, true);
  const yScale = view.getFloat64(139, true);
  const zScale = view.getFloat64(147, true);
  const xOff = view.getFloat64(155, true);
  const yOff = view.getFloat64(163, true);
  const zOff = view.getFloat64(171, true);

  if (recLen < 20 || offset + recLen > buffer.byteLength) {
    throw new Error("LAS point records unreadable");
  }
  const available = Math.floor((buffer.byteLength - offset) / recLen);
  const total = Math.min(n || available, available);
  const cap = Math.min(budget(), BUDGET);
  const stride = Math.max(1, Math.ceil(total / cap));

  const sampleX: number[] = [];
  const sampleY: number[] = [];
  const sampleZ: number[] = [];
  for (let i = 0; i < total; i += Math.max(stride * 8, 1)) {
    const o = offset + i * recLen;
    sampleX.push(view.getInt32(o, true) * xScale + xOff);
    sampleY.push(view.getInt32(o + 4, true) * yScale + yOff);
    sampleZ.push(view.getInt32(o + 8, true) * zScale + zOff);
  }
  const ox = sampleX.reduce((a, b) => a + b, 0) / Math.max(1, sampleX.length);
  const oy = sampleY.reduce((a, b) => a + b, 0) / Math.max(1, sampleY.length);
  const oz = sampleZ.reduce((a, b) => Math.min(a, b), Infinity);

  const hasRgb = fmt === 2 || fmt === 3 || fmt === 5 || fmt === 7 || fmt >= 8;
  const rgbOff = fmt === 2 ? 20 : fmt === 3 ? 28 : fmt >= 7 ? 30 : -1;
  const classOff = 15;
  const written = Math.ceil(total / stride);
  const packed = new ArrayBuffer(written * POINT_STRIDE);
  const out = new DataView(packed);
  const classes: Record<string, number> = {};
  let w = 0;
  let zMax = -Infinity;
  for (let i = 0; i < total && w < written; i += stride) {
    const o = offset + i * recLen;
    const x = view.getInt32(o, true) * xScale + xOff - ox;
    const y = view.getInt32(o + 4, true) * yScale + yOff - oy;
    const z = view.getInt32(o + 8, true) * zScale + zOff - oz;
    const intensity = view.getUint16(o + 12, true);
    const klass = view.getUint8(o + classOff) & 0x1f;
    let r = 180;
    let g = 180;
    let b = 190;
    if (hasRgb && rgbOff > 0 && o + rgbOff + 6 <= buffer.byteLength) {
      r = Math.min(255, view.getUint16(o + rgbOff, true) >> 8);
      g = Math.min(255, view.getUint16(o + rgbOff + 2, true) >> 8);
      b = Math.min(255, view.getUint16(o + rgbOff + 4, true) >> 8);
    }
    if (z > zMax) zMax = z;
    packPoint(out, w * POINT_STRIDE, x, y, z, intensity, klass, r, g, b, 0.01);
    classes[String(klass)] = (classes[String(klass)] ?? 0) + 1;
    w += 1;
  }

  const sysId = new TextDecoder().decode(new Uint8Array(buffer, 26, 32)).replace(/\0/g, "").trim();

  return tileToCloud({
    spec: N3DC_LIDAR_SPEC,
    jobId: `local-las-${Date.now()}`,
    status: "ready",
    ulpin: "",
    crs: "file-crs",
    verticalDatum: "file",
    origin: emptyOrigin(0, 0),
    scale: 0.01,
    count: w,
    densityPtsM2: 0,
    bounds: { min: [-80, -80, 0], max: [80, 80, zMax] },
    classes,
    sensor: sysId || fileName,
    capturedAt: new Date().toISOString(),
    city: "",
    state: "",
    encoding: "i16-xyz-u16i-u8c-u8rgb",
    points: packed.slice(0, w * POINT_STRIDE),
  });
}

export async function parseLidarFile(file: File): Promise<LidarCloud> {
  const bytes = await file.arrayBuffer();
  const kind = detectKind(file, bytes);
  if (kind === "laz") {
    throw new Error(
      "LAZ is compressed. POST it to /v1/lidar/ingest (see the Python contract) — the browser cannot inflate LAZ without the backend.",
    );
  }
  if (kind === "json") {
    return parseJsonTile(new TextDecoder().decode(bytes));
  }
  if (kind === "xyz") {
    return parseXyz(new TextDecoder().decode(bytes), file.name);
  }
  if (kind === "las") {
    return parseLas(bytes, file.name);
  }
  throw new Error(
    `Unsupported file (${file.name}). Accept LAS, XYZ/CSV, or n3dc-lidar-tile JSON. LAZ/E57 go through the ingest API.`,
  );
}
