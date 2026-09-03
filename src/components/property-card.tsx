import { format } from "date-fns";
import type { AuditEntry, CadastreCase } from "@/lib/types";
import { carpetDeltaPct, formatUlpinGroups } from "@/lib/ulpin";
import { shortHash } from "@/lib/hash";

function HashGrid({ hash }: { hash: string }) {
  const bits = hash.replace(/[^0-9a-f]/gi, "").slice(0, 64);
  const cells = bits.split("").map((ch, i) => parseInt(ch, 16) % 2 === 0 || i % 7 === 0);
  return (
    <div
      className="grid size-24 grid-cols-8 gap-px rounded-md bg-navy p-1"
      aria-hidden="true"
    >
      {cells.slice(0, 64).map((on, i) => (
        <div key={i} className={on ? "bg-white" : "bg-navy"} />
      ))}
    </div>
  );
}

export function PropertyCard({
  caze,
  entry,
}: {
  caze: CadastreCase;
  entry?: AuditEntry | null;
}) {
  const delta = carpetDeltaPct(caze.carpetDeclared, caze.carpetMeasured);
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card text-ink">
      <div className="flex items-center justify-between bg-navy px-5 py-3 text-white">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/70">
            Department of Registration & Stamps · Maharashtra
          </p>
          <h3 className="text-sm font-semibold">3D Vertical Property Card</h3>
        </div>
        <div className="text-right font-mono text-[10px] text-white/70">N3DC · v-ULPIN</div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">3D ULPIN</dt>
            <dd className="font-mono text-base font-semibold tracking-wide">{formatUlpinGroups(caze.ulpin)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Project</dt>
            <dd className="font-medium">{caze.project}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Linked case</dt>
            <dd className="font-mono text-xs text-muted-foreground">{caze.id}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">v-ULPIN</dt>
            <dd className="font-mono text-xs text-accent">{caze.vUlpin ?? "Pending seal"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">RERA</dt>
            <dd className="font-mono text-xs">{caze.reraId}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Extents</dt>
            <dd>
              {caze.floors}F + {caze.basements}B · {caze.heightM} m
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Carpet Δ</dt>
            <dd className={delta > 1 ? "text-warn" : "text-ok"}>
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(2)}%
            </dd>
          </div>
        </dl>
        {entry ? <HashGrid hash={entry.hash} /> : <HashGrid hash={caze.ulpin.repeat(5)} />}
      </div>
      {entry ? (
        <div className="border-t border-border px-5 py-3 font-mono text-[10px] text-muted-foreground">
          Sealed {format(new Date(entry.at), "dd MMM yyyy HH:mm")} · {shortHash(entry.hash)}
        </div>
      ) : null}
    </article>
  );
}
