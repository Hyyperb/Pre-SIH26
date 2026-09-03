import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Shield } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NAV } from "@/components/layout/nav";
import { InvertToggle, ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active =
          item.to === "/"
            ? pathname === "/"
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
        const Icon = item.icon;
        return (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  "lg:justify-center lg:px-0 lg:size-11",
                  active
                    ? "bg-navy-mid text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon className="size-5 shrink-0" strokeWidth={1.75} />
                <span className="lg:sr-only">{item.label}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="hidden lg:block">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
  flush = false,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh min-h-0 bg-paper">
      <aside className="hidden w-16 shrink-0 flex-col items-center bg-navy-deep py-4 lg:flex">
        <Link
          to="/"
          className="mb-6 flex size-10 items-center justify-center rounded-lg bg-navy-mid text-white"
          aria-label="N3DC home"
        >
          <span className="font-mono text-xs font-semibold tracking-tight">3D</span>
        </Link>
        <Rail />
        <div className="mt-auto text-[9px] font-medium uppercase tracking-widest text-white/40">
          N3DC
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-navy px-3 text-white sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/10 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-wide sm:text-base">
                {title}
              </p>
              {subtitle ? (
                <p className="hidden truncate text-xs text-white/70 sm:block">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {actions}
            <InvertToggle />
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs">
              <Shield className="size-3.5" />
              <span className="hidden sm:inline">Registrar Officer</span>
              <span className="sm:hidden">RO</span>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1",
            flush ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {children}
        </main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-navy-deep p-4 text-white">
          <Link to="/" className="mb-6 flex items-center gap-2" onClick={() => setOpen(false)}>
            <span className="flex size-9 items-center justify-center rounded-lg bg-navy-mid font-mono text-xs font-semibold">
              3D
            </span>
            <div>
              <div className="text-sm font-semibold">N3DC</div>
              <div className="text-xs text-white/60">National 3D Cadastre</div>
            </div>
          </Link>
          <Rail onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
