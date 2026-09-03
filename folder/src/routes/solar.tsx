import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
} from "recharts";
import { CasePicker } from "@/components/case-picker";
import { AppShell } from "@/components/layout/app-shell";
import { EngineMark, SolarViewport } from "@/components/scene/viewport-frame";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { selectCase, useCadastre } from "@/lib/store";
import {
  hourlyIllumination,
  LIGHT_EASEMENT_HOURS,
  SOLAR_PRESETS,
  sunlightHoursOnNorthNeighbor,
} from "@/lib/sun";
import { cn, formatHour } from "@/lib/utils";

export const Route = createFileRoute("/solar")({
  ssr: false,
  component: SolarPage,
});

function SolarPage() {
  const caze = useCadastre(selectCase);
  const [hour, setHour] = useState(10.5);
  const [preset, setPreset] = useState<(typeof SOLAR_PRESETS)[number]["id"]>("winter");
  const [height, setHeight] = useState(caze.heightM);
  const [gap, setGap] = useState(28);

  useEffect(() => {
    setHeight(caze.heightM);
  }, [caze.ulpin, caze.heightM]);

  const heightMax = Math.max(80, Math.ceil((caze.heightM + 40) / 10) * 10);

  const day = SOLAR_PRESETS.find((p) => p.id === preset)?.day ?? 355;
  const dateLabel = SOLAR_PRESETS.find((p) => p.id === preset)?.dateLabel ?? "21 Dec";

  const hours = sunlightHoursOnNorthNeighbor({
    buildingH: height,
    gapM: gap,
    dayOfYear: day,
  });
  const pass = hours >= LIGHT_EASEMENT_HOURS;
  const series = useMemo(
    () => hourlyIllumination({ buildingH: height, gapM: gap, dayOfYear: day }),
    [height, gap, day],
  );

  const reduced = Math.max(12, height - 6.3);
  const recovered = sunlightHoursOnNorthNeighbor({
    buildingH: reduced,
    gapM: gap,
    dayOfYear: 355,
  });

  return (
    <AppShell
      title="Shadow & Sunlight Right"
      subtitle="Solar envelope · Indian Easements Act, 1882"
      flush
      actions={<CasePicker tone="dark" />}
    >
      <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[42vh] min-h-[240px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <SolarViewport hour={hour} day={day} heightM={height} />
          <EngineMark />
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-card/95 px-3 py-2 text-xs shadow-[var(--shadow-panel)]">
            <div className="font-medium">{caze.project}</div>
            <div className="text-muted-foreground">
              {dateLabel} · {formatHour(hour)} IST
            </div>
          </div>
        </div>

        <aside className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-card lg:max-h-none lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-4 p-4">
            <div
              className={cn(
                "rounded-lg px-3 py-2.5",
                pass ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
              )}
            >
              <div className="text-sm font-semibold">
                {pass ? "Easement of light satisfied" : "North neighbour under 4 h winter light"}
              </div>
              <p className="mt-0.5 text-xs opacity-90">
                {hours.toFixed(1)} h on 21 Dec against a {LIGHT_EASEMENT_HOURS} h civic threshold.
                Filed BIM run: {caze.solarWinterHours.toFixed(1)} h.
              </p>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Season
              </p>
              <div className="grid grid-cols-3 gap-1">
                {SOLAR_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      "rounded-md px-2 py-2 text-xs font-medium",
                      preset === p.id ? "bg-navy text-white" : "bg-secondary text-ink hover:bg-secondary/80",
                    )}
                  >
                    {p.dateLabel}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">Sun hour</span>
                <span className="font-mono tabular-nums">{formatHour(hour)}</span>
              </div>
              <Slider
                min={6}
                max={18}
                step={0.25}
                value={[hour]}
                onValueChange={(v) => setHour(v[0] ?? 12)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">Proposed height</span>
                <span className="font-mono tabular-nums">{height.toFixed(1)} m</span>
              </div>
              <Slider
                min={12}
                max={heightMax}
                step={0.5}
                value={[height]}
                onValueChange={(v) => setHeight(v[0] ?? caze.heightM)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">Gap to north house</span>
                <span className="font-mono tabular-nums">{gap.toFixed(0)} m</span>
              </div>
              <Slider
                min={8}
                max={40}
                step={1}
                value={[gap]}
                onValueChange={(v) => setGap(v[0] ?? 18)}
              />
            </div>

            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} barSize={10}>
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h) => String(h)}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="altDeg" radius={[3, 3, 0, 0]}>
                    {series.map((row) => (
                      <Cell key={row.hour} fill={row.lit ? "var(--ok)" : "var(--danger)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Green = south façade of the north neighbour still receives beam.
              </p>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Indian Easements Act, 1882 (ss. 4, 15): a prescriptive easement of light cannot be
              extinguished by a new high-rise whose winter solar envelope drops the neighbour below
              four hours of beam. This is the Pune / Mumbai dispute the 2D cadastre cannot see.
            </p>

            <div className="rounded-lg bg-secondary px-3 py-2 text-xs">
              Drop two floors ({reduced.toFixed(1)} m) and winter light recovers to{" "}
              <strong>{recovered.toFixed(1)} h</strong>
              {recovered >= LIGHT_EASEMENT_HOURS ? " — threshold met." : "."}
            </div>

            <Button variant="outline" asChild>
              <Link to="/review">Open compliance workspace</Link>
            </Button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
