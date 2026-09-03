import { N3DC_LIDAR_SPEC, POINT_STRIDE, packPoint, unpackTilePoints } from "@/lib/lidar-api";
import { emptyOrigin, type LidarCloud } from "@/lib/lidar-cloud";
import type { CadastreCase } from "@/lib/types";
import { TW, TD, FLOOR_H, BASE_H } from "@/lib/scene-constants";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function epsgForLng(lng: number): number {
  const zone = Math.floor((lng + 180) / 6) + 1;
  return 32600 + zone;
}

const COASTAL = new Set(["Mumbai", "Chennai", "Kolkata"]);

interface Writer {
  view: DataView;
  i: number;
  cap: number;
  classes: Record<string, number>;
  zMax: number;
  rng: () => number;
}

function push(
  w: Writer,
  x: number,
  y: number,
  z: number,
  klass: number,
  intensity: number,
  rgb: [number, number, number],
) {
  if (w.i >= w.cap) return;
  packPoint(w.view, w.i * POINT_STRIDE, x, y, z, intensity * 65535, klass, rgb[0], rgb[1], rgb[2], 0.01);
  w.classes[String(klass)] = (w.classes[String(klass)] ?? 0) + 1;
  if (z > w.zMax) w.zMax = z;
  w.i += 1;
}

function boxShell(
  w: Writer,
  cx: number,
  cz: number,
  sx: number,
  sz: number,
  y0: number,
  y1: number,
  density: number,
  klass: number,
  rgb: [number, number, number],
) {
  const rng = w.rng;
  const area = 2 * (sx + sz) * (y1 - y0) + sx * sz;
  const n = Math.max(12, Math.floor(area * density));
  for (let k = 0; k < n && w.i < w.cap; k++) {
    const face = rng();
    let x = 0;
    let z = 0;
    let y = y0 + rng() * (y1 - y0);
    if (face < 0.22) {
      x = cx - sx / 2;
      z = cz + (rng() - 0.5) * sz;
    } else if (face < 0.44) {
      x = cx + sx / 2;
      z = cz + (rng() - 0.5) * sz;
    } else if (face < 0.66) {
      z = cz - sz / 2;
      x = cx + (rng() - 0.5) * sx;
    } else if (face < 0.88) {
      z = cz + sz / 2;
      x = cx + (rng() - 0.5) * sx;
    } else {
      y = y1;
      x = cx + (rng() - 0.5) * sx;
      z = cz + (rng() - 0.5) * sz;
    }
    const scan = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.18 + z * 0.04));
    push(w, x, z, y, klass, scan * (0.7 + rng() * 0.3), rgb);
  }
}

function disk(
  w: Writer,
  cx: number,
  cz: number,
  radius: number,
  y: number,
  n: number,
  klass: number,
  rgb: [number, number, number],
  jitterY = 0.15,
) {
  for (let k = 0; k < n && w.i < w.cap; k++) {
    const a = w.rng() * Math.PI * 2;
    const r = Math.sqrt(w.rng()) * radius;
    push(
      w,
      cx + Math.cos(a) * r,
      cz + Math.sin(a) * r,
      y + (w.rng() - 0.5) * jitterY,
      klass,
      0.4 + w.rng() * 0.4,
      rgb,
    );
  }
}

const NEIGHBORS: { p: [number, number]; s: [number, number]; h: number }[] = [
  { p: [-42, -36], s: [18, 16], h: 28 },
  { p: [-58, -8], s: [14, 14], h: 20 },
  { p: [-48, 28], s: [16, 14], h: 36 },
  { p: [48, -32], s: [18, 15], h: 32 },
  { p: [62, 6], s: [14, 16], h: 24 },
  { p: [50, 38], s: [20, 16], h: 40 },
  { p: [8, -52], s: [22, 14], h: 22 },
  { p: [-18, -48], s: [16, 12], h: 18 },
  { p: [22, 56], s: [24, 14], h: 16 },
  { p: [-28, 52], s: [18, 14], h: 26 },
];

const cache = new Map<string, LidarCloud>();

