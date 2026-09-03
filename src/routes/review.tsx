import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Box,
  Check,
  Flag,
  Hand,
  Layers as LayersIcon,
  Maximize2,
  Move,
  RotateCcw,
  Ruler,
  Scan,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CasePicker } from "@/components/case-picker";
import { AppShell } from "@/components/layout/app-shell";
import { PropertyCard } from "@/components/property-card";
import { EngineMark, ReviewViewport } from "@/components/scene/viewport-frame";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { AuditEntry, CadastreCase, Layers } from "@/lib/types";
import { selectCase, useCadastre } from "@/lib/store";
import { carpetDeltaPct, floorLabel, floorListForCase, formatUlpinGroups } from "@/lib/ulpin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  ssr: false,
  component: ReviewPage,
});

const LAYERS: { key: "building" | "floors" | "parcels" | "encroachments" | "setbacks" | "utilities" | "lidar"; label: string }[] =
  [
    { key: "building", label: "Building Model" },
    { key: "floors", label: "Floor Slices (3D)" },
    { key: "parcels", label: "Parcels (3D)" },
    { key: "encroachments", label: "Encroachments" },
    { key: "setbacks", label: "Setbacks" },
    { key: "utilities", label: "Utilities" },
    { key: "lidar", label: "LIDAR cloud" },
  ];

