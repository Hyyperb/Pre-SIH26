import type { LidarLut } from "@/lib/theme";
import type { LidarCloud } from "@/lib/lidar-cloud";

/** Turbo-like sequential LUT — reads well on both paper and night ops. */
export function lutColor(t: number, invert: boolean): [number, number, number] {
  const u = invert ? 1 - t : t;
  const x = Math.min(1, Math.max(0, u));
  const r = Math.min(1, Math.max(0, 0.135 + 2.2 * x - 1.65 * x * x));
  const g = Math.min(1, Math.max(0, 0.05 + 3.4 * x - 3.6 * x * x + 0.9 * x * x * x));
  const b = Math.min(1, Math.max(0, 0.55 + 0.4 * Math.sin((x - 0.15) * Math.PI) - 1.1 * x * x));
  return [r, g, b];
}

export function lutCss(t: number, invert: boolean): string {
  const [r, g, b] = lutColor(t, invert);
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

export function classRgb(klass: number): [number, number, number] {
  switch (klass) {
    case 2:
      return [0.55, 0.42, 0.28];
    case 3:
      return [0.42, 0.62, 0.28];
    case 4:
      return [0.28, 0.55, 0.22];
    case 5:
      return [0.14, 0.42, 0.18];
    case 6:
      return [0.82, 0.88, 0.94];
    case 7:
    case 18:
      return [0.85, 0.2, 0.18];
    case 9:
      return [0.18, 0.42, 0.78];
    case 11:
      return [0.28, 0.3, 0.32];
    case 13:
      return [0.95, 0.78, 0.2];
    case 14:
      return [0.9, 0.55, 0.12];
    case 17:
      return [0.55, 0.55, 0.6];
    default:
      return [0.62, 0.66, 0.7];
  }
}

export function paintCloud(
  cloud: LidarCloud,
  lut: LidarLut,
  invert: boolean,
  target?: Float32Array,
): Float32Array {
  const out = target && target.length === cloud.count * 3 ? target : new Float32Array(cloud.count * 3);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < cloud.count; i++) {
    const z = cloud.height[i] ?? 0;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const span = Math.max(0.001, zMax - zMin);
  for (let i = 0; i < cloud.count; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    if (lut === "class") {
      [r, g, b] = classRgb(cloud.classification[i] ?? 1);
      if (invert) {
        r = 1 - r * 0.55;
        g = 1 - g * 0.55;
        b = 1 - b * 0.45;
      }
    } else if (lut === "rgb") {
      r = cloud.rgb[i * 3] ?? 0.7;
      g = cloud.rgb[i * 3 + 1] ?? 0.7;
      b = cloud.rgb[i * 3 + 2] ?? 0.7;
      if (invert) {
        r = Math.min(1, r * 1.35 + 0.08);
        g = Math.min(1, g * 1.35 + 0.08);
        b = Math.min(1, b * 1.45 + 0.12);
      }
    } else if (lut === "intensity") {
      const t = cloud.intensity[i] ?? 0.5;
      [r, g, b] = lutColor(t, invert);
    } else {
      const t = ((cloud.height[i] ?? 0) - zMin) / span;
      [r, g, b] = lutColor(t, invert);
    }
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return out;
}

export function sceneSky(dark: boolean): string {
  return dark ? "#071018" : "#c5d8ea";
}
