import type { LidarCloud } from "@/lib/lidar-cloud";
import { syntheticLidar } from "@/lib/lidar-synth";
import type { CadastreCase } from "@/lib/types";

let uploaded: LidarCloud | null = null;
let uploadedName: string | null = null;

export function setUploadedCloud(cloud: LidarCloud | null, name: string | null) {
  uploaded = cloud;
  uploadedName = name;
}

export function getUploadedCloud(): { cloud: LidarCloud; name: string } | null {
  if (!uploaded || !uploadedName) return null;
  return { cloud: uploaded, name: uploadedName };
}

export function cloudForCase(caze: CadastreCase, preferUpload: boolean): LidarCloud {
  if (preferUpload && uploaded) {
    if (!uploaded.header.ulpin || uploaded.header.ulpin === caze.ulpin) return uploaded;
  }
  return syntheticLidar(caze);
}