function ReviewPage() {
  const caze = useCadastre(selectCase);
  const selectedFloor = useCadastre((s) => s.selectedFloor);
  const layers = useCadastre((s) => s.layers);
  const toggleLayer = useCadastre((s) => s.toggleLayer);
  const setFloor = useCadastre((s) => s.setFloor);
  const tool = useCadastre((s) => s.tool);
  const setTool = useCadastre((s) => s.setTool);
  const xray = useCadastre((s) => s.xray);
  const ortho = useCadastre((s) => s.ortho);
  const approve = useCadastre((s) => s.approve);
  const flag = useCadastre((s) => s.flag);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"approve" | "flag" | null>(null);
  const [sealed, setSealed] = useState<AuditEntry | null>(null);
  const [fs, setFs] = useState(false);
  const [mobileLayers, setMobileLayers] = useState(false);

  const delta = carpetDeltaPct(caze.carpetDeclared, caze.carpetMeasured);
  const locked = caze.status === "approved" || caze.status === "rejected";

  const onApprove = async () => {
    setBusy(true);
    try {
      const entry = await approve();
      setSealed(entry);
      toast.success("3D ULPIN sealed to ledger");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const onFlag = async () => {
    setBusy(true);
    try {
      await flag("3D intersection / RERA carpet dispute held pending site inspection.");
      toast.message("Case flagged and held");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Flag failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const tools = useMemo(
    () =>
      [
        { id: "orbit" as const, icon: RotateCcw, label: "Orbit" },
        { id: "pan" as const, icon: Hand, label: "Pan" },
        { id: "measure" as const, icon: Ruler, label: "Measure" },
        { id: "reset" as const, icon: Move, label: "Reset view" },
      ],
    [],
  );

  return (
    <AppShell
      title="REGISTRAR COMPLIANCE CONTROL PANEL"
      subtitle={`${caze.city} · ${caze.authority} · v-ULPIN workspace`}
      flush
      actions={<CasePicker tone="dark" />}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid min-w-0 shrink-0 grid-cols-2 border-b border-border bg-card md:grid-cols-4">
          <div className="min-w-0 px-3 py-1.5 md:px-4 md:py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              3D ULPIN
            </div>
            <div className="truncate font-mono text-[11px] font-semibold tracking-wide sm:text-sm">
              {formatUlpinGroups(caze.ulpin)}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">linked case {caze.id}</div>
          </div>
          <Meta label="Project" value={caze.project} />
          <Meta label="Location" value={caze.location} />
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 md:px-4 md:py-2.5">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </div>
              <StatusBadge status={caze.status} />
            </div>
          </div>
        </div>

        <div className="relative min-h-[38vh] flex-1 md:min-h-0">
          <ReviewViewport>
            <div className="pointer-events-auto absolute left-3 top-3 z-10 hidden w-56 flex-col gap-3 md:flex">
              <Panel title="Layer Controls">
                <LayerList layers={layers} toggleLayer={toggleLayer} />
              </Panel>
              <Panel title="Floor Selector">
                <ScrollArea className="h-56">
                  <FloorList caze={caze} selectedFloor={selectedFloor} setFloor={setFloor} />
                </ScrollArea>
              </Panel>
            </div>

            <button
              type="button"
              className="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-card/95 px-2.5 py-1.5 text-xs font-medium shadow-[var(--shadow-panel)] md:hidden"
              onClick={() => setMobileLayers(true)}
            >
              <LayersIcon className="size-3.5" />
              Layers
            </button>

            {caze.violations.some((v) => v.severity === "warn" || /rera|carpet/i.test(v.code + v.title)) ? (
              <Callout
                tone="warn"
                title={
                  caze.violations.find((v) => v.severity === "warn" || /rera|carpet/i.test(v.code + v.title))
                    ?.title ?? "Warning"
                }
                className="absolute right-4 top-16 z-10 hidden max-w-56 md:block"
              />
            ) : null}
            {layers.encroachments && caze.intersects3d ? (
              <Callout
                tone="danger"
                title={
                  caze.violations.find((v) => v.severity === "alert")?.title ??
                  "Alert: ST_3DIntersects == TRUE (Subsurface Utility Encroachment)"
                }
                className="absolute right-4 top-48 z-10 hidden max-w-64 md:block"
              />
            ) : null}

            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-card/95 p-1 shadow-[var(--shadow-panel)]">
              {tools.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    title={t.label}
                    onClick={() => setTool(t.id)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md text-ink/80 hover:bg-secondary",
                      tool === t.id && "bg-navy text-white hover:bg-navy",
                    )}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
              <button
                type="button"
                title="X-ray floors"
                onClick={() => setTool("xray")}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md hover:bg-secondary",
                  xray && "bg-navy text-white",
                )}
              >
                <Scan className="size-4" />
              </button>
              <button
                type="button"
                title="Orthographic"
                onClick={() => setTool("ortho")}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md hover:bg-secondary",
                  ortho && "bg-navy text-white",
                )}
              >
                <Box className="size-4" />
              </button>
              <button
                type="button"
                title="Fullscreen"
                onClick={() => {
                  const el = document.documentElement;
                  if (!document.fullscreenElement) {
                    void el.requestFullscreen();
                    setFs(true);
                  } else {
                    void document.exitFullscreen();
                    setFs(false);
                  }
                }}
                className="flex size-9 items-center justify-center rounded-md hover:bg-secondary"
              >
                <Maximize2 className="size-4" />
              </button>
            </div>
            <EngineMark />
            <span className="sr-only">{fs ? "Fullscreen" : ""}</span>
          </ReviewViewport>
        </div>

        <div className="grid shrink-0 gap-px border-t border-border bg-border md:grid-cols-2">
          <section className="bg-card px-3 py-2 md:px-4 md:py-3">
            <h2 className="mb-1.5 hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:mb-2 md:block">
              Validation Summary
            </h2>
            <div className="flex flex-wrap gap-2">
              <Chip
                ok={caze.topologyValid}
                danger={!caze.topologyValid}
                icon={<Check className="size-3.5" />}
                label={caze.topologyValid ? "Topology Valid" : "Topology open"}
              />
              <Chip
                warn
                icon={<TriangleAlert className="size-3.5" />}
                label={`RERA Carpet Area ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% Deviation`}
              />
              <Chip
                danger={caze.intersects3d}
                ok={!caze.intersects3d}
                icon={<TriangleAlert className="size-3.5" />}
                label={caze.intersects3d ? "3D Intersection Detected" : "No 3D intersection"}
              />
              {caze.lidarMeasuredHeightM != null ? (
                <Chip
                  ok={Math.abs(caze.lidarMeasuredHeightM - caze.heightM) / caze.heightM <= 0.02}
                  warn={
                    Math.abs(caze.lidarMeasuredHeightM - caze.heightM) / caze.heightM > 0.02 &&
                    Math.abs(caze.lidarMeasuredHeightM - caze.heightM) / caze.heightM <= 0.05
                  }
                  danger={Math.abs(caze.lidarMeasuredHeightM - caze.heightM) / caze.heightM > 0.05}
                  icon={<Scan className="size-3.5" />}
                  label={`LiDAR height ${caze.lidarMeasuredHeightM.toFixed(1)} m vs ${caze.heightM.toFixed(1)} m`}
                />
              ) : null}
            </div>
            <div className="mt-2 hidden flex-wrap gap-3 text-xs md:flex">
              <Link to="/lidar" className="text-accent underline-offset-2 hover:underline">
                LIDAR
              </Link>
              <Link to="/solar" className="text-accent underline-offset-2 hover:underline">
                Solar envelope
              </Link>
              <Link to="/emergency" className="text-accent underline-offset-2 hover:underline">
                Fire access
              </Link>
              <Link to="/audit" className="text-accent underline-offset-2 hover:underline">
                Ledger
              </Link>
              <Link to="/ulpin" className="text-accent underline-offset-2 hover:underline">
                v-ULPIN
              </Link>
            </div>
          </section>
          <section className="bg-card px-3 py-2 md:px-4 md:py-3">
            <h2 className="mb-1.5 hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:mb-2 md:block">
              Recommended Action
            </h2>
            <div className="flex flex-row gap-2">
              <Button
                variant="ok"
                className="flex-1"
                size="sm"
                disabled={locked || busy}
                onClick={() => setConfirm("approve")}
              >
                <Check className="size-4" />
                Approve 3D ULPIN
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                size="sm"
                disabled={locked || busy}
                onClick={() => setConfirm("flag")}
              >
                <Flag className="size-4" />
                Flag Dispute
              </Button>
            </div>
          </section>
        </div>
      </div>

      <Dialog open={confirm !== null} onOpenChange={() => setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "approve" ? "Seal 3D ULPIN?" : "Flag dispute and hold?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "approve"
                ? caze.intersects3d
                  ? "ST_3DIntersects is still TRUE. Approval will be recorded as an exception on the immutable ledger."
                  : "This writes a SHA-256 chained record and issues a vertical ULPIN for the current floor stack."
                : "The case remains on hold. No v-ULPIN is issued until the subsurface clash is cleared."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            {confirm === "approve" ? (
              <Button variant="ok" disabled={busy} onClick={() => void onApprove()}>
                Confirm approve
              </Button>
            ) : (
              <Button variant="danger" disabled={busy} onClick={() => void onFlag()}>
                Confirm hold
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sealed} onOpenChange={() => setSealed(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Property card issued</DialogTitle>
            <DialogDescription>
              Hash-chained to the Pune Urban Region ledger. Copy the v-ULPIN into the registry extract.
            </DialogDescription>
          </DialogHeader>
          <PropertyCard caze={{ ...caze, vUlpin: sealed?.vUlpin ?? caze.vUlpin }} entry={sealed} />
          <DialogFooter>
            <Button variant="outline" asChild>
              <Link to="/audit">Open ledger</Link>
            </Button>
            <Button onClick={() => setSealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={mobileLayers} onOpenChange={setMobileLayers}>
        <SheetContent side="left" className="bg-card text-ink">
          <h2 className="mb-3 text-sm font-semibold">Layers & floors</h2>
          <LayerList layers={layers} toggleLayer={toggleLayer} />
          <h3 className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Floor
          </h3>
          <ScrollArea className="h-64">
            <FloorList caze={caze} selectedFloor={selectedFloor} setFloor={setFloor} />
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-3 py-1.5 md:px-4 md:py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("truncate text-sm font-semibold", mono && "font-mono")}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-card/95 p-3 shadow-[var(--shadow-panel)]">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Callout({
  title,
  tone,
  className,
}: {
  title: string;
  tone: "warn" | "danger";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 text-xs font-semibold leading-snug shadow-[var(--shadow-panel)]",
        tone === "warn" && "bg-floor text-ink",
        tone === "danger" && "bg-danger text-white",
        className,
      )}
    >
      {title}
    </div>
  );
}

function Chip({
  label,
  icon,
  ok,
  warn,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  ok?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        ok && "bg-ok/10 text-ok",
        warn && "bg-warn/10 text-warn",
        danger && "bg-danger/10 text-danger",
      )}
    >
      {icon}
      {label}
    </div>
  );
}

