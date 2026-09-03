"""
lidar_building_extractor.py
============================

Point cloud -> 3D building model extractor.

Turns a classified aerial LiDAR point cloud (LAS/LAZ, ASPRS classification
codes) into per-building footprints (Shapefile / GeoDataFrame), extruded
meshes (PLY), and an optional ground DEM (GeoTIFF).

This is a cleaned-up, batch-ready rewrite of an exploratory notebook
pipeline. Fixes applied relative to the original notebook:

  * The `height` used to extrude each building's mesh is now recomputed
    per cluster. In the original loop, `height` was left over from the
    single-building walkthrough (step 7) and silently reused for every
    building in the batch loop (step 12) -- every mesh in the batch would
    have had the SAME height.
  * The raster/DEM section referenced `dem_array` and `transform` that
    were never defined -- `dem_array` is now allocated from the point
    extent and `transform` is built with `rasterio.transform.from_origin`.
  * Degenerate / tiny clusters that make alphashape return `None`, an
    empty geometry, or a MultiPolygon are now skipped instead of crashing
    the batch loop.
  * Ground level is (re)sampled from the k nearest ground points to each
    building's footprint, not a stale `sample` object from a previous
    iteration.
  * Visualization (`o3d.visualization.draw_geometries`) is opt-in via
    `.show()`, not fired automatically -- headless / server use won't try
    to open a window.

Requires: numpy, pandas, laspy, open3d, alphashape, geopandas, shapely,
rasterio.

Basic usage
-----------
    from lidar_building_extractor import BuildingExtractor, ExtractorConfig

    cfg = ExtractorConfig(
        building_class=6,
        ground_class=2,
        dbscan_eps=2.0,
        dbscan_min_points=100,
        crs="EPSG:26910",
        output_dir="../RESULTS",
    )

    ex = BuildingExtractor(cfg)
    ex.load("../DATA/neighborhood.laz").preprocess().segment()
    buildings_gdf, mesh_paths = ex.extract_all()

    # optional: also produce a ground DEM
    ex.rasterize_ground(pixel_size=1.0)

Command line
------------
    python lidar_building_extractor.py input.laz --outdir ../RESULTS \
        --building-class 6 --ground-class 2 --eps 2.0 --min-points 100 \
        --crs EPSG:26910 --dem
"""

from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

import laspy
import open3d as o3d
import alphashape as ash
import geopandas as gpd
import rasterio
from rasterio.transform import from_origin


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

@dataclass
class ExtractorConfig:
    building_class: int = 6      # ASPRS: 6 = Building
    ground_class: int = 2        # ASPRS: 2 = Ground
    dbscan_eps: float = 2.0      # meters, DBSCAN neighborhood radius
    dbscan_min_points: int = 100 # DBSCAN min samples per cluster
    min_cluster_size: int = 100  # drop candidate buildings smaller than this
    alpha_footprint: float = 0.5 # alphashape parameter for the 2D footprint
    alpha_mesh: float = 20.0     # alphashape parameter for the extruded mesh
    ground_knn: int = 50         # nearest ground points sampled per building
    crs: str = "EPSG:26910"
    output_dir: Path = Path("../RESULTS")
    verbose: bool = True


# --------------------------------------------------------------------------- #
# Core extractor
# --------------------------------------------------------------------------- #

