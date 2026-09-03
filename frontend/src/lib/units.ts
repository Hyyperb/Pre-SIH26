import type { CadastreCase, UnitRecord } from "@/lib/types";
import { floorElevation, formatVUlpin } from "@/lib/ulpin";

export type ConstructionKind = "RES" | "COMM" | "IT" | "PARK";

const OWNERS = [
  "Patil, S.",
  "Kulkarni, A.",
  "Deshpande, R.",
  "Joshi, M.",
  "Shah, N.",
  "Iyer, P.",
  "Mehta, K.",
  "Banerjee, T.",
  "Singh, R.",
  "Nair, V.",
  "Khan, A.",
  "Reddy, L.",
  "Chavan, D.",
  "Gokhale, S.",
  "Pillai, H.",
  "Kulkarni, P.",
  "Bhosale, N.",
  "Apte, V.",
] as const;

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

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

/** Construction / occupancy class derived from the selected ULPIN record. */
export function constructionKind(caze: CadastreCase): ConstructionKind {
  const p = `${caze.project} ${caze.vUlpin ?? ""}`.toLowerCase();
  if (caze.units === 0 || /\bit\b|tech park|parks/.test(p)) return "IT";
  if (/mall|park phase/.test(p)) return "PARK";
  if (/skyline|spire|commercial|llp/.test(p) || caze.heightM >= 100) return "COMM";
  return "RES";
}

function unitCode(kind: ConstructionKind, floor: number, seq: number): string {
  const n = String(seq).padStart(2, "0");
  if (kind === "IT") return `IT${n}`;
  if (kind === "COMM") return `C${floor.toString().padStart(2, "0")}${n}`;
  if (kind === "PARK") return `P${n}`;
  if (floor < 0) return `B${Math.abs(floor)}${n}`;
  return `${floor.toString().padStart(2, "0")}${n}`;
}

/**
 * Deterministic unit register for a 3D ULPIN. Always different across parcels
 * because v-ULPIN is prefixed with the 14-digit legal identifier.
 */
export function unitsForCase(caze: CadastreCase): UnitRecord[] {
  const rng = mulberry32(seedFrom(caze.ulpin));
  const kind = constructionKind(caze);
  const mid = Math.max(1, Math.round(caze.floors / 2));
  const top = caze.floors;
  const floors = Array.from(
    new Set(
      [1, mid, Math.min(top, mid + 2), top, caze.basements > 0 ? -Math.min(2, caze.basements) : 1].filter(
        (f) => f !== 0 && (f > 0 ? f <= caze.floors : Math.abs(f) <= caze.basements),
      ),
    ),
  ).sort((a, b) => b - a);

  const rows: UnitRecord[] = [];
  let seq = 1;
  for (const floor of floors) {
    const perFloor = floor < 0 ? 1 : 2;
    for (let i = 0; i < perFloor; i++) {
      const unit = unitCode(kind, floor, seq);
      const owner =
        floor < 0
          ? kind === "RES"
            ? "Parking — reserved"
            : "Common — services"
          : kind === "IT"
            ? `${caze.developer} · Suite ${seq}`
            : OWNERS[(seedFrom(caze.ulpin) + seq * 17) % OWNERS.length]!;
      const carpet =
        floor < 0
          ? 12 + rng() * 8
          : kind === "COMM" || kind === "IT"
            ? 40 + rng() * 90
            : 58 + rng() * 36;
      const issued = caze.status === "approved";
      rows.push({
        unit,
        floor,
        carpetM2: Number(carpet.toFixed(1)),
        owner,
        vUlpin: formatVUlpin(caze.ulpin, floor, unit, floorElevation(floor, caze.floors), caze.floors),
        status: floor < 0 ? "hold" : issued ? "issued" : "draft",
        kind,
      });
      seq += 1;
    }
  }
  return rows;
}
