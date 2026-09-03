import { useMemo } from "react";
import * as THREE from "three";
import { cloudForCase } from "@/lib/lidar-session";
import { paintCloud } from "@/lib/lidar-color";
import { selectCase, useCadastre } from "@/lib/store";
import { useLutInvert, useTheme } from "@/lib/theme";

function filterCloud(
  positions: Float32Array,
  colors: Float32Array,
  classification: Uint8Array,
  enabled: number[],
) {
  const allow = new Set(enabled);
  let n = 0;
  for (let i = 0; i < classification.length; i++) {
    if (allow.has(classification[i]!)) n += 1;
  }
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let w = 0;
  for (let i = 0; i < classification.length; i++) {
    if (!allow.has(classification[i]!)) continue;
    pos[w * 3] = positions[i * 3]!;
    pos[w * 3 + 1] = positions[i * 3 + 1]!;
    pos[w * 3 + 2] = positions[i * 3 + 2]!;
    col[w * 3] = colors[i * 3]!;
    col[w * 3 + 1] = colors[i * 3 + 1]!;
    col[w * 3 + 2] = colors[i * 3 + 2]!;
    w += 1;
  }
  return { pos, col, n };
}

export function LidarPoints({ force = false }: { force?: boolean }) {
  const caze = useCadastre(selectCase);
  const layers = useCadastre((s) => s.layers);
  const source = useCadastre((s) => s.lidarSource);
  const revision = useCadastre((s) => s.lidarRevision);
  const enabled = useCadastre((s) => s.enabledClasses);
  const lut = useTheme((s) => s.lidarLut);
  const invert = useLutInvert();
  const size = useTheme((s) => s.lidarPointSize);
  const dark = useTheme((s) => s.mode) === "dark";

  const cloud = useMemo(
    () => cloudForCase(caze, source !== "synthetic"),
    [caze, source, revision],
  );

  const painted = useMemo(
    () => paintCloud(cloud, lut, invert),
    [cloud, lut, invert],
  );

  const filtered = useMemo(
    () => filterCloud(cloud.positions, painted, cloud.classification, enabled),
    [cloud, painted, enabled],
  );

  if (!force && !layers.lidar) return null;
  if (filtered.n === 0) return null;

  return (
    <points frustumCulled={false}>
      <bufferGeometry key={`${caze.ulpin}-${revision}-${lut}-${invert}-${enabled.join(",")}-${filtered.n}`}>
        <bufferAttribute attach="attributes-position" args={[filtered.pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[filtered.col, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        vertexColors
        sizeAttenuation
        depthWrite={false}
        transparent
        opacity={dark ? 0.94 : 0.86}
        toneMapped={false}
      />
    </points>
  );
}

export function LidarGroundGrid() {
  const dark = useTheme((s) => s.mode) === "dark";
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: dark ? "#1b3a58" : "#9ab0c4",
        transparent: true,
        opacity: 0.45,
      }),
    [dark],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = -80; i <= 80; i += 10) {
      pts.push(i, 0.02, -80, i, 0.02, 80, -80, 0.02, i, 80, 0.02, i);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  return <lineSegments geometry={geo} material={mat} />;
}
