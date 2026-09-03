import { create } from "zustand";
import { CASES, FEATURED_CASE_ID, SEED_AUDIT } from "@/data/cases";
import { genesisHash, sha256Hex } from "@/lib/hash";
import { setUploadedCloud } from "@/lib/lidar-session";
import { parseLidarFile } from "@/lib/lidar-parse";
import { ingestLidarRemote, lidarApiBase, unpackTilePoints } from "@/lib/lidar-api";
import type { LidarCloud } from "@/lib/lidar-cloud";
import { measureLidar } from "@/lib/lidar-metrics";
import { floorElevation, formatVUlpin } from "@/lib/ulpin";
import type {
  AuditEntry,
  CadastreCase,
  CaseStatus,
  Layers,
  ViewportTool,
} from "@/lib/types";

const defaultLayers: Layers = {
  building: true,
  floors: true,
  parcels: true,
  encroachments: true,
  setbacks: true,
  utilities: true,
  lidar: true,
};

const FEATURED_ULPIN =
  CASES.find((c) => c.id === FEATURED_CASE_ID)?.ulpin ?? CASES[0]!.ulpin;

interface CadastreState {
  cases: CadastreCase[];
  audit: AuditEntry[];
  backupAudit: AuditEntry[] | null;
  selectedCaseId: string;
  /** Canonical selection key — 14-digit 3D ULPIN. */
  selectedUlpin: string;
  selectedFloor: number;
  layers: Layers;
  xray: boolean;
  ortho: boolean;
  tool: ViewportTool;
  measurePoints: [number, number, number][];
  chainVerified: boolean | null;
  lidarSource: "synthetic" | "upload" | "api";
  lidarFileName: string | null;
  lidarRevision: number;
  lidarBusy: boolean;
  lidarError: string | null;
  enabledClasses: number[];
  setCase: (id: string) => void;
  setCaseByUlpin: (ulpin: string) => void;
  setFloor: (floor: number) => void;
  toggleLayer: (key: keyof Layers) => void;
  setLayer: (key: keyof Layers, value: boolean) => void;
  setTool: (tool: ViewportTool) => void;
  toggleXray: () => void;
  toggleOrtho: () => void;
  pushMeasure: (p: [number, number, number]) => void;
  clearMeasure: () => void;
  approve: (actor?: string) => Promise<AuditEntry>;
  flag: (reason: string, actor?: string) => Promise<AuditEntry>;
  transfer: (opts: { unit: string; buyer: string; actor?: string }) => Promise<AuditEntry>;
  tamper: () => void;
  restoreChain: () => void;
  verifyChain: () => Promise<boolean>;
  ingestLidar: (file: File) => Promise<void>;
  clearLidarUpload: () => void;
  toggleClass: (klass: number) => void;
  setEnabledClasses: (classes: number[]) => void;
}

function cloneCases(): CadastreCase[] {
  return CASES.map((c) => ({
    ...c,
    setbackRequired: { ...c.setbackRequired },
    setbackActual: { ...c.setbackActual },
    violations: c.violations.map((v) => ({ ...v })),
  }));
}

/** Stamp LiDAR height onto the Building / v-ULPIN record keyed by 14-digit ULPIN. */
function stampByUlpin(
  cases: CadastreCase[],
  ulpin: string,
  cloud: LidarCloud,
): CadastreCase[] {
  const digits = ulpin.replace(/\D/g, "");
  if (digits.length !== 14) return cases;
  const current = cases.find((c) => c.ulpin === digits);
  if (!current) return cases;
  const m = measureLidar(cloud, current);
  return cases.map((c) =>
    c.ulpin === digits
      ? {
          ...c,
          lidarMeasuredHeightM: Number(m.measuredHeightM.toFixed(2)),
          lidarPtsM2: Number(m.densityPtsM2.toFixed(2)),
        }
      : c,
  );
}

async function appendAudit(
  prev: AuditEntry[],
  partial: Omit<AuditEntry, "index" | "hash" | "prevHash">,
): Promise<AuditEntry[]> {
  const last = prev[prev.length - 1];
  const prevHash = last?.hash ?? genesisHash();
  const index = prev.length;
  const payload = JSON.stringify({ ...partial, index, prevHash });
  const hash = await sha256Hex(payload);
  return [...prev, { ...partial, index, hash, prevHash }];
}

const DEFAULT_CLASSES = [2, 3, 4, 5, 6, 9, 11, 13, 14, 17];

function selectPayload(hit: CadastreCase) {
  return {
    selectedUlpin: hit.ulpin,
    selectedCaseId: hit.id,
    selectedFloor: Math.min(6, hit.floors),
    measurePoints: [] as [number, number, number][],
  };
}

