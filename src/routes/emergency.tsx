import { createFileRoute, Link } from "@tanstack/react-router";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { simulateAccess } from "@/lib/access";
import { CasePicker } from "@/components/case-picker";
import { AppShell } from "@/components/layout/app-shell";
import { EmergencyViewport, EngineMark } from "@/components/scene/viewport-frame";
import { Button } from "@/components/ui/button";
import { selectCase, useCadastre } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/emergency")({
  ssr: false,
  component: EmergencyPage,
});

function EmergencyPage() {
  const caze = useCadastre(selectCase);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const [done, setDone] = useState(false);

  const sim = simulateAccess(caze);

  useEffect(() => {
    setPlaying(false);
    setDone(false);
    setRunId((n) => n + 1);
  }, [caze.ulpin]);

  useEffect(() => {
    if (!playing) return;
    const ms = sim.blocked ? 2800 : 4600;
    const t = window.setTimeout(() => setDone(true), ms);
    return () => window.clearTimeout(t);
  }, [playing, runId, sim.blocked]);

  const reset = () => {
    setPlaying(false);
    setDone(false);
    setRunId((n) => n + 1);
  };

  return (
    <AppShell
      title="Fire-Tender Access"
      subtitle="UDCPR clearance route · 3D compound simulation"
      flush
      actions={<CasePicker tone="dark" />}
    >
      <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[42vh] min-h-[240px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <EmergencyViewport playing={playing} runId={runId} />
          <EngineMark />
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-[var(--shadow-panel)]">
            <Button
              size="sm"
              variant={playing ? "outline" : "navy"}
              onClick={() => {
                if (done) {
                  reset();
                  setPlaying(true);
                  return;
                }
                setPlaying((p) => !p);
              }}
            >
              {playing && !done ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing && !done ? "Pause" : "Run simulation"}
            </Button>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
          {done ? (
            <div
              className={cn(
                "absolute left-1/2 top-6 z-20 w-[min(92%,22rem)] -translate-x-1/2 rounded-lg px-3 py-2 text-center text-sm font-semibold text-white shadow-[var(--shadow-panel)]",
                sim.blocked ? "bg-danger" : "bg-ok",
              )}
            >
              {sim.blocked
                ? `BLOCKED — tender cannot pass the ${sim.pinchM.toFixed(1)} m throat. Hydrant H-04 unreachable.`
                : `CLEAR — tender reaches hydrant H-04. ${caze.fireRoadActualM.toFixed(1)} m ≥ ${caze.fireRoadMinM.toFixed(1)} m UDCPR.`}
            </div>
          ) : null}
        </div>

        <aside className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-card lg:max-h-none lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-4 p-4">
            <div
              className={cn(
                "rounded-lg px-3 py-2.5",
                sim.pass ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
              )}
            >
              <div className="text-sm font-semibold">{sim.title}</div>
              <p className="mt-0.5 text-xs opacity-90">
                {caze.project} · {caze.ulpin} · required {caze.fireRoadMinM.toFixed(1)} m · provided{" "}
                {caze.fireRoadActualM.toFixed(1)} m
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {sim.checks.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{c.code}</div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        c.pass ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger",
                      )}
                    >
                      {c.pass ? "Pass" : "Fail"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs">
                    <span className="text-muted-foreground">Required {c.required}</span>
                    <span className="font-medium tabular-nums">{c.actual}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.note}</p>
                </li>
              ))}
            </ul>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Spatial pathfinding on the 3D compound. A 2D plot check cannot prove a 5.6 m tender
              will physically thread the driveway, ramps and turning bay required by Maharashtra
              UDCPR and NBC Part 4. Badge and simulation share the same UDCPR run for this ULPIN.
            </p>

            <Button variant="outline" asChild>
              <Link to="/review">Hold on compliance desk</Link>
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
