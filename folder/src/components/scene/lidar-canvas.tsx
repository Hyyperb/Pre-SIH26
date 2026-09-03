import { GizmoHelper, GizmoViewport, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { LidarGroundGrid, LidarPoints } from "@/components/scene/lidar-points";
import { CityContext, SceneLights } from "@/components/scene/site-context";
import { TowerFrame } from "@/components/scene/tower-frame";
import { sceneSky } from "@/lib/lidar-color";
import { selectCase, useCadastre } from "@/lib/store";
import { useTheme } from "@/lib/theme";

function Cameras() {
  const ortho = useCadastre((s) => s.ortho);
  return (
    <>
      <PerspectiveCamera makeDefault={!ortho} position={[38, 28, 46]} fov={38} near={0.1} far={400} />
      <OrthographicCamera makeDefault={ortho} position={[38, 32, 46]} zoom={14} near={-200} far={400} />
    </>
  );
}

export default function LidarCanvas() {
  const controls = useRef(null);
  const tool = useCadastre((s) => s.tool);
  const layers = useCadastre((s) => s.layers);
  const selectedFloor = useCadastre((s) => s.selectedFloor);
  const xray = useCadastre((s) => s.xray);
  const caze = useCadastre(selectCase);
  const dark = useTheme((s) => s.mode) === "dark";
  const sky = sceneSky(dark);

  return (
    <Canvas
      key={`${dark ? "night" : "day"}-${caze.ulpin}`}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(sky);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = dark ? 0.92 : 1.05;
      }}
    >
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 90, 240]} />
      <Cameras />
      <SceneLights
        sun={dark ? [28, 46, 22] : [40, 48, 32]}
        intensity={dark ? 0.85 : 1.2}
        dark={dark}
      />
      {layers.building ? (
        <TowerFrame selectedFloor={selectedFloor} layers={{ ...layers, lidar: false }} xray={xray} />
      ) : null}
      {layers.building ? <CityContext /> : null}
      <LidarGroundGrid />
      <LidarPoints force />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enableRotate={tool !== "pan"}
        maxPolarAngle={Math.PI * 0.49}
        minDistance={12}
        maxDistance={140}
        target={[0, 8, 0]}
      />
      <GizmoHelper alignment="top-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={["#c0392b", "#1f8a4c", "#5aa0c8"]}
          labelColor={dark ? "#e6edf5" : "#132033"}
        />
      </GizmoHelper>
    </Canvas>
  );
}
