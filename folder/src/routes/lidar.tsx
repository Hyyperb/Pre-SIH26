import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Contrast,
  Copy,
  Download,
  FileUp,
  RotateCcw,
  Scan,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CasePicker } from "@/components/case-picker";
import { AppShell } from "@/components/layout/app-shell";
import { EngineMark, LidarViewport } from "@/components/scene/viewport-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { LIDAR_DEMOS } from "@/data/cases";
import { ASPRS_LABEL, BACKEND_CURL, LIDAR_ACCEPT, lidarApiBase } from "@/lib/lidar-api";
import { lutCss } from "@/lib/lidar-color";
import { cloudToXyz, heightDeltaTone, measureLidar } from "@/lib/lidar-metrics";
import { cloudForCase } from "@/lib/lidar-session";
import { selectCase, useCadastre } from "@/lib/store";
import { useLutInvert, useTheme, type LidarLut } from "@/lib/theme";
import { formatUlpinGroups } from "@/lib/ulpin";
import { cn, copyText } from "@/lib/utils";

export const Route = createFileRoute("/lidar")({
  ssr: false,
  component: LidarPage,
});

const LUTS: { id: LidarLut; label: string }[] = [
  { id: "elevation", label: "Elevation" },
  { id: "intensity", label: "Intensity" },
  { id: "class", label: "ASPRS class" },
  { id: "rgb", label: "RGB" },
];

const CLASS_FILTERS = [2, 3, 5, 6, 9, 11, 13, 14];

