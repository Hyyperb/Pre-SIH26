import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowRight, CircleAlert, Flame, Radar, ShieldCheck, Sun } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REGION_STATS, PMC_TAX_PILOT } from "@/data/cases";
import { useCadastre } from "@/lib/store";
import { formatUlpinGroups } from "@/lib/ulpin";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const cases = useCadastre((s) => s.cases);
  const setCase = useCadastre((s) => s.setCase);
  const audit = useCadastre((s) => s.audit);
  const featured = cases.find((c) => c.id === "SR-2026-11345") ?? cases[0]!;
  const queue = cases.filter((c) => c.status === "under_review");
  const counts = [
    { name: "Review", n: cases.filter((c) => c.status === "under_review").length },
    { name: "Approved", n: cases.filter((c) => c.status === "approved").length },
    { name: "Flagged", n: cases.filter((c) => c.status === "flagged").length },
    { name: "Rejected", n: cases.filter((c) => c.status === "rejected").length },
  ];

  const metrics = [
    { label: "Total buildings", value: REGION_STATS.buildings.toLocaleString("en-IN"), hint: "+3.2% this month" },
    { label: "3D towers", value: REGION_STATS.towers.toLocaleString("en-IN"), hint: "+2.1% this month" },
    { label: "Land parcels", value: REGION_STATS.parcels.toLocaleString("en-IN"), hint: "+1.6% this month" },
    { label: "Active applications", value: String(REGION_STATS.applications), hint: "Live queue" },
    { label: "Approved projects", value: String(REGION_STATS.approved), hint: "+5.6% verified" },
    {
      label: "LIDAR coverage",
      value: `${REGION_STATS.lidarKm2.toLocaleString("en-IN")} km²`,
      hint: "Pune Urban · 260 of 527 km² mapped",
    },
  ];

  return (
    <AppShell title="National 3D Vertical Land & Property Cadastre" subtitle="Pune Urban Region · PMC / PCMC · v-ULPIN · LIDAR">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 sm:p-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {metrics.map((m) => (
            <Card key={m.label} className="relative overflow-hidden pl-1">
              <div className="absolute inset-y-0 left-0 w-1 bg-accent" />
              <CardHeader className="p-4 pb-1">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="font-sans text-xl font-semibold tabular-nums whitespace-nowrap sm:text-2xl">{m.value}</div>
                <div
                  className={cn(
                    "mt-1 text-xs",
                    m.label === "Active applications" ? "text-review" : "text-ok",
                  )}
                >
                  {m.hint}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureLink
            to="/lidar"
            icon={Radar}
            kicker="Airborne · UTM India"
            title="LIDAR vertical mapping"
            body="Drop a LAS tile or fly the synthetic India block. Invert the LUT. Classify ground, building, water."
          />
          <FeatureLink
            to="/solar"
            icon={Sun}
            kicker="Easements Act, 1882"
            title="Shadow & sunlight rights"
            body="Does this tower steal winter light from the north neighbour? Move the sun and find out."
          />
          <FeatureLink
            to="/emergency"
            icon={Flame}
            kicker="UDCPR · NBC Part 4"
            title="Fire-tender access"
            body="A 5.6 m engine has to physically thread the compound. The 4.8 m throat fails."
          />
          <FeatureLink
            to="/audit"
            icon={ShieldCheck}
            kicker="SHA-256 chain"
            title="Immutable title ledger"
            body="Every approve, flag and conveyance is a block. Tamper the middle and Verify breaks."
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Priority ULPIN
                </p>
                <p className="mt-1 font-mono text-lg font-semibold tracking-wide sm:text-xl">
                  {formatUlpinGroups(featured.ulpin)}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{featured.project}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  linked case {featured.id} · {featured.district} · {featured.floors} floors +{" "}
                  {featured.basements} basements
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={featured.status} />
                  <span className="text-xs text-warn">RERA carpet +1.2%</span>
                  <span className="text-xs text-danger">ST_3DIntersects</span>
                </div>
              </div>
              <Button
                asChild
                size="lg"
                onClick={() => setCase(featured.id)}
              >
                <Link to="/review">
                  Open compliance workspace
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-3 border-t border-border text-center text-sm">
              <Stat k="Height" v={`${featured.heightM} m`} />
              <Stat k="Units" v={String(featured.units)} />
              <Stat k="Plot" v={`${featured.plotArea.toLocaleString("en-IN")} m²`} />
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue mix</CardTitle>
            </CardHeader>
            <CardContent className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={counts} barSize={22}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RTooltip
                    cursor={{ fill: "color-mix(in oklab, var(--ink) 6%, transparent)" }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      color: "var(--ink)",
                    }}
                  />
                  <Bar dataKey="n" fill="var(--navy-mid)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Under review</CardTitle>
              <Link to="/applications" className="text-xs font-medium text-accent hover:underline">
                All applications
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col gap-0 px-0">
              {queue.map((c) => (
                <Link
                  key={c.id}
                  to="/review"
                  onClick={() => setCase(c.id)}
                  className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 hover:bg-secondary/60"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold tracking-wide">
                      {formatUlpinGroups(c.ulpin)}
                    </div>
                    <div className="truncate text-sm font-medium">{c.project}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      linked case {c.id} · {c.location}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live system alerts</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <AlertRow
                tone="warn"
                text="Height constraint near Lohegaon OLS — Viman Nagar Heights"
                time="10:30"
              />
              <AlertRow tone="info" text="New LAS tile · Baner 47/2A (PMC / MRSAC)" time="10:15" />
              <AlertRow
                tone="warn"
                text="Subsurface utility clash · Green Heights Basement 2"
                time="Yesterday"
              />
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Button variant="outline" asChild>
                  <Link to="/emergency">Fire access</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/solar">Solar rights</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>PMC 3D Twin drone survey — unregistered subset</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <p className="px-5 pb-3 text-xs text-muted-foreground">
                Published MahaPREIT / PMC pilot figures (₹55.42 cr across 78 properties). This is
                a static replay for the registrar demo — not a live PMC or Bhunaksha feed.
              </p>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 font-medium">Ward office</th>
                    <th className="px-5 py-2 font-medium">Unregistered</th>
                    <th className="px-5 py-2 font-medium">₹ crore</th>
                  </tr>
                </thead>
                <tbody>
                  {PMC_TAX_PILOT.map((row) => (
                    <tr key={row.ward} className="border-t border-border">
                      <td className="px-5 py-2">{row.ward}</td>
                      <td className="px-5 py-2 tabular-nums">{row.n}</td>
                      <td className="px-5 py-2 tabular-nums">{row.crore.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Vertical Property Card</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                MLRC 1966 §148 amendment: every flat gets a VPC with carpet, UDS and
                encumbrances. New MahaRERA projects auto-issue from Jan 2026; existing
                societies apply collectively (₹500 / flat) by Dec 2027.
              </p>
              <p>
                2D Mahabhunaksha still cannot see strata. N3DC is the 3D overlay — not a
                live Bhunaksha socket.
              </p>
              <Button variant="outline" asChild>
                <Link to="/ulpin">Encode a v-ULPIN</Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent ledger events</CardTitle>
              <Link to="/audit" className="text-xs font-medium text-accent hover:underline">
                Open ledger
              </Link>
            </CardHeader>
            <CardContent className="overflow-x-auto px-0">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 font-medium">When</th>
                    <th className="px-5 py-2 font-medium">Event</th>
                    <th className="px-5 py-2 font-medium">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.slice(-4).reverse().map((e) => (
                    <tr key={e.hash} className="border-t border-border">
                      <td className="whitespace-nowrap px-5 py-2.5 text-muted-foreground">
                        {format(new Date(e.at), "dd MMM")}
                      </td>
                      <td className="px-5 py-2.5">{e.title}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">{e.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

function FeatureLink({
  to,
  icon: Icon,
  kicker,
  title,
  body,
}: {
  to: "/solar" | "/emergency" | "/audit" | "/lidar";
  icon: typeof Sun;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl bg-card p-4 shadow-[var(--shadow-border)] transition-colors hover:bg-secondary/40"
    >
      <div className="flex items-center gap-2 text-accent">
        <Icon className="size-4" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">{kicker}</span>
      </div>
      <h2 className="mt-2 text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
        Open module
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="font-semibold tabular-nums">{v}</div>
    </div>
  );
}

function AlertRow({
  text,
  time,
  tone,
}: {
  text: string;
  time: string;
  tone: "warn" | "info";
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex gap-2">
        <CircleAlert
          className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn" : "text-accent")}
        />
        <span>{text}</span>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
    </div>
  );
}
