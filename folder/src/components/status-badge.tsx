import { Badge } from "@/components/ui/badge";
import type { CaseStatus } from "@/lib/types";

const MAP: Record<
  CaseStatus,
  { label: string; variant: "ok" | "warn" | "danger" | "review" }
> = {
  under_review: { label: "Under Review", variant: "review" },
  approved: { label: "Approved", variant: "ok" },
  flagged: { label: "Flagged", variant: "warn" },
  rejected: { label: "Rejected", variant: "danger" },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const m = MAP[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
