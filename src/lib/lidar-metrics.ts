import type { LidarCloud } from "@/lib/lidar-cloud";
import { ASPRS_LABEL } from "@/lib/lidar-api";
import { TD, TW } from "@/lib/scene-constants";
import type { CadastreCase } from "@/lib/types";

export interface LidarMetrics {
  pointCount: number;
  densityPtsM2: number;
  groundZ: number;
  buildingZMax: number;
  measuredHeightM: number;
  declaredHeightM: number;
  deltaM: number;
  deltaPct: number;
  zMin: number;
  zMax: number;
  bbox: {
    lat: number;
    lng: number;
    min: [number, number, number];
    max: [number, number, number];
  };
  classes: { klass: number; label: string; n: number }[];
  pass: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Building height = class-6 Z-max inside the subject footprint minus the
 * class-2 ground plane. Neighbour towers (also class 6) are ignored so a
 * 32 m Baner walk-up is not reported as 40 m because Kalyani Nagar next door
 * is taller.
 */
export function measureLidar(cloud: LidarCloud, caze?: CadastreCase): LidarMetrics {
  const hx = TW / 2 + 1.5;
  const hz = TD / 2 + 1.5;
  const grounds: number[] = [];
  let buildingZMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let i = 0; i < cloud.count; i++) {
    const h = cloud.height[i] ?? 0;
    if (h < zMin) zMin = h;
    if (h > zMax) zMax = h;
    const klass = cloud.classification[i] ?? 1;
    if (klass === 2) grounds.push(h);
    if (klass === 6) {
      const x = cloud.positions[i * 3] ?? 0;
      const z = cloud.positions[i * 3 + 2] ?? 0;
      if (Math.abs(x) <= hx && Math.abs(z) <= hz && h > buildingZMax) {
        buildingZMax = h;
      }
    }
  }

  if (!Number.isFinite(buildingZMax)) buildingZMax = zMax;
  const groundZ = grounds.length >= 8 ? median(grounds) : zMin;
  const measuredHeightM = Math.max(0, buildingZMax - groundZ);
  const declaredHeightM = caze?.heightM ?? measuredHeightM;
  const deltaM = measuredHeightM - declaredHeightM;
  const deltaPct = declaredHeightM === 0 ? 0 : (deltaM / declaredHeightM) * 100;

  const origin = cloud.header.origin;
  const classes = Object.entries(cloud.header.classes)
    .map(([k, n]) => ({
      klass: Number(k),
      label: ASPRS_LABEL[Number(k)] ?? `Class ${k}`,
      n,
    }))
    .sort((a, b) => b.n - a.n);

  const spanX = Math.max(1, (cloud.header.bounds.max[0] ?? 1) - (cloud.header.bounds.min[0] ?? 0));
  const spanY = Math.max(1, (cloud.header.bounds.max[1] ?? 1) - (cloud.header.bounds.min[1] ?? 0));
  const density =
    cloud.header.densityPtsM2 || Number((cloud.count / (spanX * spanY)).toFixed(2));

  return {
    pointCount: cloud.count,
    densityPtsM2: density,
    groundZ,
    buildingZMax,
    measuredHeightM,
    declaredHeightM,
    deltaM,
    deltaPct,
    zMin,
    zMax,
    bbox: {
      lat: origin.lat || caze?.lat || 0,
      lng: origin.lng || caze?.lng || 0,
      min: cloud.header.bounds.min,
      max: cloud.header.bounds.max,
    },
    classes,
    pass: Math.abs(deltaPct) <= 2,
  };
}

export function cloudToXyz(cloud: LidarCloud, comment: string): string {
  const lines = [
    `# N3DC synthetic / parsed tile`,
    `# ${comment}`,
    `# ULPIN ${cloud.header.ulpin}`,
    `# linked-case ${cloud.header.caseId ?? ""}`,
    `# CRS ${cloud.header.crs}  datum ${cloud.header.verticalDatum}`,
    `# columns: x_m y_m z_m intensity class`,
  ];
  const stride = Math.max(1, Math.ceil(cloud.count / 4000));
  for (let i = 0; i < cloud.count; i += stride) {
    const x = (cloud.positions[i * 3] ?? 0).toFixed(3);
    const y = (cloud.positions[i * 3 + 2] ?? 0).toFixed(3);
    const z = (cloud.height[i] ?? 0).toFixed(3);
    const inten = Math.round((cloud.intensity[i] ?? 0.5) * 65535);
    const klass = cloud.classification[i] ?? 1;
    lines.push(`${x} ${y} ${z} ${inten} ${klass}`);
  }
  return `${lines.join("\n")}\n`;
}

export function heightDeltaTone(deltaPct: number): "ok" | "warn" | "alert" {
  const a = Math.abs(deltaPct);
  if (a <= 2) return "ok";
  if (a <= 5) return "warn";
  return "alert";
}