export const useCadastre = create<CadastreState>((set, get) => ({
  cases: cloneCases(),
  audit: SEED_AUDIT,
  backupAudit: null,
  selectedCaseId: FEATURED_CASE_ID,
  selectedUlpin: FEATURED_ULPIN,
  selectedFloor: 6,
  layers: defaultLayers,
  xray: false,
  ortho: false,
  tool: "orbit",
  measurePoints: [],
  chainVerified: null,
  lidarSource: "synthetic",
  lidarFileName: null,
  lidarRevision: 0,
  lidarBusy: false,
  lidarError: null,
  enabledClasses: DEFAULT_CLASSES,

  setCase: (id) => {
    const hit = get().cases.find((c) => c.id === id);
    if (hit) set(selectPayload(hit));
  },
  setCaseByUlpin: (ulpin) => {
    const digits = ulpin.replace(/\D/g, "");
    const hit = get().cases.find((c) => c.ulpin === digits);
    if (hit) set(selectPayload(hit));
  },
  setFloor: (floor) => set({ selectedFloor: floor }),
  toggleLayer: (key) =>
    set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setLayer: (key, value) =>
    set((s) => ({ layers: { ...s.layers, [key]: value } })),
  setTool: (tool) => {
    if (tool === "xray") {
      set((s) => ({ xray: !s.xray, tool: s.tool }));
      return;
    }
    if (tool === "ortho") {
      set((s) => ({ ortho: !s.ortho, tool: s.tool }));
      return;
    }
    if (tool === "reset") {
      set({ tool: "orbit", measurePoints: [], xray: false, ortho: false });
      return;
    }
    set({ tool, measurePoints: tool === "measure" ? get().measurePoints : [] });
  },
  toggleXray: () => set((s) => ({ xray: !s.xray })),
  toggleOrtho: () => set((s) => ({ ortho: !s.ortho })),
  pushMeasure: (p) =>
    set((s) => ({
      measurePoints: s.measurePoints.length >= 2 ? [p] : [...s.measurePoints, p],
    })),
  clearMeasure: () => set({ measurePoints: [] }),

  approve: async (actor = "Registrar Officer · Pune") => {
    const current = selectCase(get());
    const { cases, audit, selectedFloor } = get();
    const vUlpin = formatVUlpin(
      current.ulpin,
      selectedFloor,
      "BLDG",
      floorElevation(selectedFloor, current.floors),
      current.floors,
    );
    const nextCases = cases.map((c) =>
      c.ulpin === current.ulpin
        ? { ...c, status: "approved" as CaseStatus, vUlpin }
        : c,
    );
    const nextAudit = await appendAudit(audit, {
      kind: "approve",
      title: `${current.project} — 3D ULPIN approved`,
      detail: current.intersects3d
        ? `Approved with exception: ST_3DIntersects still true. v-ULPIN ${vUlpin}`
        : `v-ULPIN ${vUlpin} sealed. Topology valid.`,
      actor,
      caseId: current.id,
      vUlpin,
      at: new Date().toISOString(),
    });
    set({ cases: nextCases, audit: nextAudit, chainVerified: null });
    return nextAudit[nextAudit.length - 1]!;
  },

  flag: async (reason, actor = "Registrar Officer · Pune") => {
    const current = selectCase(get());
    const { cases, audit } = get();
    const nextCases = cases.map((c) =>
      c.ulpin === current.ulpin ? { ...c, status: "flagged" as CaseStatus } : c,
    );
    const nextAudit = await appendAudit(audit, {
      kind: "flag",
      title: `${current.project} — dispute flagged`,
      detail: `${reason} ULPIN ${current.ulpin}.`,
      actor,
      caseId: current.id,
      vUlpin: current.vUlpin,
      at: new Date().toISOString(),
    });
    set({ cases: nextCases, audit: nextAudit, chainVerified: null });
    return nextAudit[nextAudit.length - 1]!;
  },

  transfer: async ({ unit, buyer, actor = "Sub-Registrar · Pune" }) => {
    const current = selectCase(get());
    const { audit } = get();
    const vUlpin = formatVUlpin(
      current.ulpin,
      get().selectedFloor,
      unit,
      floorElevation(get().selectedFloor, current.floors),
      current.floors,
    );
    const nextAudit = await appendAudit(audit, {
      kind: "transfer",
      title: `${current.project} unit ${unit} conveyed`,
      detail: `Title transferred to ${buyer}. ULPIN ${current.ulpin}. v-ULPIN ${vUlpin}.`,
      actor,
      caseId: current.id,
      vUlpin,
      at: new Date().toISOString(),
    });
    set({ audit: nextAudit, chainVerified: null });
    return nextAudit[nextAudit.length - 1]!;
  },

  tamper: () => {
    const { audit, backupAudit } = get();
    if (audit.length < 4) return;
    set({
      backupAudit: backupAudit ?? audit.map((e) => ({ ...e })),
      chainVerified: null,
      audit: audit.map((e, i) =>
        i === 2
          ? {
              ...e,
              title: `${e.title} [altered]`,
              hash: `deadbeef${e.hash.slice(8)}`,
            }
          : e,
      ),
    });
  },

  restoreChain: () => {
    const { backupAudit, audit } = get();
    set({
      audit: backupAudit ?? audit,
      backupAudit: null,
      chainVerified: null,
    });
  },

  verifyChain: async () => {
    const { audit } = get();
    if (audit.length === 0) {
      set({ chainVerified: true });
      return true;
    }
    if (audit[0]?.prevHash !== genesisHash()) {
      set({ chainVerified: false });
      return false;
    }
    for (let i = 1; i < audit.length; i++) {
      const prev = audit[i - 1];
      const cur = audit[i];
      if (!prev || !cur) continue;
      if (cur.prevHash !== prev.hash) {
        set({ chainVerified: false });
        return false;
      }
    }
    set({ chainVerified: true });
    return true;
  },

  ingestLidar: async (file) => {
    const current = selectCase(get());
    const parcelUlpin = current.ulpin ?? "";
    set({ lidarBusy: true, lidarError: null });
    try {
      const base = lidarApiBase();
      let cloud: LidarCloud;
      if (base) {
        if (parcelUlpin.length !== 14) {
          throw new Error("A 14-digit ULPIN is required to ingest a tile.");
        }
        const tile = await ingestLidarRemote(file, {
          ulpin: parcelUlpin,
          caseId: current.id,
          filename: file.name,
          targetEpsg: 32643,
          verticalDatum: "EGM2008",
        });
        const unpacked = unpackTilePoints(tile);
        cloud = {
          header: tile,
          positions: unpacked.positions,
          rgb: unpacked.colors,
          intensity: unpacked.intensity,
          classification: unpacked.classification,
          height: unpacked.height,
          count: unpacked.positions.length / 3,
        };
        const joinUlpin = (tile.ulpin || parcelUlpin).replace(/\D/g, "");
        setUploadedCloud(cloud, file.name);
        set((s) => ({
          cases: stampByUlpin(s.cases, joinUlpin, cloud),
          lidarSource: "api",
          lidarFileName: file.name,
          lidarRevision: s.lidarRevision + 1,
          lidarBusy: false,
          layers: { ...s.layers, lidar: true },
        }));
        return;
      }
      cloud = await parseLidarFile(file);
      const joinUlpin = (cloud.header.ulpin || parcelUlpin).replace(/\D/g, "") || parcelUlpin;
      cloud.header = {
        ...cloud.header,
        ulpin: joinUlpin || current.ulpin,
        caseId: cloud.header.caseId || current.id,
        city: cloud.header.city || current.city,
        state: cloud.header.state || current.state,
        origin:
          cloud.header.origin.lat && cloud.header.origin.lng
            ? cloud.header.origin
            : {
                ...cloud.header.origin,
                lat: current.lat,
                lng: current.lng,
              },
      };
      setUploadedCloud(cloud, file.name);
      set((s) => ({
        cases: stampByUlpin(s.cases, cloud.header.ulpin, cloud),
        lidarSource: "upload",
        lidarFileName: file.name,
        lidarRevision: s.lidarRevision + 1,
        lidarBusy: false,
        layers: { ...s.layers, lidar: true },
      }));
    } catch (e) {
      set({
        lidarBusy: false,
        lidarError: e instanceof Error ? e.message : "LIDAR ingest failed",
      });
      throw e;
    }
  },

  clearLidarUpload: () => {
    setUploadedCloud(null, null);
    set((s) => ({
      lidarSource: "synthetic",
      lidarFileName: null,
      lidarRevision: s.lidarRevision + 1,
      lidarError: null,
    }));
  },

  toggleClass: (klass) =>
    set((s) => ({
      enabledClasses: s.enabledClasses.includes(klass)
        ? s.enabledClasses.filter((c) => c !== klass)
        : [...s.enabledClasses, klass],
    })),
  setEnabledClasses: (enabledClasses) => set({ enabledClasses }),
}));

/** Active parcel — always resolved by 14-digit ULPIN, never by first-array fallback as the primary key. */
export function selectCase(state: CadastreState): CadastreCase {
  return (
    state.cases.find((c) => c.ulpin === state.selectedUlpin) ??
    state.cases.find((c) => c.id === state.selectedCaseId) ??
    state.cases[0]!
  );
}
