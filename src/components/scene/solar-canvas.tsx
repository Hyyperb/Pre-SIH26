import { GizmoHelper, GizmoViewport, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { CityContext, SceneLights } from "@/components/scene/site-context";
import { TowerFrame } from "@/components/scene/tower-frame";
import { lutCss, sceneSky } from "@/lib/lidar-color";
import { sunDirection } from "@/lib/sun";
import { selectCase, useCadastre } from "@/lib/store";
import { useLutInvert, useTheme } from "@/lib/theme";

function SunPath({ day }: { day: number }) {
  const pts = useMemo(() => {
    const a: [number, number, number][] = [];
    for (let h = 6; h <= 18; h += 0.5) {
      a.push(sunDirection(h, day, 70));
    }
    return a;
  }, [day]);

  return (
    <group>
      <Line points={pts} color="#e8c15a" lineWidth={1} transparent opacity={0.7} />
      {pts.filter((_, i) => i % 2 === 0).map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.38, 8, 8]} />
          <meshBasicMaterial color="#f3d27a" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function ShadowFan({
  hour,
  day,
  invert,
  height,
}: {
  hour: number;
  day: number;
  invert: boolean;
  height: number;
}) {
  const dir = sunDirection(hour, day, 1);
  if (dir[1] < 0.08) return null;
  const k = height / dir[1];
  const dx = -dir[0] * k;
  const dz = -dir[2] * k;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const color = lutCss(invert ? 0.15 : 0.82, invert);

  return (
    <mesh
      position={[dx / 2, 0.05, dz / 2]}
      rotation={[-Math.PI / 2, 0, -yaw]}
    >
      <planeGeometry args={[24, Math.max(8, len)]} />
      <meshBasicMaterial color={color} transparent opacity={invert ? 0.32 : 0.22} depthWrite={false} />
    </mesh>
  );
}

export default function SolarCanvas({
  hour,
  day,
  heightM,
}: {
  hour: number;
  day: number;
  heightM: number;
}) {
  const caze = useCadastre(selectCase);
  const layers = useCadastre((s) => s.layers);
  const selectedFloor = useCadastre((s) => s.selectedFloor);
  const sun = sunDirection(hour, day, 70);
  const night = sun[1] < 8;
  const sunPos: [number, number, number] = [sun[0], Math.max(sun[1], 4), sun[2]];
  const dark = useTheme((s) => s.mode) === "dark";
  const invert = useLutInvert();
  const daySky = sceneSky(dark);
  const sky = night ? "#1a2a3c" : daySky;
  const camY = Math.min(56, 14 + heightM * 0.12);

  return (
    <Canvas
      key={caze.ulpin}
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [36, camY, 8], fov: 42, near: 0.1, far: 400 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(sky);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 70, 180]} />
      <SceneLights sun={sunPos} intensity={night ? 0.18 : 1.7} dark={night || dark} />
      <mesh position={sunPos}>
        <sphereGeometry args={[2.4, 16, 16]} />
        <meshBasicMaterial color={night ? "#9aa8b8" : "#ffe08a"} />
      </mesh>
      <SunPath day={day} />
      <ShadowFan hour={hour} day={day} invert={invert} height={heightM} />
      <TowerFrame
        selectedFloor={selectedFloor}
        layers={{ ...layers, encroachments: false, utilities: false }}
        xray={false}
      />
      <CityContext showNorthHouse />
      <OrbitControls
        makeDefault
        enableDamping
        maxPolarAngle={Math.PI * 0.48}
        target={[0, Math.min(18, heightM * 0.2), -10]}
        minDistance={18}
        maxDistance={140}
      />
      <GizmoHelper alignment="top-right" margin={[56, 56]}>
        <GizmoViewport
          axisColors={["#c0392b", "#1f8a4c", "#5aa0c8"]}
          labelColor={night || dark ? "#e6edf5" : "#132033"}
        />
      </GizmoHelper>
    </Canvas>
  );
}
