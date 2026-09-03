import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { ClientOnly } from "@/components/client-only";
import { Cuboid } from "lucide-react";
import { cn } from "@/lib/utils";

const BuildingCanvas = lazy(() => import("@/components/scene/building-canvas"));
const SolarCanvas = lazy(() => import("@/components/scene/solar-canvas"));
const EmergencyCanvas = lazy(() => import("@/components/scene/emergency-canvas"));
const LidarCanvas = lazy(() => import("@/components/scene/lidar-canvas"));

function Skeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-sky">
      <div className="flex flex-col items-center gap-2 text-ink/70">
        <Cuboid className="size-8 animate-pulse" />
        <p className="text-xs font-medium tracking-wide">Loading spatial twin</p>
      </div>
    </div>
  );
}

export function ReviewViewport({ children }: { children?: ReactNode }) {
  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden bg-sky">
      <ClientOnly fallback={<Skeleton />}>
        <Suspense fallback={<Skeleton />}>
          <BuildingCanvas />
        </Suspense>
      </ClientOnly>
      {children}
    </div>
  );
}

export function LidarViewport({ children }: { children?: ReactNode }) {
  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden bg-sky">
      <ClientOnly fallback={<Skeleton />}>
        <Suspense fallback={<Skeleton />}>
          <LidarCanvas />
        </Suspense>
      </ClientOnly>
      {children}
    </div>
  );
}

export function SolarViewport({
  hour,
  day,
  heightM,
}: {
  hour: number;
  day: number;
  heightM: number;
}) {
  const Comp = SolarCanvas as ComponentType<{ hour: number; day: number; heightM: number }>;
  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden bg-sky">
      <ClientOnly fallback={<Skeleton />}>
        <Suspense fallback={<Skeleton />}>
          <Comp hour={hour} day={day} heightM={heightM} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}

export function EmergencyViewport({
  playing,
  runId,
}: {
  playing: boolean;
  runId: number;
}) {
  const Comp = EmergencyCanvas as ComponentType<{ playing: boolean; runId: number }>;
  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden bg-sky">
      <ClientOnly fallback={<Skeleton />}>
        <Suspense fallback={<Skeleton />}>
          <Comp playing={playing} runId={runId} />
        </Suspense>
      </ClientOnly>
    </div>
  );
}

export function EngineMark({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute bottom-3 right-3 text-right", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/50">
        N3DC Engine
      </div>
    </div>
  );
}
