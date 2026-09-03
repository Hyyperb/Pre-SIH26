import { Contrast, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLutInvert, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const mode = useTheme((s) => s.mode);
  const toggle = useTheme((s) => s.toggleMode);
  const dark = mode === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn("text-white hover:bg-white/10", className)}
          onClick={toggle}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? "Light mode" : "Night ops"}</TooltipContent>
    </Tooltip>
  );
}

export function InvertToggle({ className }: { className?: string }) {
  const invert = useLutInvert();
  const toggle = useTheme((s) => s.toggleLidarInvert);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "text-white hover:bg-white/10",
            invert && "bg-white/15",
            className,
          )}
          onClick={toggle}
          aria-pressed={invert}
          aria-label="Invert LIDAR colour lookup"
        >
          <Contrast className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {invert ? "LUT inverted for night canvas" : "Standard elevation LUT"}
      </TooltipContent>
    </Tooltip>
  );
}
