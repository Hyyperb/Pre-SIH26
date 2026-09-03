const DEG = Math.PI / 180;
const PUNE_LAT = 18.5204 * DEG;

export function sunDirection(
  hour: number,
  dayOfYear: number,
  distance = 90,
): [number, number, number] {
  const decl = 23.44 * DEG * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365);
  const ha = (hour - 12) * 15 * DEG;
  const sinAlt =
    Math.sin(PUNE_LAT) * Math.sin(decl) +
    Math.cos(PUNE_LAT) * Math.cos(decl) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAzDenom = Math.cos(alt) || 1e-6;
  const cosAz =
    (Math.sin(decl) * Math.cos(PUNE_LAT) -
      Math.cos(decl) * Math.sin(PUNE_LAT) * Math.cos(ha)) /
    cosAzDenom;
  const az = Math.atan2(-Math.cos(decl) * Math.sin(ha), Math.max(-1, Math.min(1, cosAz)));
  const x = Math.sin(az) * Math.cos(alt) * distance;
  const y = Math.sin(alt) * distance;
  const z = -Math.cos(az) * Math.cos(alt) * distance;
  return [x, y, z];
}

export function sunAltitudeDeg(hour: number, dayOfYear: number): number {
  const [x, y, z] = sunDirection(hour, dayOfYear, 1);
  return (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
}

export function isNeighborLit(opts: {
  hour: number;
  dayOfYear: number;
  buildingH: number;
  gapM: number;
}): { lit: boolean; altDeg: number; shadowM: number } {
  const { hour, dayOfYear, buildingH, gapM } = opts;
  const [x, y, z] = sunDirection(hour, dayOfYear, 1);
  const alt = Math.atan2(y, Math.hypot(x, z));
  const altDeg = (alt * 180) / Math.PI;
  if (alt < 0.14) return { lit: false, altDeg, shadowM: 999 };
  const fromSouth = z > 0.05;
  if (!fromSouth) return { lit: true, altDeg, shadowM: 0 };
  const shadowM = buildingH / Math.tan(alt);
  return { lit: shadowM < gapM + 6, altDeg, shadowM };
}

export function sunlightHoursOnNorthNeighbor(opts: {
  buildingH: number;
  gapM: number;
  dayOfYear: number;
}): number {
  let hours = 0;
  for (let h = 6.5; h <= 17.5; h += 0.25) {
    if (isNeighborLit({ hour: h, dayOfYear: opts.dayOfYear, buildingH: opts.buildingH, gapM: opts.gapM }).lit) {
      hours += 0.25;
    }
  }
  return Math.round(hours * 10) / 10;
}

export function hourlyIllumination(opts: {
  buildingH: number;
  gapM: number;
  dayOfYear: number;
}): { hour: number; lit: boolean; altDeg: number; shadowM: number }[] {
  const rows: { hour: number; lit: boolean; altDeg: number; shadowM: number }[] = [];
  for (let h = 6; h <= 18; h += 1) {
    const sample = isNeighborLit({
      hour: h,
      dayOfYear: opts.dayOfYear,
      buildingH: opts.buildingH,
      gapM: opts.gapM,
    });
    rows.push({ hour: h, ...sample });
  }
  return rows;
}

export const SOLAR_PRESETS = [
  { id: "winter", label: "Winter solstice", day: 355, dateLabel: "21 Dec" },
  { id: "equinox", label: "Equinox", day: 80, dateLabel: "21 Mar" },
  { id: "summer", label: "Summer solstice", day: 172, dateLabel: "21 Jun" },
] as const;

export const LIGHT_EASEMENT_HOURS = 4;
