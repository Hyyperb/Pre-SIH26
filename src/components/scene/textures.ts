import * as THREE from "three";

export function makeFacadeTexture(base: string, seed = 1): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = shade(base, -12);
  ctx.fillRect(0, 0, 256, 18);
  const cols = 5;
  const rows = 12;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = (r * 11 + col * 7 + seed) % 4 !== 0;
      ctx.fillStyle = lit ? "#d7e4f0" : "#24313c";
      ctx.fillRect(18 + col * 48, 28 + r * 38, 26, 18);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
