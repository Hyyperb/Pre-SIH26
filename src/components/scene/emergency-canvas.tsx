import { GizmoHelper, GizmoViewport, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CityContext, SceneLights } from "@/components/scene/site-context";
import { TowerFrame } from "@/components/scene/tower-frame";
import { simulateAccess } from "@/lib/access";
import { sceneSky } from "@/lib/lidar-color";
import { selectCase, useCadastre } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const PATH: [number, number, number][] = [
  [42, 0.4, 18],
  [28, 0.4, 18],
  [18, 0.4, 18],
  [12, 0.4, 10],
  [10, 0.4, 0],
  [10, 0.4, -8],
  [4, 0.4, -14],
];

function Truck({ playing, pinchAt, runId }: { playing: boolean; pinchAt: number; runId: number }) {
  const ref = useRef<THREE.Group>(null);
  const tRef = useRef(0);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const curve = useMemo(() => new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(...p))), []);

  useEffect(() => {
    tRef.current = 0;
  }, [runId]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const dt = Math.min(delta, 0.1);
    if (playingRef.current) tRef.current = Math.min(pinchAt, tRef.current + dt * 0.2);
    const t = Math.max(0, Math.min(0.999, tRef.current));
    const p = curve.getPointAt(t);
    const look = curve.getPointAt(Math.min(0.999, t + 0.02));
    ref.current.position.copy(p);
    ref.current.lookAt(look);
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[2.4, 1.1, 5.6]} />
        <meshStandardMaterial color="#9b1b1b" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.45, -0.8]} castShadow>
        <boxGeometry args={[2.2, 0.7, 2.4]} />
        <meshStandardMaterial color="#7a1515" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.55, 1.6]}>
        <boxGeometry args={[0.3, 0.9, 0.3]} />
        <meshStandardMaterial color="#c9a227" />
      </mesh>
    </group>
  );
}

function Roads({ actualM, minM, pass }: { actualM: number; minM: number; pass: boolean }) {
  const throat = Math.max(3.6, actualM);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[26, 0.06, 18]} receiveShadow>
        <planeGeometry args={[36, Math.max(6.2, actualM)]} />
        <meshStandardMaterial color="#5d6168" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[10, 0.06, 4]} receiveShadow>
        <planeGeometry args={[throat, 28]} />
        <meshStandardMaterial color={pass ? "#5a6168" : "#6a4a3a"} roughness={0.9} />
      </mesh>
      <mesh position={[10 + throat / 2 + 0.2, 0.9, 4]} castShadow>
        <boxGeometry args={[0.4, 1.8, 10]} />
        <meshStandardMaterial color="#c4b8a4" />
      </mesh>
      <mesh position={[10 - throat / 2 - 0.2, 0.9, 4]} castShadow>
        <boxGeometry args={[0.4, 1.8, 10]} />
        <meshStandardMaterial color="#c4b8a4" />
      </mesh>
      <mesh position={[4, 0.7, -14]}>
        <cylinderGeometry args={[0.35, 0.35, 1.2, 10]} />
        <meshStandardMaterial color="#b42318" metalness={0.4} roughness={0.4} />
      </mesh>
      <Html position={[10, 2.4, 6]} center>
        <div
          className={
            pass
              ? "rounded-md bg-ok px-2 py-1 text-xs font-semibold text-white"
              : "rounded-md bg-danger px-2 py-1 text-xs font-semibold text-white"
          }
        >
          {actualM.toFixed(1)} m · required {minM.toFixed(1)} m
        </div>
      </Html>
      <Html position={[26, 2.2, 18]} center>
        <div className="rounded-md bg-navy px-2 py-1 text-xs font-semibold text-white">
          Approach
        </div>
      </Html>
      <Html position={[4, 2.6, -14]} center>
        <div className="rounded-md bg-navy px-2 py-1 text-xs font-semibold text-white">
          Hydrant H-04
        </div>
      </Html>
    </group>
  );
}

export default function EmergencyCanvas({ playing, runId }: { playing: boolean; runId: number }) {
  const caze = useCadastre(selectCase);
  const sim = simulateAccess(caze);
  const layers = useCadastre((s) => s.layers);
  const selectedFloor = useCadastre((s) => s.selectedFloor);
  const dark = useTheme((s) => s.mode) === "dark";
  const sky = sceneSky(dark);
  const night = dark;
  const camY = Math.min(48, 18 + caze.heightM * 0.12);

  return (
    <Canvas
      key={caze.ulpin}
      shadows
      dpr={[1, 1.75]}
      frameloop="always"
      camera={{ position: [48, camY, 36], fov: 42, near: 0.1, far: 400 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(sky);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 80, 200]} />
      <SceneLights sun={[30, 50, 20]} dark={night} intensity={night ? 0.5 : 1.35} />
      <TowerFrame
        selectedFloor={selectedFloor}
        layers={{ ...layers, encroachments: false, utilities: false, parcels: false }}
        xray={false}
      />
      <CityContext />
      <Roads actualM={caze.fireRoadActualM} minM={caze.fireRoadMinM} pass={sim.pass} />
      <Line
        points={PATH}
        color={sim.pass ? "#15803d" : "#c2410c"}
        lineWidth={2}
        dashed
        dashSize={1}
        gapSize={0.6}
      />
      <Truck key={runId} playing={playing} pinchAt={sim.pathEnd} runId={runId} />
      <OrbitControls makeDefault enableDamping target={[8, 2, 6]} minDistance={16} maxDistance={140} />
      <GizmoHelper alignment="top-right" margin={[56, 56]}>
        <GizmoViewport
          axisColors={["#c0392b", "#1f8a4c", "#5aa0c8"]}
          labelColor={night ? "#e6edf5" : "#132033"}
        />
      </GizmoHelper>
    </Canvas>
  );
}
