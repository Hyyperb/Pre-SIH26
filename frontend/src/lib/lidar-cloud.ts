import type { N3dcLidarTileHeader, GeoOrigin } from "@/lib/lidar-api";

export interface LidarCloud {
  header: N3dcLidarTileHeader;
  positions: Float32Array;
  rgb: Float32Array;
  intensity: Float32Array;
  classification: Uint8Array;
  height: Float32Array;
  count: number;
}

export function emptyOrigin(lat: number, lng: number, epsg = 32643): GeoOrigin {
  const utmZone = Math.floor((lng + 180) / 6) + 1;
  return {
    lat,
    lng,
    zMsl: 0,
    easting: 0,
    northing: 0,
    utmZone,
    epsg,
  };
}

export function classMask(cloud: LidarCloud, enabled: ReadonlySet<number>): Uint8Array {
  const keep = new Uint8Array(cloud.count);
  for (let i = 0; i < cloud.count; i++) {
    keep[i] = enabled.has(cloud.classification[i] ?? 1) ? 1 : 0;
  }
  return keep;
}
