import { useLayoutEffect } from "react";
import { Toaster } from "sonner";
import { bootTheme, useTheme } from "@/lib/theme";

export function ThemeSync() {
  const mode = useTheme((s) => s.mode);

  useLayoutEffect(() => {
    bootTheme();
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", mode === "dark" ? "#070b12" : "#143056");
    try {
      localStorage.setItem("n3dc-color-mode", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  return (
    <Toaster
      theme={mode}
      position="top-right"
      richColors
      closeButton
      toastOptions={{ className: "font-sans" }}
    />
  );
}
