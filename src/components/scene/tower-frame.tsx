import { Edges, Line } from "@react-three/drei";
import * as THREE from "three";
import { COLS, TD, TW } from "@/lib/scene-constants";
import { selectCase, useCadastre } from "@/lib/store";
import { isRoofFloor } from "@/lib/ulpin";
import type { Layers } from "@/lib/types";

const CONCRETE = "#c9c3b6";
const CONCRETE_DARK = "#b7b0a2";
const BASE_H = 3.0;

function columnPositions(): [number, number][] {
  const pts: [number, number][] = [];
  for (let ix = 0; ix < COLS; ix++) {
    for (let iz = 0; iz < COLS; iz++) {
      pts.push([-TW / 2 + ix * (TW / (COLS - 1)), -TD / 2 + iz * (TD / (COLS - 1))]);
    }
  }
  return pts;
}

const COL_POS = columnPositions();

function Slab({
  y,
  floor,
  selected,
  xray,
  encroachment,
}: {
  y: number;
  floor: number;
  selected: boolean;
  xray: boolean;
  encroachment: boolean;
}) {
  const dim = encroachment ? ([TW + 3.2, 0.32, TD] as const) : ([TW, 0.32, TD] as const);
  const x = encroachment ? 1.6 : 0;
  const faded = xray && !selected && floor > 0;
  return (
    <mesh position={[x, y, 0]} castShadow receiveShadow>
      <boxGeometry args={[dim[0], dim[1], dim[2]]} />
      <meshStandardMaterial
        color={encroachment ? "#c45a4a" : CONCRETE}
        roughness={0.88}
        transparent={faded}
        opacity={faded ? 0.18 : 1}
        depthWrite={!faded}
      />
    </mesh>
  );
}

function VolumeHighlight({
  y,
  h,
  color,
  extraX = 0,
}: {
  y: number;
  h: number;
  color: string;
  extraX?: number;
}) {
  return (
    <mesh position={[extraX / 2, y, 0]}>
      <boxGeometry args={[TW + 0.55 + extraX, h, TD + 0.55]} />
      <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
      <Edges color={color} threshold={15} />
    </mesh>
  );
}

function Pipes({ basementDepth }: { basementDepth: number }) {
  const z = -basementDepth + 1.4;
  const segs: { a: [number, number, number]; b: [number, number, number]; c: string; r: number }[] = [
    { a: [-16, z, -14], b: [18, z, -14], c: "#1d6ea8", r: 0.22 },
    { a: [18, z, -14], b: [18, z, 12], c: "#1d6ea8", r: 0.22 },
    { a: [-14, z + 0.8, 10], b: [16, z + 0.8, 4], c: "#c9a227", r: 0.18 },
    { a: [8, z - 0.8, -12], b: [8, z - 0.8, 14], c: "#c2410c", r: 0.16 },
    { a: [8, z - 0.8, 14], b: [-10, z - 0.8, 14], c: "#c2410c", r: 0.16 },
    { a: [-2, z + 0.4, -8], b: [14, z + 0.4, 2], c: "#1a5c86", r: 0.2 },
  ];
  return (
    <group>
      {segs.map((s, i) => {
        const a = new THREE.Vector3(...s.a);
        const b = new THREE.Vector3(...s.b);
        const dir = b.clone().sub(a);
        const len = dir.length();
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        return (
          <mesh key={i} position={mid} quaternion={quat} castShadow>
            <cylinderGeometry args={[s.r, s.r, len, 8]} />
            <meshStandardMaterial color={s.c} metalness={0.55} roughness={0.32} />
          </mesh>
        );
      })}
    </group>
  );
}

