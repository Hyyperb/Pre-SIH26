import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { makeFacadeTexture } from "@/components/scene/textures";

const NEIGHBORS: { p: [number, number, number]; s: [number, number, number]; c: string; seed: number }[] = [
  { p: [-42, 14, -36], s: [18, 28, 16], c: "#8aa0b3", seed: 2 },
  { p: [-58, 10, -8], s: [14, 20, 14], c: "#7d93a6", seed: 3 },
  { p: [-48, 18, 28], s: [16, 36, 14], c: "#93a7b8", seed: 4 },
  { p: [48, 16, -32], s: [18, 32, 15], c: "#8499ab", seed: 5 },
  { p: [62, 12, 6], s: [14, 24, 16], c: "#90a4b5", seed: 6 },
  { p: [50, 20, 38], s: [20, 40, 16], c: "#7b90a2", seed: 7 },
  { p: [8, 11, -52], s: [22, 22, 14], c: "#97abbb", seed: 8 },
  { p: [-18, 9, -48], s: [16, 18, 12], c: "#879dad", seed: 9 },
  { p: [22, 8, 56], s: [24, 16, 14], c: "#8ea3b4", seed: 10 },
  { p: [-28, 13, 52], s: [18, 26, 14], c: "#7f95a7", seed: 11 },
  { p: [78, 22, -18], s: [16, 44, 16], c: "#6f8699", seed: 12 },
  { p: [-78, 16, 18], s: [18, 32, 18], c: "#8096a8", seed: 13 },
];

const TREES: [number, number, number][] = [
  [22, 0, -22],
  [28, 0, -18],
  [-24, 0, -22],
  [-30, 0, 18],
  [32, 0, 22],
  [-36, 0, -8],
  [18, 0, 28],
  [-22, 0, 24],
];

function Neighbor({
  p,
  s,
  c,
  seed,
}: {
  p: [number, number, number];
  s: [number, number, number];
  c: string;
  seed: number;
}) {
  const tex = useMemo(() => makeFacadeTexture(c, seed), [c, seed]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial map={tex} roughness={0.72} metalness={0.08} />
    </mesh>
  );
}

function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 2.2, 6]} />
        <meshStandardMaterial color="#5c4033" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <coneGeometry args={[1.5, 3.1, 8]} />
        <meshStandardMaterial color="#3f6b45" roughness={0.85} />
      </mesh>
    </group>
  );
}

export function CityContext({ showNorthHouse = false }: { showNorthHouse?: boolean }) {
  const pitW = 38;
  const pitD = 34;
  const world = 260;
  const ring = (world - pitD) / 2;
  const side = (world - pitW) / 2;

  return (
    <group>
      <mesh position={[0, -0.2, pitD / 2 + ring / 2]} receiveShadow>
        <boxGeometry args={[world, 0.4, ring]} />
        <meshStandardMaterial color="#6d7f58" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.2, -pitD / 2 - ring / 2]} receiveShadow>
        <boxGeometry args={[world, 0.4, ring]} />
        <meshStandardMaterial color="#657656" roughness={0.95} />
      </mesh>
      <mesh position={[pitW / 2 + side / 2, -0.2, 0]} receiveShadow>
        <boxGeometry args={[side, 0.4, pitD]} />
        <meshStandardMaterial color="#70845c" roughness={0.95} />
      </mesh>
      <mesh position={[-pitW / 2 - side / 2, -0.2, 0]} receiveShadow>
        <boxGeometry args={[side, 0.4, pitD]} />
        <meshStandardMaterial color="#6a7c56" roughness={0.95} />
      </mesh>

      <mesh position={[0, -9.3, 0]} receiveShadow>
        <boxGeometry args={[pitW, 0.5, pitD]} />
        <meshStandardMaterial color="#5a3f2c" roughness={1} />
      </mesh>
      <mesh position={[0, -4.7, pitD / 2]} receiveShadow>
        <boxGeometry args={[pitW, 9.2, 0.6]} />
        <meshStandardMaterial color="#6b4d35" roughness={0.95} />
      </mesh>
      <mesh position={[0, -4.7, -pitD / 2]} receiveShadow>
        <boxGeometry args={[pitW, 9.2, 0.6]} />
        <meshStandardMaterial color="#624530" roughness={0.95} />
      </mesh>
      <mesh position={[pitW / 2, -4.7, 0]} receiveShadow>
        <boxGeometry args={[0.6, 9.2, pitD]} />
        <meshStandardMaterial color="#734f36" roughness={0.95} />
      </mesh>
      <mesh position={[-pitW / 2, -4.7, 0]} receiveShadow>
        <boxGeometry args={[0.6, 9.2, pitD]} />
        <meshStandardMaterial color="#5c402c" roughness={0.95} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[90, 0.02, 12]} receiveShadow>
        <planeGeometry args={[18, 220]} />
        <meshStandardMaterial color="#6a6e74" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12, 0.02, 80]} receiveShadow>
        <planeGeometry args={[180, 16]} />
        <meshStandardMaterial color="#6a6e74" roughness={0.9} />
      </mesh>

      {NEIGHBORS.map((n) => (
        <Neighbor key={n.seed} {...n} />
      ))}

      {TREES.map((p) => (
        <Tree key={p.join(",")} position={p} />
      ))}

      {showNorthHouse ? (
        <group position={[0, 0, -28]}>
          <mesh position={[0, 6.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[16, 13, 10]} />
            <meshStandardMaterial color="#c4b8a4" roughness={0.8} />
          </mesh>
          <mesh position={[0, 13.4, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[12, 3.2, 4]} />
            <meshStandardMaterial color="#7a4a3a" roughness={0.85} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}

export function SceneLights({
  sun = [40, 48, 32] as [number, number, number],
  intensity = 1.35,
  dark = false,
}: {
  sun?: [number, number, number];
  intensity?: number;
  dark?: boolean;
}) {
  return (
    <>
      <hemisphereLight args={[dark ? "#1a3048" : "#d7e6f4", dark ? "#0c1014" : "#8a7a62", dark ? 0.35 : 0.55]} />
      <ambientLight intensity={dark ? 0.16 : 0.28} />
      <directionalLight
        position={sun}
        intensity={intensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={2}
        shadow-camera-far={180}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        color={dark ? "#c8d8ea" : "#fff3de"}
      />
    </>
  );
}

export function AxisGizmo() {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return null;
}