class BuildingExtractor:
    """Point cloud -> building footprints, heights, and meshes."""

    FOOTPRINT_COLUMNS = [
        "id", "geometry", "height", "area", "perimeter",
        "local_cx", "local_cy", "local_cz",
        "transl_x", "transl_y", "transl_z", "pts_number",
    ]

    def __init__(self, config: Optional[ExtractorConfig] = None):
        self.config = config or ExtractorConfig()
        self.config.output_dir = Path(self.config.output_dir)
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
        o3d.utility.set_verbosity_level(o3d.utility.VerbosityLevel.Error)

        self.las: Optional[laspy.LasData] = None
        self.crs_wkt: Optional[str] = None

        self.building_pcd: Optional[o3d.geometry.PointCloud] = None
        self.ground_pcd: Optional[o3d.geometry.PointCloud] = None
        self.center = np.zeros(3)

        self.labels: Optional[np.ndarray] = None
        self.buildings_gdf: Optional[gpd.GeoDataFrame] = None

    def _log(self, *args):
        if self.config.verbose:
            print(*args)

    # ------------------------------------------------------------------ #
    # 1. Load
    # ------------------------------------------------------------------ #
    def load(self, path) -> "BuildingExtractor":
        self.las = laspy.read(str(path))
        try:
            self.crs_wkt = self.las.vlrs[2].string
        except Exception:
            self.crs_wkt = None

        self._log(f"Loaded {path}")
        self._log("  Classifications present:", np.unique(self.las.classification))
        self._log("  Point count:", len(self.las.points))
        return self

    # ------------------------------------------------------------------ #
    # 2. Preprocess: split building / ground, recenter to local frame
    # ------------------------------------------------------------------ #
    def _points_for_class(self, class_code: int) -> o3d.geometry.PointCloud:
        mask = self.las.classification == class_code
        xyz = np.vstack((self.las.x[mask], self.las.y[mask], self.las.z[mask])).T
        pcd = o3d.geometry.PointCloud()
        pcd.points = o3d.utility.Vector3dVector(xyz)
        return pcd

    def preprocess(self) -> "BuildingExtractor":
        if self.las is None:
            raise RuntimeError("Call .load() before .preprocess()")

        self.building_pcd = self._points_for_class(self.config.building_class)
        self.ground_pcd = self._points_for_class(self.config.ground_class)

        if len(self.building_pcd.points) == 0:
            raise ValueError(
                f"No points with classification={self.config.building_class} found."
            )
        if len(self.ground_pcd.points) == 0:
            raise ValueError(
                f"No points with classification={self.config.ground_class} found."
            )

        # Recenter to a local frame -- keeps DBSCAN / alphashape numerically
        # stable instead of operating on large UTM-scale coordinates.
        self.center = self.building_pcd.get_center()
        self.building_pcd.translate(-self.center)
        self.ground_pcd.translate(-self.center)

        nn = np.mean(self.building_pcd.compute_nearest_neighbor_distance())
        self._log(f"  Average building point spacing: {nn:.3f} m")
        return self

    # ------------------------------------------------------------------ #
    # 3. Segment candidate buildings with DBSCAN
    # ------------------------------------------------------------------ #
    def segment(self) -> "BuildingExtractor":
        if self.building_pcd is None:
            raise RuntimeError("Call .preprocess() before .segment()")

        labels = np.array(
            self.building_pcd.cluster_dbscan(
                eps=self.config.dbscan_eps,
                min_points=self.config.dbscan_min_points,
            )
        )
        self.labels = labels
        n_clusters = int(labels.max() + 1) if labels.size else 0
        n_noise = int((labels < 0).sum())
        self._log(f"  {n_clusters} candidate clusters, {n_noise} noise points")
        return self

    def get_segment(self, cluster_id: int) -> o3d.geometry.PointCloud:
        idx = np.where(self.labels == cluster_id)[0]
        return self.building_pcd.select_by_index(idx)

    # ------------------------------------------------------------------ #
    # 4. Per-building geometry
    # ------------------------------------------------------------------ #
    def _ground_level_near(self, xy: np.ndarray, z_hint: float, k: Optional[int] = None):
        k = k or self.config.ground_knn
        k = min(k, len(self.ground_pcd.points))
        query = np.array([xy[0], xy[1], z_hint])
        tree = o3d.geometry.KDTreeFlann(self.ground_pcd)
        _, idx, _ = tree.search_knn_vector_3d(query, k)
        sample = self.ground_pcd.select_by_index(idx)
        return float(sample.get_center()[2])

    def footprint(self, segment: o3d.geometry.PointCloud):
        """2D alpha-shape footprint of a building segment (local frame)."""
        pts_2d = np.asarray(segment.points)[:, :2]
        return ash.alphashape(pts_2d, alpha=self.config.alpha_footprint)

    def height(self, segment: o3d.geometry.PointCloud) -> Tuple[float, float]:
        """Returns (height, ground_z) for a building segment."""
        center = segment.get_center()
        z_hint = segment.get_min_bound()[2]
        ground_z = self._ground_level_near(center[:2], z_hint)
        top_z = segment.get_max_bound()[2]
        return top_z - ground_z, ground_z

    def mesh_from_footprint(self, footprint_geom, ground_z: float, h: float,
                             alpha: Optional[float] = None) -> o3d.geometry.TriangleMesh:
        """Extrudes a 2D footprint into a 3D box-like mesh via alpha-shape."""
        alpha = alpha if alpha is not None else self.config.alpha_mesh
        coords = np.array(footprint_geom.exterior.coords)
        base = np.hstack((coords, np.full((len(coords), 1), ground_z)))
        top = np.hstack((coords, np.full((len(coords), 1), ground_z + h)))

        pts = o3d.geometry.PointCloud()
        pts.points = o3d.utility.Vector3dVector(np.vstack((base, top)))

        mesh = o3d.geometry.TriangleMesh.create_from_point_cloud_alpha_shape(pts, alpha)
        mesh.compute_vertex_normals()
        return mesh

    def _record(self, cluster_id, segment, footprint_geom, ground_z, h) -> dict:
        return {
            "id": cluster_id,
            "geometry": footprint_geom,
            "height": h,
            "area": footprint_geom.area,
            "perimeter": footprint_geom.length,
            "local_cx": footprint_geom.centroid.x,
            "local_cy": footprint_geom.centroid.y,
            "local_cz": ground_z,
            "transl_x": self.center[0],
            "transl_y": self.center[1],
            "transl_z": self.center[2],
            "pts_number": len(segment.points),
        }

    @staticmethod
    def _random_color() -> List[float]:
        return [random.random(), random.random(), random.random()]

    # ------------------------------------------------------------------ #
    # 5. Batch extraction over every DBSCAN cluster
    # ------------------------------------------------------------------ #
    def extract_all(self, export_meshes: bool = True, export_shapefile: bool = True,
                     min_points: Optional[int] = None
                     ) -> Tuple[gpd.GeoDataFrame, List[Path]]:
        if self.labels is None:
            self.segment()

        min_points = self.config.min_cluster_size if min_points is None else min_points
        n_clusters = int(self.labels.max() + 1) if self.labels.size else 0

        records = []
        mesh_paths: List[Path] = []

        for cluster_id in range(n_clusters):
            idx = np.where(self.labels == cluster_id)[0]
            if len(idx) < min_points:
                continue
            segment = self.building_pcd.select_by_index(idx)

            try:
                fp = self.footprint(segment)
            except Exception as e:
                self._log(f"  cluster {cluster_id}: alphashape failed ({e}), skipped")
                continue

            if fp is None or fp.is_empty or fp.geom_type != "Polygon":
                self._log(f"  cluster {cluster_id}: degenerate footprint, skipped")
                continue

            h, ground_z = self.height(segment)
            records.append(self._record(cluster_id, segment, fp, ground_z, h))

            if export_meshes:
                try:
                    mesh = self.mesh_from_footprint(fp, ground_z, h)
                    mesh.translate(self.center)
                    mesh.paint_uniform_color(self._random_color())
                    out_path = self.config.output_dir / f"building_{cluster_id}.ply"
                    o3d.io.write_triangle_mesh(
                        str(out_path), mesh,
                        write_ascii=False, compressed=True,
                        write_vertex_normals=False, write_vertex_colors=True,
                    )
                    mesh_paths.append(out_path)
                except Exception as e:
                    self._log(f"  cluster {cluster_id}: mesh export failed ({e})")

            self._log(f"  cluster {cluster_id}: {len(idx)} pts, "
                       f"height={h:.2f} m, area={fp.area:.1f} m^2")

        self.buildings_gdf = gpd.GeoDataFrame(
            records, geometry="geometry", crs=self.config.crs
        ) if records else gpd.GeoDataFrame(
            columns=self.FOOTPRINT_COLUMNS, geometry="geometry", crs=self.config.crs
        )

        if export_shapefile and len(self.buildings_gdf):
            out_shp = self.config.output_dir / "buildings.shp"
            self.buildings_gdf.to_file(out_shp)
            self._log(f"Wrote {len(self.buildings_gdf)} footprints -> {out_shp}")

        self._log(f"Done: {len(records)}/{n_clusters} clusters kept as buildings")
        return self.buildings_gdf, mesh_paths

    # ------------------------------------------------------------------ #
    # 6. Optional: ground DEM raster
    # ------------------------------------------------------------------ #
    def rasterize_ground(self, pixel_size: float = 1.0,
                          out_path: Optional[Path] = None,
                          class_code: Optional[int] = None) -> Path:
        """Rasterizes classified ground points into a GeoTIFF DEM.

        Uses WORLD (not recentered) coordinates so the output is directly
        georeferenced in self.config.crs.
        """
        class_code = self.config.ground_class if class_code is None else class_code
        mask = self.las.classification == class_code
        x = np.asarray(self.las.x[mask])
        y = np.asarray(self.las.y[mask])
        z = np.asarray(self.las.z[mask])

        if len(x) == 0:
            raise ValueError(f"No points with classification={class_code} to rasterize")

        min_x, max_x = x.min(), x.max()
        min_y, max_y = y.min(), y.max()
        n_cols = max(1, int(np.ceil((max_x - min_x) / pixel_size)))
        n_rows = max(1, int(np.ceil((max_y - min_y) / pixel_size)))
        self._log(f"  DEM grid: {n_rows} rows x {n_cols} cols @ {pixel_size} m/px")

        dem = np.full((n_rows, n_cols), np.nan, dtype=np.float32)
        col = ((x - min_x) / pixel_size).astype(int)
        row = ((max_y - y) / pixel_size).astype(int)
        valid = (row >= 0) & (row < n_rows) & (col >= 0) & (col < n_cols)

        # Last-write-wins per pixel is fine for a quick DEM; for a smoother
        # surface, aggregate (e.g. min/mean) per pixel instead.
        dem[row[valid], col[valid]] = z[valid]

        transform = from_origin(min_x, max_y, pixel_size, pixel_size)
        out_path = Path(out_path) if out_path else self.config.output_dir / "ground_dem.tif"

        with rasterio.open(
            out_path, "w", driver="GTiff",
            height=n_rows, width=n_cols, count=1,
            dtype=np.float32, crs=self.config.crs,
            transform=transform, nodata=np.nan,
        ) as dst:
            dst.write(dem, 1)

        self._log(f"Wrote DEM -> {out_path}")
        return out_path

    # ------------------------------------------------------------------ #
    # 7. Visualization (opt-in, requires a display)
    # ------------------------------------------------------------------ #
    def show(self, geometries):
        o3d.visualization.draw_geometries(geometries)

    def show_clusters(self):
        """Colorizes each DBSCAN cluster and opens an Open3D viewer window."""
        import matplotlib.pyplot as plt

        if self.labels is None:
            self.segment()
        max_label = self.labels.max()
        colors = plt.get_cmap("tab20")(self.labels / (max_label if max_label > 0 else 1))
        colors[self.labels < 0] = 0
        pcd = o3d.geometry.PointCloud(self.building_pcd)
        pcd.colors = o3d.utility.Vector3dVector(colors[:, :3])
        self.show([pcd])


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract building footprints, heights and meshes from a "
                    "classified LiDAR point cloud (LAS/LAZ)."
    )
    p.add_argument("input", type=Path, help="Path to input .las/.laz file")
    p.add_argument("--outdir", type=Path, default=Path("../RESULTS"),
                    help="Output directory (default: ../RESULTS)")
    p.add_argument("--building-class", type=int, default=6,
                    help="ASPRS classification code for buildings (default: 6)")
    p.add_argument("--ground-class", type=int, default=2,
                    help="ASPRS classification code for ground (default: 2)")
    p.add_argument("--eps", type=float, default=2.0,
                    help="DBSCAN eps in meters (default: 2.0)")
    p.add_argument("--min-points", type=int, default=100,
                    help="DBSCAN min_points / min cluster size (default: 100)")
    p.add_argument("--alpha-footprint", type=float, default=0.5,
                    help="Alpha shape parameter for 2D footprints (default: 0.5)")
    p.add_argument("--alpha-mesh", type=float, default=20.0,
                    help="Alpha shape parameter for extruded meshes (default: 20.0)")
    p.add_argument("--crs", type=str, default="EPSG:26910",
                    help="Output CRS (default: EPSG:26910)")
    p.add_argument("--no-meshes", action="store_true", help="Skip PLY mesh export")
    p.add_argument("--no-shapefile", action="store_true", help="Skip footprint shapefile export")
    p.add_argument("--dem", action="store_true", help="Also export a ground DEM GeoTIFF")
    p.add_argument("--dem-pixel-size", type=float, default=1.0, help="DEM pixel size in meters")
    p.add_argument("--quiet", action="store_true", help="Suppress progress logging")
    return p


def main(argv=None):
    args = build_arg_parser().parse_args(argv)

    cfg = ExtractorConfig(
        building_class=args.building_class,
        ground_class=args.ground_class,
        dbscan_eps=args.eps,
        dbscan_min_points=args.min_points,
        min_cluster_size=args.min_points,
        alpha_footprint=args.alpha_footprint,
        alpha_mesh=args.alpha_mesh,
        crs=args.crs,
        output_dir=args.outdir,
        verbose=not args.quiet,
    )

    ex = BuildingExtractor(cfg)
    ex.load(args.input).preprocess().segment()
    gdf, meshes = ex.extract_all(
        export_meshes=not args.no_meshes,
        export_shapefile=not args.no_shapefile,
    )

    if args.dem:
        ex.rasterize_ground(pixel_size=args.dem_pixel_size)

    print(f"\nExtracted {len(gdf)} buildings, {len(meshes)} meshes -> {cfg.output_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