export function TowerFrame({
  selectedFloor,
  layers,
  xray,
}: {
  selectedFloor: number;
  layers: Layers;
  xray: boolean;
}) {
  const caze = useCadastre(selectCase);
  const storeys = Math.max(1, caze.floors);
  const below = Math.max(0, caze.basements);
  const fh = caze.heightM / storeys;
  const colH = storeys * fh + below * BASE_H + 0.6;
  const colY = (storeys * fh - below * BASE_H) / 2;
  const encroachmentFloor = caze.intersects3d ? -Math.min(2, Math.max(1, below)) : null;

  const floors: number[] = [];
  for (let f = -below; f <= storeys; f++) {
    if (f === 0) continue;
    floors.push(f);
  }
  floors.push(storeys + 1);

  const slabY = (floor: number) => {
    if (floor < 0) return floor * BASE_H;
    if (isRoofFloor(floor, storeys)) return storeys * fh;
    return (floor - 1) * fh;
  };
  const volumeCenterY = (floor: number) => {
    if (floor < 0) return (floor + 0.5) * BASE_H;
    if (isRoofFloor(floor, storeys)) return storeys * fh + 0.35;
    return (floor - 0.5) * fh;
  };
  const volumeHeight = (floor: number) => {
    if (isRoofFloor(floor, storeys)) return 0.7;
    if (floor < 0) return BASE_H;
    return fh;
  };

  return (
    <group>
      {layers.building
        ? COL_POS.map(([x, z], i) => (
            <mesh key={i} position={[x, colY, z]} castShadow>
              <boxGeometry args={[0.5, colH, 0.5]} />
              <meshStandardMaterial color={CONCRETE_DARK} roughness={0.9} />
            </mesh>
          ))
        : null}

      {layers.building ? (
        <mesh position={[0, colY, 0]} castShadow receiveShadow>
          <boxGeometry args={[4.8, colH, 5.4]} />
          <meshStandardMaterial color="#b4aea1" roughness={0.86} />
        </mesh>
      ) : null}

      {floors.map((f) => {
        const y = slabY(f);
        if (!layers.building && !(layers.floors && f === selectedFloor)) return null;
        const enc = Boolean(layers.encroachments && encroachmentFloor != null && f === encroachmentFloor);
        return (
          <Slab
            key={f}
            y={y}
            floor={f}
            selected={f === selectedFloor}
            xray={xray}
            encroachment={enc}
          />
        );
      })}

      {layers.floors && selectedFloor !== encroachmentFloor ? (
        <VolumeHighlight
          y={volumeCenterY(selectedFloor)}
          h={volumeHeight(selectedFloor) - 0.08}
          color="#e3b341"
        />
      ) : null}

      {layers.encroachments && encroachmentFloor != null ? (
        <VolumeHighlight
          y={volumeCenterY(encroachmentFloor)}
          h={volumeHeight(encroachmentFloor) - 0.08}
          color="#e23d3d"
          extraX={3.2}
        />
      ) : null}

      {layers.setbacks ? (
        <group position={[0, 0.05, 0]}>
          <Line
            points={[
              [-16, 0, -15],
              [16, 0, -15],
              [16, 0, 15],
              [-16, 0, 15],
              [-16, 0, -15],
            ]}
            color="#c9a227"
            lineWidth={1.5}
            dashed
            dashSize={1.2}
            gapSize={0.6}
          />
        </group>
      ) : null}

      {layers.parcels ? (
        <mesh position={[0, storeys * fh * 0.45, 0]}>
          <boxGeometry args={[TW + 4, storeys * fh * 0.95, TD + 4]} />
          <meshBasicMaterial color="#1a5c86" transparent opacity={0.06} depthWrite={false} />
          <Edges color="#1a5c86" />
        </mesh>
      ) : null}

      {layers.utilities && below > 0 ? <Pipes basementDepth={below * BASE_H} /> : null}

      <mesh position={[0, storeys * fh + 0.55, 0]} castShadow>
        <boxGeometry args={[TW + 0.8, 0.5, TD + 0.8]} />
        <meshStandardMaterial color="#b8b2a6" roughness={0.85} />
      </mesh>
    </group>
  );
}
