import { create } from "zustand";

export type ThemeMode = "light" | "dark";
export type LidarLut = "elevation" | "intensity" | "class" | "rgb";

interface ThemeState {
  mode: ThemeMode;
  lidarInvert: boolean;
  lidarLut: LidarLut;
  lidarPointSize: number;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setLidarInvert: (value: boolean) => void;
  toggleLidarInvert: () => void;
  setLidarLut: (lut: LidarLut) => void;
  setLidarPointSize: (n: number) => void;
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem("n3dc-color-mode");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return "dark";
}

function applyDom(mode: ThemeMode) {
  if (typeof document === "undefined") return;
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
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: readStoredMode(),
  lidarInvert: false,
  lidarLut: "elevation",
  lidarPointSize: 0.55,
  setMode: (mode) => {
    applyDom(mode);
    set({ mode });
  },
  toggleMode: () => {
    const mode = get().mode === "dark" ? "light" : "dark";
    applyDom(mode);
    set({ mode });
  },
  setLidarInvert: (lidarInvert) => set({ lidarInvert }),
  toggleLidarInvert: () => set((s) => ({ lidarInvert: !s.lidarInvert })),
  setLidarLut: (lidarLut) => set({ lidarLut }),
  setLidarPointSize: (lidarPointSize) => set({ lidarPointSize }),
}));

export function bootTheme() {
  applyDom(readStoredMode());
}

export function useDark(): boolean {
  return useTheme((s) => s.mode) === "dark";
}

/** Dark mode inverts the LUT so high-intensity returns stay bright on navy. The contrast toggle flips that. */
export function lutInvertFor(mode: ThemeMode, override: boolean): boolean {
  return (mode === "dark") !== override;
}

export function useLutInvert(): boolean {
  const mode = useTheme((s) => s.mode);
  const override = useTheme((s) => s.lidarInvert);
  return lutInvertFor(mode, override);
}