export function syntheticLidar(caze: CadastreCase, pointBudget?: number): LidarCloud {
  const cap =
    pointBudget ??
    (typeof window !== "undefined" && window.innerWidth < 640 ? 16_000 : 22_000);
  const key = `${caze.ulpin}:${cap}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const packed = new ArrayBuffer(cap * POINT_STRIDE);
  const w: Writer = {
    view: new DataView(packed),
    i: 0,
    cap,
    classes: {},
    zMax: 0,
    rng: mulberry32(seedFrom(caze.ulpin + caze.id)),
  };
  const rng = w.rng;
  const height = caze.heightM;
  const coastal = COASTAL.has(caze.city);
  const vegBoost = caze.city === "Bengaluru" || caze.city === "Pune" ? 1.35 : 1;

  const groundN = Math.floor(cap * 0.28);
  for (let k = 0; k < groundN && w.i < cap; k++) {
    const x = (rng() - 0.5) * 160;
    const z = (rng() - 0.5) * 160;
    const nala = Math.abs(x + z * 0.3) < 3.2 ? -1.4 : 0;
    const road =
      Math.abs(x - 90) < 9 || Math.abs(z - 80) < 8 ? 0.12 : 0;
    const y = nala + (rng() - 0.5) * 0.25 + (coastal && x > 70 ? -0.6 : 0);
    const onRoad = road > 0;
    const klass = onRoad ? 11 : coastal && x > 78 ? 9 : 2;
    const rgb: [number, number, number] = onRoad
      ? [70, 74, 78]
      : klass === 9
        ? [40, 90, 170]
        : [130 + (rng() * 30) | 0, 110, 70];
    const scan = 0.3 + 0.7 * Math.abs(Math.sin(x * 0.16));
    push(w, x, z, y, klass, scan, rgb);
  }

  boxShell(w, 0, 0, TW, TD, -caze.basements * BASE_H, height, 1.8, 6, [210, 205, 195]);
  for (let f = 1; f <= caze.floors; f++) {
    const y = f * FLOOR_H;
    const slabN = 40;
    for (let k = 0; k < slabN && w.i < cap; k++) {
      push(
        w,
        (rng() - 0.5) * TW,
        (rng() - 0.5) * TD,
        y + (rng() - 0.5) * 0.08,
        6,
        0.55 + rng() * 0.3,
        [200, 196, 186],
      );
    }
  }

  for (const n of NEIGHBORS) {
    boxShell(w, n.p[0], n.p[1], n.s[0], n.s[1], 0, n.h, 0.55, 6, [160, 170, 180]);
  }

  const trees = [
    [22, -22],
    [28, -18],
    [-24, -22],
    [-30, 18],
    [32, 22],
    [-36, -8],
    [18, 28],
    [-22, 24],
    [40, -8],
    [-12, 36],
    [8, -28],
    [-44, 8],
  ] as const;
  for (const [tx, tz] of trees) {
    const h = 3.2 + rng() * 3.4 * vegBoost;
    disk(w, tx, tz, 0.35, 0.2, 8, 3, [90, 140, 60]);
    const blob = Math.floor(70 * vegBoost);
    for (let k = 0; k < blob && w.i < cap; k++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 1.6;
      push(
        w,
        tx + Math.cos(a) * r,
        tz + Math.sin(a) * r,
        1.4 + rng() * h,
        5,
        0.35 + rng() * 0.4,
        [30 + (rng() * 40) | 0, 90 + (rng() * 50) | 0, 40],
      );
    }
  }

  for (let s = 0; s < 2; s++) {
    const z0 = -18 + s * 22;
    for (let t = 0; t < 40 && w.i < cap; t++) {
      const x = -30 + t * 1.6;
      push(w, x, z0, 9.5 + Math.sin(t * 0.4) * 0.4, 13, 0.85, [240, 200, 40]);
    }
  }

  if (caze.intersects3d) {
    for (let t = 0; t < 80 && w.i < cap; t++) {
      push(w, -16 + t * 0.4, -14, -7.4 + (rng() - 0.5) * 0.3, 14, 0.7, [200, 80, 50]);
    }
  }

  const unpacked = unpackTilePoints({
    spec: N3DC_LIDAR_SPEC,
    jobId: `synth-${caze.id}`,
    status: "ready",
    ulpin: caze.ulpin,
    caseId: caze.id,
    crs: `EPSG:${epsgForLng(caze.lng)}`,
    verticalDatum: "EGM2008",
    origin: emptyOrigin(caze.lat, caze.lng, epsgForLng(caze.lng)),
    scale: 0.01,
    count: w.i,
    densityPtsM2: caze.lidarPtsM2,
    bounds: { min: [-80, -80, -caze.basements * BASE_H], max: [80, 80, w.zMax] },
    classes: w.classes,
    sensor: `${caze.authority} airborne block · Riegl VQ-1560 II`,
    capturedAt: "2026-01-18T06:40:00+05:30",
    city: caze.city,
    state: caze.state,
    encoding: "i16-xyz-u16i-u8c-u8rgb",
    points: packed.slice(0, w.i * POINT_STRIDE),
  });

  const cloud: LidarCloud = {
    header: {
      spec: N3DC_LIDAR_SPEC,
      jobId: `synth-${caze.id}`,
      status: "ready",
      ulpin: caze.ulpin,
      caseId: caze.id,
      crs: `EPSG:${epsgForLng(caze.lng)}`,
      verticalDatum: "EGM2008",
      origin: emptyOrigin(caze.lat, caze.lng, epsgForLng(caze.lng)),
      scale: 0.01,
      count: w.i,
      densityPtsM2: caze.lidarPtsM2,
      bounds: { min: [-80, -80, -caze.basements * BASE_H], max: [80, 80, w.zMax] },
      classes: w.classes,
      sensor: `${caze.authority} airborne block · Riegl VQ-1560 II`,
      capturedAt: "2026-01-18T06:40:00+05:30",
      city: caze.city,
      state: caze.state,
      encoding: "i16-xyz-u16i-u8c-u8rgb",
    },
    positions: unpacked.positions,
    rgb: unpacked.colors,
    intensity: unpacked.intensity,
    classification: unpacked.classification,
    height: unpacked.height,
    count: unpacked.positions.length / 3,
  };
  cache.set(key, cloud);
  return cloud;
}
