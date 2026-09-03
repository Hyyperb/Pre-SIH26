import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-ink",
        navy: "border-transparent bg-navy text-white",
        ok: "border-transparent bg-ok/15 text-ok",
        warn: "border-transparent bg-warn/15 text-warn",
        danger: "border-transparent bg-danger/15 text-danger",
        review: "border-transparent bg-review/15 text-review",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
