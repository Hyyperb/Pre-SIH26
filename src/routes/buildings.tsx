import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { lutCss } from "@/lib/lidar-color";
import { useCadastre } from "@/lib/store";
import { useLutInvert } from "@/lib/theme";
import { formatUlpinGroups } from "@/lib/ulpin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/buildings")({
  component: BuildingsPage,
});

function BuildingsPage() {
  const cases = useCadastre((s) => s.cases);
  const setCase = useCadastre((s) => s.setCase);
  const invert = useLutInvert();
  const cities = useMemo(
    () => ["All", "Pune", ...Array.from(new Set(cases.map((c) => c.city))).filter((c) => c !== "Pune")],
    [cases],
  );
  const [city, setCity] = useState("Pune");
  const rows = city === "All" ? cases : cases.filter((c) => c.city === city);
  const maxH = Math.max(...cases.map((c) => c.heightM), 1);

  return (
    <AppShell title="Buildings & Towers" subtitle="Pune Urban · vertical parcels from LIDAR + BIM">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each tower is a stack of 3D parcels, not a 2D footprint. LiDAR-measured height is
          cross-checked against the declared BIM envelope before a v-ULPIN is sealed.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {cities.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCity(c)}
              className={
                city === c
                  ? "rounded-full bg-navy px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full bg-secondary px-3 py-1 text-xs font-medium text-ink hover:bg-muted"
              }
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const measured = c.lidarMeasuredHeightM ?? c.heightM;
            const delta = measured - c.heightM;
            const t = c.heightM / maxH;
            return (
              <Card key={c.ulpin} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold tracking-wide">
                        {formatUlpinGroups(c.ulpin)}
                      </p>
                      <h2 className="mt-0.5 truncate text-base font-semibold">{c.project}</h2>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.ward ?? c.district} · {c.authority}
                      </p>
                      <p className="text-[10px] text-muted-foreground">linked case {c.id}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-secondary"
                    title="Elevation heatmap"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(12, t * 100)}%`, background: lutCss(t, invert) }}
                    />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-md bg-secondary px-1 py-2">
                      <dt className="text-muted-foreground">Floors</dt>
                      <dd className="font-semibold tabular-nums">{c.floors}</dd>
                    </div>
                    <div className="rounded-md bg-secondary px-1 py-2">
                      <dt className="text-muted-foreground">Declared</dt>
                      <dd className="font-semibold tabular-nums">{c.heightM} m</dd>
                    </div>
                    <div className="rounded-md bg-secondary px-1 py-2">
                      <dt className="text-muted-foreground">LiDAR</dt>
                      <dd
                        className={cn(
                          "font-semibold tabular-nums",
                          Math.abs(delta) / c.heightM > 0.02 ? "text-warn" : "text-ok",
                        )}
                      >
                        {measured.toFixed(1)} m
                      </dd>
                    </div>
                  </dl>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {c.ctsNo ? `CTS ${c.ctsNo}` : c.location}
                    {c.vUlpin ? ` · ${c.vUlpin}` : ""}
                  </p>
                  <Button
                    asChild
                    className="mt-auto"
                    onClick={() => setCase(c.id)}
                  >
                    <Link to="/review">
                      Open twin
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