function LayerList({
  layers,
  toggleLayer,
}: {
  layers: Layers;
  toggleLayer: (key: keyof Layers) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {LAYERS.map((l) => (
        <li key={l.key}>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-3.5 accent-navy"
              checked={layers[l.key]}
              onChange={() => toggleLayer(l.key)}
            />
            <span className={cn(l.key === "encroachments" && layers.encroachments && "text-danger")}>
              {l.label}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function FloorList({
  caze,
  selectedFloor,
  setFloor,
}: {
  caze: CadastreCase;
  selectedFloor: number;
  setFloor: (floor: number) => void;
}) {
  const alertFloors = new Set(
    caze.violations.filter((v) => v.floor != null).map((v) => v.floor as number),
  );
  if (caze.intersects3d) alertFloors.add(-Math.min(2, Math.max(1, caze.basements)));
  const list = floorListForCase(caze);
  return (
    <ul className="pr-2">
      {list.map((f) => {
        const active = f === selectedFloor;
        const alert = alertFloors.has(f);
        return (
          <li key={f}>
            <button
              type="button"
              onClick={() => setFloor(f)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
                active && !alert && "bg-floor/25 font-medium text-ink",
                active && alert && "bg-danger/15 font-medium text-danger",
                !active && alert && "text-danger",
                !active && !alert && "hover:bg-secondary",
              )}
            >
              {floorLabel(f, caze.floors)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
