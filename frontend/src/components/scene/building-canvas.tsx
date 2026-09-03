import { GizmoHelper, GizmoViewport, Html, OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LidarPoints } from "@/components/scene/lidar-points";
import { CityContext, SceneLights } from "@/components/scene/site-context";
import { TowerFrame } from "@/components/scene/tower-frame";
import { sceneSky } from "@/lib/lidar-color";
import { selectCase, useCadastre } from "@/lib/store";
import { useTheme } from "@/lib/theme";

function MeasureLayer() {
  const points = useCadastre((s) => s.measurePoints);
  const dist = useMemo(() => {
    if (points.length < 2) return null;
    const a = new THREE.Vector3(...points[0]!);
    const b = new THREE.Vector3(...points[1]!);
    return a.distanceTo(b);
  }, [points]);

  return (
    <group>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.28, 12, 12]} />
          <meshBasicMaterial color="#5aa0c8" />
        </mesh>
      ))}
      {points.length === 2 ? (
        <>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[new Float32Array([...points[0]!, ...points[1]!]), 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#5aa0c8" />
          </line>
          <Html position={mid(points[0]!, points[1]!)} center>
            <div className="rounded-md bg-navy px-2 py-1 font-mono text-xs text-white">
              {dist?.toFixed(2)} m
            </div>
          </Html>
        </>
      ) : null}
    </group>
  );
}

function mid(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.8, (a[2] + b[2]) / 2];
}

function PickableSite() {
  const tool = useCadastre((s) => s.tool);
  const push = useCadastre((s) => s.pushMeasure);
  const selectedFloor = useCadastre((s) => s.selectedFloor);
  const layers = useCadastre((s) => s.layers);
  const xray = useCadastre((s) => s.xray);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== "measure") return;
    e.stopPropagation();
    push([e.point.x, e.point.y, e.point.z]);
  };

  return (
    <group onPointerDown={onDown}>
      <TowerFrame selectedFloor={selectedFloor} layers={layers} xray={xray} />
      <CityContext />
      <LidarPoints />
    </group>
  );
}

function Cameras() {
  const ortho = useCadastre((s) => s.ortho);
  return (
    <>
      <PerspectiveCamera makeDefault={!ortho} position={[34, 22, 40]} fov={40} near={0.1} far={400} />
      <OrthographicCamera makeDefault={ortho} position={[34, 28, 40]} zoom={16} near={-200} far={400} />
    </>
  );
}

export default function BuildingCanvas() {
  const controls = useRef(null);
  const tool = useCadastre((s) => s.tool);
  const caze = useCadastre(selectCase);
  const dark = useTheme((s) => s.mode) === "dark";
  const sky = sceneSky(dark);
  const night = dark;

  return (
    <Canvas
      key={caze.ulpin}
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(sky);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = night ? 0.95 : 1.08;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = THREE.PCFShadowMap;
      }}
    >
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 70, night ? 160 : 190]} />
      <Cameras />
      <SceneLights dark={night} intensity={night ? 0.55 : 1.35} />
      <PickableSite />
      <MeasureLayer />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enableRotate={tool !== "pan"}
        enablePan
        maxPolarAngle={Math.PI * 0.49}
        minDistance={16}
        maxDistance={180}
        target={[0, 4, 0]}
      />
      <GizmoHelper alignment="top-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={["#c0392b", "#1f8a4c", "#5aa0c8"]}
          labelColor={night ? "#e6edf5" : "#132033"}
        />
      </GizmoHelper>
      <Html position={[0, -12, 0]} style={{ pointerEvents: "none", opacity: 0, width: 0, height: 0 }}>
        {caze.ulpin}
      </Html>
    </Canvas>
  );
}
