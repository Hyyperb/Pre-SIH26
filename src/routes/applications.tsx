import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCadastre } from "@/lib/store";
import type { CaseStatus } from "@/lib/types";
import { carpetDeltaPct, formatUlpinGroups } from "@/lib/ulpin";

export const Route = createFileRoute("/applications")({
  component: ApplicationsPage,
});

const FILTERS: { id: "all" | CaseStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "under_review", label: "Review" },
  { id: "approved", label: "Approved" },
  { id: "flagged", label: "Flagged" },
  { id: "rejected", label: "Rejected" },
];

function ApplicationsPage() {
  const cases = useCadastre((s) => s.cases);
  const setCase = useCadastre((s) => s.setCase);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!needle) return true;
      return (
        c.project.toLowerCase().includes(needle) ||
        c.id.toLowerCase().includes(needle) ||
        c.location.toLowerCase().includes(needle) ||
        c.city.toLowerCase().includes(needle) ||
        c.ulpin.includes(needle)
      );
    });
  }, [cases, q, filter]);

  return (
    <AppShell title="Applications" subtitle="Registrar queue · India">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ULPIN, project, linked case…"
            className="sm:max-w-sm"
          />
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f.id} value={f.id}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="overflow-x-auto rounded-xl bg-card shadow-[var(--shadow-border)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">3D ULPIN</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Filed</th>
                <th className="px-4 py-3 font-medium">Carpet Δ</th>
                <th className="px-4 py-3 font-medium">3D ∩</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const delta = carpetDeltaPct(c.carpetDeclared, c.carpetMeasured);
                return (
                  <tr key={c.ulpin} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link
                        to="/review"
                        onClick={() => setCase(c.id)}
                        className="font-mono text-xs font-semibold tracking-wide text-accent hover:underline"
                      >
                        {formatUlpinGroups(c.ulpin)}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">linked case {c.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.project}</div>
                      <div className="text-xs text-muted-foreground">{c.location}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {format(new Date(c.submittedAt), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3">{c.intersects3d ? "TRUE" : "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matching applications.</p>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
