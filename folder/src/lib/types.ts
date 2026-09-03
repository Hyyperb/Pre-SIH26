export type CaseStatus = "under_review" | "approved" | "flagged" | "rejected";

export type LayerKey =
  | "building"
  | "floors"
  | "parcels"
  | "encroachments"
  | "setbacks"
  | "utilities"
  | "lidar";

export type Layers = Record<LayerKey, boolean>;

export type ViewportTool =
  | "orbit"
  | "pan"
  | "measure"
  | "ortho"
  | "xray"
  | "reset";

export type FloorId = number;

export type VpcStatus = "issued" | "pending" | "society-apply";

export interface Violation {
  code: string;
  severity: "ok" | "warn" | "alert";
  title: string;
  detail: string;
  floor?: FloorId;
}

export interface CadastreCase {
  id: string;
  project: string;
  location: string;
  district: string;
  city: string;
  state: string;
  authority: string;
  status: CaseStatus;
  buildingId: string;
  floors: number;
  basements: number;
  heightM: number;
  lat: number;
  lng: number;
  ulpin: string;
  vUlpin?: string;
  reraId: string;
  carpetDeclared: number;
  carpetMeasured: number;
  topologyValid: boolean;
  intersects3d: boolean;
  setbackRequired: { front: number; side: number; rear: number };
  setbackActual: { front: number; side: number; rear: number };
  owner: string;
  developer: string;
  submittedAt: string;
  units: number;
  plotArea: number;
  fsi: number;
  violations: Violation[];
  fireRoadMinM: number;
  fireRoadActualM: number;
  solarWinterHours: number;
  solarThresholdHours: number;
  lidarPtsM2: number;
  lidarMeasuredHeightM?: number;
  ctsNo?: string;
  ward?: string;
  vpcStatus?: VpcStatus;
  surveySource?: string;
}

export type AuditKind =
  | "genesis"
  | "submit"
  | "validate"
  | "approve"
  | "flag"
  | "transfer"
  | "amend";

export interface AuditEntry {
  index: number;
  kind: AuditKind;
  title: string;
  detail: string;
  actor: string;
  caseId?: string;
  vUlpin?: string;
  at: string;
  hash: string;
  prevHash: string;
}

export interface UnitRecord {
  unit: string;
  floor: number;
  carpetM2: number;
  owner: string;
  vUlpin: string;
  status: "draft" | "issued" | "hold";
  kind?: "RES" | "COMM" | "IT" | "PARK";
}