function LidarPage() {
  const caze = useCadastre(selectCase);
  const ingest = useCadastre((s) => s.ingestLidar);
  const clear = useCadastre((s) => s.clearLidarUpload);
  const setByUlpin = useCadastre((s) => s.setCaseByUlpin);
  const busy = useCadastre((s) => s.lidarBusy);
  const err = useCadastre((s) => s.lidarError);
  const source = useCadastre((s) => s.lidarSource);
  const fileName = useCadastre((s) => s.lidarFileName);
  const revision = useCadastre((s) => s.lidarRevision);
  const enabled = useCadastre((s) => s.enabledClasses);
  const toggleClass = useCadastre((s) => s.toggleClass);
  const lut = useTheme((s) => s.lidarLut);
  const setLut = useTheme((s) => s.setLidarLut);
  const invert = useLutInvert();
  const toggleInvert = useTheme((s) => s.toggleLidarInvert);
  const size = useTheme((s) => s.lidarPointSize);
  const setSize = useTheme((s) => s.setLidarPointSize);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const remote = Boolean(lidarApiBase());

  const cloud = useMemo(
    () => cloudForCase(caze, source !== "synthetic"),
    [caze, source, revision],
  );
  const metrics = useMemo(() => measureLidar(cloud, caze), [cloud, caze]);
  const tone = heightDeltaTone(metrics.deltaPct);
  const ulpinShown = formatUlpinGroups(cloud.header.ulpin || caze.ulpin);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await ingest(file);
      toast.success(`ULPIN ${caze.ulpin} · loaded ${file.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ingest failed");
    }
  };

  const loadDemo = async (demo: (typeof LIDAR_DEMOS)[number]) => {
    setByUlpin(demo.ulpin);
    try {
      const res = await fetch(demo.file);
      if (!res.ok) throw new Error("Demo tile missing");
      const blob = await res.blob();
      const file = new File([blob], demo.file.split("/").pop() ?? "demo.xyz", {
        type: "text/plain",
      });
      await ingest(file);
      toast.success(`Tile for ULPIN ${formatUlpinGroups(demo.ulpin)}`);
    } catch {
      clear();
      toast.message(`Synthetic ${demo.ward} block · ULPIN ${formatUlpinGroups(demo.ulpin)}`);
    }
  };

  const downloadXyz = () => {
    const text = cloudToXyz(cloud, `ULPIN ${caze.ulpin} · ${caze.project} · ${caze.location}`);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${caze.ulpin}.xyz`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyContract = async (kind: "curl" | "python") => {
    if (kind === "python") {
      const res = await fetch("/n3dc_lidar_ingest.py");
      const text = await res.text();
      const ok = await copyText(text);
      if (ok) toast.message("Python ingest service copied — send to backend");
      return;
    }
    const ok = await copyText(BACKEND_CURL);
    if (ok) toast.message("cURL snippet copied");
  };

  return (
    <AppShell
      title="LIDAR Ingest & Vertical Mapping"
      subtitle={`${ulpinShown} · ${caze.city} · EPSG:32643`}
      flush
      actions={<CasePicker tone="dark" />}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="relative h-[44vh] min-h-[260px] min-w-0 shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <LidarViewport>
            <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-card/95 px-3 py-2.5 shadow-[var(--shadow-panel)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                3D ULPIN
              </div>
              <div className="font-mono text-base font-semibold tracking-wide text-ink sm:text-lg">
                {ulpinShown}
              </div>
              <div className="mt-0.5 text-xs font-medium">{caze.project}</div>
              <div className="text-[11px] text-muted-foreground">
                linked case {caze.id}
                {caze.ctsNo ? ` · CTS ${caze.ctsNo}` : ""}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {metrics.pointCount.toLocaleString("en-IN")} pts · {metrics.densityPtsM2.toFixed(1)}{" "}
                pts/m² · {source === "synthetic" ? "synthetic Pune block" : fileName}
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex overflow-hidden rounded-md text-[10px] font-medium shadow-[var(--shadow-panel)]">
              {Array.from({ length: 8 }, (_, i) => (
                <span
                  key={i}
                  className="h-2 w-6"
                  style={{ background: lutCss(i / 7, invert) }}
                />
              ))}
            </div>
            <EngineMark />
          </LidarViewport>
        </div>

        <aside className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-border bg-card lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-4 p-4">
            <div className="rounded-lg bg-navy px-3 py-3 text-white">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                3D ULPIN — legal identifier
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tracking-wide">
                {ulpinShown}
              </div>
              <div className="mt-1 text-[11px] text-white/55">
                linked case {caze.id} · {caze.ward ?? caze.location}
              </div>
            </div>

            <div
              className={cn(
                "rounded-lg px-3 py-2.5",
                tone === "ok" && "bg-ok/10 text-ok",
                tone === "warn" && "bg-warn/10 text-warn",
                tone === "alert" && "bg-danger/10 text-danger",
              )}
            >
              <div className="text-sm font-semibold">
                LiDAR height {metrics.measuredHeightM.toFixed(1)} m vs declared{" "}
                {metrics.declaredHeightM.toFixed(1)} m
              </div>
              <p className="mt-0.5 text-xs opacity-90">
                Stamped onto ULPIN {caze.ulpin}. Δ {metrics.deltaM >= 0 ? "+" : ""}
                {metrics.deltaM.toFixed(2)} m ({metrics.deltaPct >= 0 ? "+" : ""}
                {metrics.deltaPct.toFixed(1)}%) · ground {metrics.groundZ.toFixed(2)} m · class-6
                roof {metrics.buildingZMax.toFixed(2)} m.{" "}
                {tone === "ok" ? "Inside RERA 2% band." : "Cross-check BIM before seal."}
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                void onFile(e.dataTransfer.files[0]);
              }}
              className={cn(
                "rounded-xl border border-dashed px-4 py-5 text-center",
                drag ? "border-accent bg-accent/10" : "border-border bg-secondary/40",
              )}
            >
              <FileUp className="mx-auto size-6 text-accent" />
              <p className="mt-2 text-sm font-medium">Drop LAS / XYZ / N3DC tile</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Joins on ULPIN {formatUlpinGroups(caze.ulpin)}. Browser reads uncompressed LAS and
                XYZ.{" "}
                {remote
                  ? "LAZ/E57 POST to the ingest API."
                  : "LAZ and E57 need the backend ingest service — not live in this demo."}
              </p>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={LIDAR_ACCEPT.join(",")}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                  {busy ? "Reading…" : "Choose file"}
                </Button>
                <Button size="sm" variant="outline" onClick={clear}>
                  <RotateCcw className="size-3.5" />
                  Synthetic
                </Button>
              </div>
              {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
            </div>

            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Pune demo tiles
              </h2>
              <div className="mt-2 flex flex-col gap-1.5">
                {LIDAR_DEMOS.map((d) => {
                  const active = caze.ulpin === d.ulpin;
                  return (
                    <button
                      key={d.ulpin}
                      type="button"
                      onClick={() => void loadDemo(d)}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-left",
                        active ? "bg-navy text-white" : "bg-secondary text-ink hover:bg-muted",
                      )}
                    >
                      <div className="font-mono text-sm font-semibold tracking-wide">
                        {formatUlpinGroups(d.ulpin)}
                      </div>
                      <div className="mt-0.5 text-xs font-medium">
                        {d.ward} CTS {d.cts} · {d.label}
                      </div>
                      <div
                        className={cn(
                          "text-[10px]",
                          active ? "text-white/55" : "text-muted-foreground",
                        )}
                      >
                        linked case {d.caseId}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Colour lookup
              </h2>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {LUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLut(l.id)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium",
                      lut === l.id ? "bg-navy text-white" : "bg-secondary text-ink hover:bg-muted",
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleInvert}
                className={cn(
                  "mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs font-medium",
                  invert ? "bg-accent text-accent-foreground" : "bg-secondary text-ink",
                )}
              >
                <Contrast className="size-3.5" />
                {invert ? "LUT inverted (night)" : "Standard LUT"}
              </button>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>Point size</span>
                  <span className="tabular-nums">{size.toFixed(2)}</span>
                </div>
                <Slider
                  value={[size]}
                  min={0.16}
                  max={0.9}
                  step={0.02}
                  onValueChange={(v) => setSize(v[0] ?? 0.42)}
                />
              </div>
            </div>

            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                ASPRS classes
              </h2>
              <ul className="mt-2 space-y-1">
                {CLASS_FILTERS.map((k) => {
                  const n = cloud.header.classes[String(k)] ?? 0;
                  const on = enabled.includes(k);
                  return (
                    <li key={k}>
                      <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="size-3.5 accent-accent"
                            checked={on}
                            onChange={() => toggleClass(k)}
                          />
                          {ASPRS_LABEL[k] ?? `Class ${k}`}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {n.toLocaleString("en-IN")}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <Card className="shadow-none">
              <CardHeader className="p-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Scan className="size-3.5 text-accent" />
                  Tile header
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-0 font-mono text-[11px]">
                <div className="col-span-2">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    3D ULPIN
                  </div>
                  <div className="text-sm font-semibold tracking-wide text-ink">{ulpinShown}</div>
                </div>
                <Meta k="CTS" v={caze.ctsNo ?? "—"} />
                <Meta k="CRS" v={cloud.header.crs || "EPSG:32643"} />
                <Meta k="Datum" v={cloud.header.verticalDatum || "EGM2008"} />
                <Meta
                  k="Origin"
                  v={
                    metrics.bbox.lat
                      ? `${metrics.bbox.lat.toFixed(4)}° N, ${metrics.bbox.lng.toFixed(4)}° E`
                      : "local metres"
                  }
                />
                <Meta
                  k="Elevation"
                  v={`${metrics.zMin.toFixed(1)} – ${metrics.zMax.toFixed(1)} m`}
                />
                <Meta k="Ward" v={caze.ward ?? caze.location} />
                <Meta k="Sensor" v={cloud.header.sensor} />
                <div className="col-span-2">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    Linked case
                  </div>
                  <div className="truncate text-muted-foreground">{caze.id}</div>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg bg-secondary/60 p-3">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Backend contract
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                ULPIN is the required join key. caseId is an audit reference only. LAZ, E57, EPSG
                reprojection, EGM2008 and Bhunaksha parcel clip live on the GIS service — they are
                not stubbed as live in this browser.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyContract("curl")}>
                  <Copy className="size-3.5" />
                  Copy cURL
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyContract("python")}>
                  <Copy className="size-3.5" />
                  Copy Python
                </Button>
                <Button size="sm" variant="navy" asChild>
                  <a href="/n3dc_lidar_ingest.py" download>
                    <Download className="size-3.5" />
                    Download .py
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={downloadXyz}>
                  <Download className="size-3.5" />
                  This XYZ
                </Button>
              </div>
              <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-navy-deep p-2 font-mono text-[10px] leading-relaxed text-white/80">
                {BACKEND_CURL}
              </pre>
            </div>

            <Button variant="outline" asChild>
              <Link to="/review">Open this ULPIN in case review</Link>
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="truncate text-ink">{v}</div>
    </div>
  );
}
