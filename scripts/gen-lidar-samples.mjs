#!/usr/bin/env node
/**
 * Write three Pune demo XYZ tiles keyed by 14-digit ULPIN.
 * Run: node scripts/gen-lidar-samples.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "lidar-samples");

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function boxShell(push, rng, cx, cy, sx, sy, z0, z1, n, klass) {
  for (let k = 0; k < n; k++) {
    const face = rng();
    let x = 0;
    let y = 0;
    let z = z0 + rng() * (z1 - z0);
    if (face < 0.22) {
      x = cx - sx / 2;
      y = cy + (rng() - 0.5) * sy;
    } else if (face < 0.44) {
      x = cx + sx / 2;
      y = cy + (rng() - 0.5) * sy;
    } else if (face < 0.66) {
      y = cy - sy / 2;
      x = cx + (rng() - 0.5) * sx;
    } else if (face < 0.88) {
      y = cy + sy / 2;
      x = cx + (rng() - 0.5) * sx;
    } else {
      z = z1;
      x = cx + (rng() - 0.5) * sx;
      y = cy + (rng() - 0.5) * sy;
    }
    const scan = 18000 + Math.abs(Math.sin(x * 0.18 + y * 0.04)) * 42000;
    push(x, y, z, scan, klass);
  }
}

function writeTile(spec) {
  const rng = mulberry32(seedFrom(spec.ulpin));
  const lines = [
    `# N3DC demo tile — Pune Urban`,
    `# ULPIN ${spec.ulpin}`,
    `# linked-case ${spec.caseId}`,
    `# ${spec.ward} CTS ${spec.cts} · ${spec.label}`,
    `# CRS EPSG:32643  datum EGM2008`,
    `# columns: x_m y_m z_m intensity class`,
  ];
  const push = (x, y, z, i, c) => {
    lines.push(`${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)} ${Math.round(i)} ${c}`);
  };

  for (let k = 0; k < 1600; k++) {
    const x = (rng() - 0.5) * 90;
    const y = (rng() - 0.5) * 90;
    const nala = Math.abs(x + y * 0.3) < 3.2 ? -1.2 : 0;
    const onRoad = Math.abs(x - 38) < 6 || Math.abs(y - 34) < 6;
    const klass = onRoad ? 11 : 2;
    push(x, y, nala + (rng() - 0.5) * 0.18, 12000 + rng() * 20000, klass);
  }

  boxShell(push, rng, 0, 0, spec.sx, spec.sy, spec.z0, spec.height, spec.facade, 6);
  for (let f = 1; f <= spec.floors; f++) {
    const z = (f / spec.floors) * spec.height;
    for (let k = 0; k < 28; k++) {
      push((rng() - 0.5) * spec.sx, (rng() - 0.5) * spec.sy, z, 24000 + rng() * 18000, 6);
    }
  }

  const neighbors = [
    [-32, -24, 14, 12, spec.height * 0.55],
    [34, -18, 16, 12, spec.height * 0.7],
    [-28, 30, 12, 14, spec.height * 0.45],
    [30, 28, 14, 12, spec.height * 0.6],
  ];
  for (const [cx, cy, sx, sy, h] of neighbors) {
    boxShell(push, rng, cx, cy, sx, sy, 0, h, 280, 6);
  }

  const trees = [
    [18, -16],
    [-16, -14],
    [20, 16],
    [-22, 12],
    [12, 22],
    [-10, -22],
  ];
  for (const [tx, ty] of trees) {
    const h = 3.4 + rng() * 3.2;
    for (let k = 0; k < 70; k++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 1.7;
      push(tx + Math.cos(a) * r, ty + Math.sin(a) * r, 1.2 + rng() * h, 14000 + rng() * 16000, 5);
    }
  }

  for (let t = 0; t < 36; t++) {
    push(-22 + t * 1.3, -14, 8.8 + Math.sin(t * 0.4) * 0.3, 48000, 13);
  }

  const body = `${lines.join("\n")}\n`;
  const path = join(OUT, spec.file);
  writeFileSync(path, body);
  return { path, bytes: body.length, n: lines.length - 6 };
}

mkdirSync(OUT, { recursive: true });

const written = [
  writeTile({
    file: "baner-green-heights.xyz",
    ulpin: "19041856427377",
    caseId: "SR-2026-11345",
    ward: "Baner",
    cts: "47/2A",
    label: "Green Heights Tower",
    height: 32.1,
    z0: -9,
    sx: 22,
    sy: 18,
    floors: 10,
    facade: 2200,
  }),
  writeTile({
    file: "kharadi-skyline.xyz",
    ulpin: "19041855127394",
    caseId: "SR-2026-10902",
    ward: "Kharadi",
    cts: "12/8",
    label: "Skyline Tower",
    height: 156.1,
    z0: -8,
    sx: 28,
    sy: 24,
    floors: 42,
    facade: 2800,
  }),
  writeTile({
    file: "hadapsar-spire.xyz",
    ulpin: "19041851627392",
    caseId: "SR-2026-10844",
    ward: "Hadapsar",
    cts: "MAG-4/1",
    label: "Magarpatta Spire",
    height: 99.8,
    z0: -10,
    sx: 24,
    sy: 20,
    floors: 28,
    facade: 2600,
  }),
];

for (const w of written) {
  console.log(`${w.path}  ${w.n} pts  ${(w.bytes / 1024).toFixed(1)} KB`);
}
