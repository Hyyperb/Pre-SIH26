import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Check, Copy, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { CasePicker } from "@/components/case-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { shortHash } from "@/lib/hash";
import { selectCase, useCadastre } from "@/lib/store";
import type { AuditKind } from "@/lib/types";
import { unitsForCase } from "@/lib/units";
import { formatUlpinGroups } from "@/lib/ulpin";
import { cn, copyText } from "@/lib/utils";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
});

const KIND: Record<AuditKind, string> = {
  genesis: "Genesis",
  submit: "Submit",
  validate: "Validate",
  approve: "Approve",
  flag: "Flag",
  transfer: "Transfer",
  amend: "Amend",
};

function AuditPage() {
  const audit = useCadastre((s) => s.audit);
  const verified = useCadastre((s) => s.chainVerified);
  const verify = useCadastre((s) => s.verifyChain);
  const tamper = useCadastre((s) => s.tamper);
  const restore = useCadastre((s) => s.restoreChain);
  const transfer = useCadastre((s) => s.transfer);
  const backup = useCadastre((s) => s.backupAudit);
  const caze = useCadastre(selectCase);

  const [unit, setUnit] = useState("0601");
  const [buyer, setBuyer] = useState("Deshmukh, P.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const first = unitsForCase(caze).find((u) => u.floor > 0);
    setUnit(first?.unit ?? "0601");
  }, [caze.ulpin]);

  const onVerify = async () => {
    const ok = await verify();
    if (ok) toast.success("Chain intact — every prevHash matches");
    else toast.error("Chain broken — a block hash no longer links");
  };

  const onTransfer = async () => {
    setBusy(true);
    try {
      const entry = await transfer({ unit, buyer });
      toast.success(`Title hashed ${shortHash(entry.hash)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Immutable Title Ledger"
      subtitle="Hash-chained v-ULPIN audit trail · National ledger"
      actions={<CasePicker tone="dark" />}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">SHA-256 append-only chain</h2>
            <p className="text-sm text-muted-foreground">
              Approve, flag and convey write a block. There is no edit, only a later amend.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="navy" onClick={() => void onVerify()}>
              {verified === true ? <ShieldCheck className="size-4" /> : <Link2 className="size-4" />}
              Verify chain
            </Button>
            <Button variant="warn" onClick={tamper}>
              <ShieldAlert className="size-4" />
              Simulate tamper
            </Button>
            {backup ? (
              <Button variant="outline" onClick={restore}>
                Restore replica
              </Button>
            ) : null}
          </div>
        </section>

        {verified !== null ? (
          <div
            className={cn(
              "rounded-lg px-4 py-3 text-sm font-medium",
              verified ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
            )}
          >
            {verified
              ? "Verified. Genesis prevHash is 64 zeroes and every subsequent block links."
              : "BREAK. Block #2 hash was altered; block #3 prevHash no longer matches. Title fraud would be caught here."}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <ol className="flex flex-col">
            {audit.map((e, i) => {
              const broken = i > 0 && e.prevHash !== audit[i - 1]?.hash;
              return (
                <li key={`${e.index}-${e.hash}`} className="relative pl-8">
                  {i < audit.length - 1 ? (
                    <span className="absolute left-[11px] top-7 h-full w-px bg-border" />
                  ) : null}
                  <span
                    className={cn(
                      "absolute left-0 top-3 flex size-6 items-center justify-center rounded-full text-[10px] font-bold",
                      broken ? "bg-danger text-white" : "bg-navy text-white",
                    )}
                  >
                    {e.index}
                  </span>
                  <article
                    className={cn(
                      "mb-3 rounded-xl bg-card p-4 shadow-[var(--shadow-border)]",
                      broken && "ring-1 ring-danger",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {KIND[e.kind]}
                        </div>
                        <h3 className="text-sm font-semibold">{e.title}</h3>
                      </div>
                      <time className="text-xs text-muted-foreground">
                        {format(new Date(e.at), "dd MMM yyyy HH:mm")}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{e.detail}</p>
                    <dl className="mt-3 grid gap-1 font-mono text-[10px] text-muted-foreground sm:grid-cols-2">
                      <div className="flex items-center gap-1">
                        <dt>hash</dt>
                        <dd className="truncate text-ink">{shortHash(e.hash)}</dd>
                        <button
                          type="button"
                          className="text-accent"
                          onClick={async () => {
                            const ok = await copyText(e.hash);
                            if (ok) toast.message("Hash copied");
                          }}
                          aria-label="Copy hash"
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                      <div className="truncate">
                        prev {shortHash(e.prevHash)}
                      </div>
                      <div>{e.actor}</div>
                      {e.vUlpin ? <div className="truncate text-accent">{e.vUlpin}</div> : null}
                    </dl>
                  </article>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Record a conveyance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Writes a transfer block for {caze.project}. ULPIN{" "}
                  <span className="font-mono text-ink">{formatUlpinGroups(caze.ulpin)}</span>. The
                  previous occupant is retired; the v-ULPIN state is hashed.
                </p>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="buyer">Buyer</Label>
                  <Input id="buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
                </div>
                <Button disabled={busy || !unit || !buyer} onClick={() => void onTransfer()}>
                  <Check className="size-4" />
                  Seal transfer
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Why the jury cares</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed text-muted-foreground">
                Double-booked flats and silent registry edits die here. Every Approve 3D ULPIN click
                on the compliance desk is a block. Tamper the middle of the chain and Verify fails in
                front of the registrar.
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
