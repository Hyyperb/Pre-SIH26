import {
  Building2,
  Cuboid,
  Files,
  Fingerprint,
  Flame,
  LayoutDashboard,
  Radar,
  ShieldCheck,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  hint: string;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, hint: "Region overview" },
  { to: "/review", label: "Case Review", icon: Cuboid, hint: "3D compliance workspace" },
  { to: "/lidar", label: "LIDAR", icon: Radar, hint: "Point cloud ingest" },
  { to: "/buildings", label: "Buildings", icon: Building2, hint: "Towers and parcels" },
  { to: "/ulpin", label: "v-ULPIN", icon: Fingerprint, hint: "Vertical identifiers" },
  { to: "/solar", label: "Solar Envelope", icon: Sun, hint: "Shadow & light easement" },
  { to: "/emergency", label: "Fire Access", icon: Flame, hint: "UDCPR clearance routes" },
  { to: "/audit", label: "Audit Ledger", icon: ShieldCheck, hint: "Immutable title trail" },
  { to: "/applications", label: "Applications", icon: Files, hint: "Registrar queue" },
];
