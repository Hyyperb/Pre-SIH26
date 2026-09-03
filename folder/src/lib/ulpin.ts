import { FLOOR_H, BASE_H } from "@/lib/scene-constants";
import type { CadastreCase } from "@/lib/types";

export function encodeUlpin(lat: number, lng: number): string {
  const latN = Math.round((lat + 90) * 1_000_000);
  const lngN = Math.round((lng + 180) * 1_000_000);
  const n = (BigInt(latN) * 1_000_003n + BigInt(lngN)) % 10n ** 14n;
  return n.toString().padStart(14, "0");
}

/** Group a 14-digit ULPIN as 4-4-4-2 for registrar reading. */
export function formatUlpinGroups(ulpin: string): string {
  const d = ulpin.replace(/\D/g, "").padStart(14, "0").slice(0, 14);
  return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12)}`;
}

export function roofFloor(storeys: number): number {
  return storeys + 1;
}

export function isRoofFloor(floor: number, storeys: number): boolean {
  return floor > storeys;
}

/** Roof first, then habitable floors descending, then basements. */
export function floorListFor(storeys: number, basements: number): number[] {
  const list: number[] = [roofFloor(storeys)];
  for (let f = storeys; f >= 1; f--) list.push(f);
  for (let b = 1; b <= basements; b++) list.push(-b);
  return list;
}

export function floorListForCase(caze: Pick<CadastreCase, "floors" | "basements">): number[] {
  return floorListFor(caze.floors, caze.basements);
}

export function formatVUlpin(
  ulpin: string,
  floor: number,
  unit: string,
  elevation: number,
  storeys = 10,
): string {
  const band = floor < 0
    ? `B${Math.abs(floor).toString().padStart(2, "0")}`
    : isRoofFloor(floor, storeys)
      ? "RF"
      : `F${floor.toString().padStart(2, "0")}`;
  const zSign = elevation >= 0 ? "+" : "";
  const unitCode = unit.replace(/[^A-Z0-9]/gi, "").padStart(4, "0").slice(0, 6);
  return `${ulpin}-${band}-${unitCode}-Z${zSign}${elevation.toFixed(1)}`;
}

export function floorElevation(floor: number, storeys = 10): number {
  if (floor < 0) return (floor + 0.5) * BASE_H;
  if (isRoofFloor(floor, storeys)) return storeys * FLOOR_H;
  return (floor - 0.5) * FLOOR_H;
}

export function floorLabel(floor: number, storeys = 10): string {
  if (isRoofFloor(floor, storeys)) return "Roof";
  if (floor < 0) return `Basement ${Math.abs(floor)}`;
  return `Floor ${floor}`;
}

export function carpetDeltaPct(declared: number, measured: number): number {
  if (!declared) return 0;
  return ((measured - declared) / declared) * 100;
}

export function parseVUlpin(value: string): {
  ulpin: string;
  band: string;
  unit: string;
  elevation: number;
} | null {
  const parts = value.trim().split("-");
  if (parts.length < 4) return null;
  const z = parts[parts.length - 1] ?? "";
  const elev = Number(z.replace(/^Z/, ""));
  return {
    ulpin: parts[0] ?? "",
    band: parts[1] ?? "",
    unit: parts[2] ?? "",
    elevation: Number.isFinite(elev) ? elev : 0,
  };
}
