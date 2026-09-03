import { selectCase, useCadastre } from "@/lib/store";
import { formatUlpinGroups } from "@/lib/ulpin";
import { cn } from "@/lib/utils";

export function CasePicker({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const cases = useCadastre((s) => s.cases);
  const current = useCadastre(selectCase);
  const setByUlpin = useCadastre((s) => s.setCaseByUlpin);

  return (
    <label className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        className={cn(
          "hidden shrink-0 text-[10px] font-medium uppercase tracking-wider sm:inline",
          tone === "dark" ? "text-white/60" : "text-muted-foreground",
        )}
      >
        ULPIN
      </span>
      <select
        aria-label="Select 3D ULPIN parcel"
        value={current.ulpin}
        onChange={(e) => setByUlpin(e.target.value)}
        className={cn(
          "h-8 max-w-[min(220px,46vw)] truncate rounded-md border px-2 text-xs font-medium",
          tone === "dark"
            ? "border-white/20 bg-white/10 text-white"
            : "border-border bg-card text-ink",
        )}
      >
        {cases.map((c) => (
          <option key={c.ulpin} value={c.ulpin} className="text-ink">
            {formatUlpinGroups(c.ulpin)} · {c.project}
          </option>
        ))}
      </select>
    </label>
  );
}
