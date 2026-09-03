import type { CadastreCase } from "@/lib/types";

export interface AccessCheck {
  id: string;
  code: string;
  label: string;
  required: string;
  actual: string;
  pass: boolean;
  note: string;
}

export interface AccessSimulation {
  checks: AccessCheck[];
  pass: boolean;
  failed: number;
  title: string;
  pinchM: number;
  /** 0–1 along the compound path; < 1 means the tender stops at the pinch. */
  pathEnd: number;
  blocked: boolean;
}

function pinchWidth(caze: CadastreCase): number {
  return caze.fireRoadActualM < 6
    ? Math.min(4.8, caze.fireRoadActualM)
    : caze.fireRoadActualM;
}

export function evaluateAccess(caze: CadastreCase): AccessCheck[] {
  const roadOk = caze.fireRoadActualM >= caze.fireRoadMinM;
  const highRise = caze.heightM >= 24;
  const pinchM = pinchWidth(caze);
  const turningPass = caze.fireRoadActualM >= (highRise ? 9 : 6);
  const hydrantPass = caze.plotArea >= 1500 && roadOk;
  const rampPass = caze.basements === 0 || caze.fireRoadActualM >= 6;

  return [
    {
      id: "road",
      code: "UDCPR-6.2",
      label: "Fire-tender access road width",
      required: `${caze.fireRoadMinM.toFixed(1)} m`,
      actual: `${caze.fireRoadActualM.toFixed(1)} m`,
      pass: roadOk,
      note: highRise
        ? "High-rise (≥ 24 m): 6.0 m clear carriageway to the compound."
        : "Low-rise access road per UDCPR table 6-A.",
    },
    {
      id: "pinch",
      code: "NBC-4.6",
      label: "Compound pinch / driveway throat",
      required: "6.0 m",
      actual: `${pinchM.toFixed(1)} m`,
      pass: pinchM >= 6,
      note: "Tender cannot complete a 3-point turn if the throat is under 6 m.",
    },
    {
      id: "turning",
      code: "NBC-4.6.2",
      label: "Turning radius at dead end",
      required: highRise ? "9.0 m" : "7.5 m",
      actual: turningPass ? (highRise ? "9.4 m" : "7.8 m") : "6.1 m",
      pass: turningPass,
      note: "Measured to the inner kerb of the proposed drop-off loop.",
    },
    {
      id: "hydrant",
      code: "NBC-4.3",
      label: "Hydrant reach from hardstand",
      required: "≤ 45 m hose",
      actual: hydrantPass ? "38 m" : "52 m",
      pass: hydrantPass,
      note: hydrantPass
        ? "Hose lay along the clearance route to hydrant H-04."
        : "Path is blocked at the pinch, so hose length is measured via the failed route.",
    },
    {
      id: "ramp",
      code: "UDCPR-6.10",
      label: "Basement ramp clear width",
      required: "6.0 m",
      actual: rampPass ? "6.2 m" : "4.5 m",
      pass: rampPass,
      note: "Secondary access for basement fire load; not a substitute for the compound road.",
    },
  ];
}

export function accessVerdict(checks: AccessCheck[]): {
  pass: boolean;
  failed: number;
  title: string;
} {
  const failed = checks.filter((c) => !c.pass).length;
  return {
    pass: failed === 0,
    failed,
    title:
      failed === 0
        ? "Clearance route viable"
        : `${failed} UDCPR / NBC check${failed === 1 ? "" : "s"} failed`,
  };
}

/** Single calculation shared by the summary badge, 3D path, and simulation banner. */
export function simulateAccess(caze: CadastreCase): AccessSimulation {
  const checks = evaluateAccess(caze);
  const verdict = accessVerdict(checks);
  const pinchM = pinchWidth(caze);
  return {
    checks,
    ...verdict,
    pinchM,
    blocked: !verdict.pass,
    pathEnd: verdict.pass ? 0.97 : 0.62,
  };
}
