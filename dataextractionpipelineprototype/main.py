"""
lidar_extractor_simple.py
==========================
Simple, sequential point cloud -> building footprint / mesh extractor.

Supports classified LiDAR with:
    6  = Building
    13 = Wire Guard   (exported for reference, not modeled)
    14 = Wire Conductor (exported for reference, not modeled)

No ground class (2) is required. Building height is computed from each
cluster's own min/max Z (local ground-relative height is NOT available
without ground points -- this gives point-cloud extent height instead).

Meshes are built as proper watertight prisms: wall quads around the
footprint ring + ear-clipped roof/floor caps (NOT alpha-shape-from-points,
which only recovers the flattest surface and drops the vertical walls).

Also exports:
    buildings.shp      -- footprint polygons + height/area attributes
    building_N.ply      -- per-building 3D mesh (walls + roof + floor)
    floorplans.svg      -- 2D floor plan of all footprints, with height labels
    building_heights.svg -- bar chart of extracted building heights

Design:
    - No classes, no method chaining. Just a sequence of numbered steps.
    - Each step prints what it's doing and what it produced.
    - Each step is wrapped so that if it fails, the script prints the
      error and stops immediately -- it does NOT try to continue or
      undo/re-run earlier steps. Anything already written to disk by
      earlier steps stays on disk.

Usage:
    python lidar_extractor_simple.py input.las --outdir RESULTS
"""

from __future__ import annotations

import argparse
import random
import sys
import traceback
from pathlib import Path

import numpy as np
import laspy
import open3d as o3d
import alphashape as ash
import geopandas as gpd
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MplPolygon


# --------------------------------------------------------------------------- #
# Step runner -- prints a header, runs the step, stops the whole script on
# any exception raised inside that step. Nothing after it runs.
# --------------------------------------------------------------------------- #
def run_step(step_num, total_steps, title, fn, *args, **kwargs):
    print(f"\n[{step_num}/{total_steps}] {title}")
    try:
        result = fn(*args, **kwargs)
        return result
    except Exception as e:
        print(f"    FAILED at step {step_num} ({title}): {e}")
        traceback.print_exc()
        print(f"\nStopping. Steps 1-{step_num - 1} already completed; "
              f"any files they wrote are still on disk.")
        sys.exit(1)


# --------------------------------------------------------------------------- #
# Step 1: Load
# --------------------------------------------------------------------------- #
def step_load(path):
    las = laspy.read(str(path))
    classes, counts = np.unique(las.classification, return_counts=True)
    print(f"    Loaded {path}")
    print(f"    Point count: {len(las.points)}")
    for c, n in zip(classes, counts):
        print(f"      class {c}: {n} points")
    return las


# --------------------------------------------------------------------------- #
# Step 2: Pull out building / wire points, recenter to a local frame
# --------------------------------------------------------------------------- #
def step_split_classes(las, building_class, wire_classes):
    def xyz_for(mask):
        return np.vstack((las.x[mask], las.y[mask], las.z[mask])).T

    building_mask = las.classification == building_class
    building_xyz = xyz_for(building_mask)
    if len(building_xyz) == 0:
        raise ValueError(
            f"No points with classification={building_class} (building) found."
        )

    wire_xyz = None
    wire_mask = np.isin(las.classification, wire_classes)
    if wire_mask.any():
        wire_xyz = xyz_for(wire_mask)

    center = building_xyz.mean(axis=0)
    building_xyz_local = building_xyz - center
    wire_xyz_local = (wire_xyz - center) if wire_xyz is not None else None

    print(f"    Building points (class {building_class}): {len(building_xyz)}")
    if wire_xyz_local is not None:
        print(f"    Wire points (classes {wire_classes}): {len(wire_xyz_local)}")
    else:
        print(f"    Wire points (classes {wire_classes}): none found, skipping wire export")
    print(f"    Recenter offset (world -> local): {center}")

    return {
        "center": center,
        "building_xyz": building_xyz_local,
        "wire_xyz": wire_xyz_local,
    }


# --------------------------------------------------------------------------- #
# Step 3: Export raw wire points for reference (if present) -- just a point
# cloud, not modeled/clustered. Skipped cleanly if there are no wire points.
# --------------------------------------------------------------------------- #
def step_export_wires(data, outdir):
    if data["wire_xyz"] is None:
        print("    No wire points to export, skipping.")
        return None
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(data["wire_xyz"] + data["center"])
    out_path = outdir / "wires.ply"
    o3d.io.write_triangle_mesh  # (not used, just avoiding unused-import lint)
    o3d.io.write_point_cloud(str(out_path), pcd)
    print(f"    Wrote {len(data['wire_xyz'])} wire points -> {out_path}")
    return out_path


# --------------------------------------------------------------------------- #
# Step 4: DBSCAN cluster the building points into candidate buildings
# --------------------------------------------------------------------------- #
def step_cluster(data, eps, min_points):
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(data["building_xyz"])
    labels = np.array(pcd.cluster_dbscan(eps=eps, min_points=min_points))
    n_clusters = int(labels.max() + 1) if labels.size else 0
    n_noise = int((labels < 0).sum())
    print(f"    {n_clusters} candidate clusters, {n_noise} noise points")
    if n_clusters == 0:
        raise ValueError(
            "No clusters found. Try a larger --eps or smaller --min-points."
        )
    return {"pcd": pcd, "labels": labels, "n_clusters": n_clusters}


# --------------------------------------------------------------------------- #
# Step 5: Per-cluster footprint + height. Height = max Z - min Z of that
# cluster's own points (no ground class available to reference).
# --------------------------------------------------------------------------- #
def step_extract_footprints(cluster_data, center, alpha_footprint, min_cluster_size):
    pcd = cluster_data["pcd"]
    labels = cluster_data["labels"]
    n_clusters = cluster_data["n_clusters"]
    pts_all = np.asarray(pcd.points)

    records = []
    kept_segments = {}  # cluster_id -> points, for the mesh step

    for cluster_id in range(n_clusters):
        idx = np.where(labels == cluster_id)[0]
        if len(idx) < min_cluster_size:
            print(f"    cluster {cluster_id}: {len(idx)} pts < min size, skipped")
            continue

        seg_pts = pts_all[idx]
        try:
            fp = ash.alphashape(seg_pts[:, :2], alpha=alpha_footprint)
        except Exception as e:
            print(f"    cluster {cluster_id}: alphashape failed ({e}), skipped")
            continue

        if fp is None or fp.is_empty or fp.geom_type != "Polygon":
            print(f"    cluster {cluster_id}: degenerate footprint, skipped")
            continue

        z_min = seg_pts[:, 2].min()
        z_max = seg_pts[:, 2].max()
        height = z_max - z_min

        records.append({
            "id": cluster_id,
            "geometry": fp,
            "height": height,
            "area": fp.area,
            "perimeter": fp.length,
            "base_z_local": z_min,
            "transl_x": center[0],
            "transl_y": center[1],
            "transl_z": center[2],
            "pts_number": len(seg_pts),
        })
        kept_segments[cluster_id] = (seg_pts, z_min, height)
        print(f"    cluster {cluster_id}: {len(idx)} pts, "
              f"height={height:.2f} m, area={fp.area:.1f} m^2")

    if not records:
        raise ValueError(
            "No valid building footprints extracted from any cluster."
        )

    return {"records": records, "segments": kept_segments}


# --------------------------------------------------------------------------- #
# Step 6: Write footprints to shapefile
# --------------------------------------------------------------------------- #
def step_write_shapefile(footprint_data, crs, outdir):
    gdf = gpd.GeoDataFrame(footprint_data["records"], geometry="geometry", crs=crs)
    out_path = outdir / "buildings.shp"
    gdf.to_file(out_path)
    print(f"    Wrote {len(gdf)} footprints -> {out_path}")
    return gdf


# --------------------------------------------------------------------------- #
# Ear-clipping triangulation of a simple (possibly concave) 2D polygon ring.
# Needed for the roof/floor caps -- alphashape footprints are often concave,
# so a plain triangle fan (which only works for convex polygons) would
# produce wrong/self-crossing triangles.
# --------------------------------------------------------------------------- #
def _polygon_area2(coords):
    area = 0.0
    n = len(coords)
    for i in range(n):
        x1, y1 = coords[i]
        x2, y2 = coords[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return area


def _is_convex_vertex(coords, a, b, c):
    ax, ay = coords[a]
    bx, by = coords[b]
    cx, cy = coords[c]
    cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    return cross > 1e-12


def _point_in_triangle(p, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign(p, a, b)
    d2 = sign(p, b, c)
    d3 = sign(p, c, a)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def ear_clip_triangulate(coords):
    """coords: list of (x, y), ring NOT closed (no repeated first/last point).
    Returns a list of (i, j, k) index triples into `coords`."""
    n = len(coords)
    if n < 3:
        return []
    idx = list(range(n))
    if _polygon_area2(coords) < 0:
        idx.reverse()

    triangles = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        ear_found = False
        for i in range(len(idx)):
            a, b, c = idx[i - 1], idx[i], idx[(i + 1) % len(idx)]
            if not _is_convex_vertex(coords, a, b, c):
                continue
            blocked = False
            for p in idx:
                if p in (a, b, c):
                    continue
                if _point_in_triangle(coords[p], coords[a], coords[b], coords[c]):
                    blocked = True
                    break
            if blocked:
                continue
            triangles.append((a, b, c))
            del idx[i]
            ear_found = True
            break
        if not ear_found:
            break  # degenerate ring; return whatever we've triangulated so far
    if len(idx) == 3:
        triangles.append(tuple(idx))
    return triangles


def extrude_polygon_mesh(footprint_geom, z_min, height):
    """Builds a watertight prism mesh: walls (quads) + roof + floor caps.
    This replaces alpha-shape-from-points, which only reliably recovers the
    flattest/top surface and drops the vertical walls."""
    coords = list(footprint_geom.exterior.coords)
    if coords[0] == coords[-1]:
        coords = coords[:-1]  # drop closing duplicate
    n = len(coords)
    if n < 3:
        raise ValueError("footprint has fewer than 3 unique vertices")

    base = [(x, y, z_min) for x, y in coords]
    top = [(x, y, z_min + height) for x, y in coords]
    vertices = base + top  # indices 0..n-1 = base ring, n..2n-1 = top ring

    triangles = []
    # Walls: one quad (2 triangles) per edge of the ring
    for i in range(n):
        j = (i + 1) % n
        b_i, b_j, t_i, t_j = i, j, n + i, n + j
        triangles.append((b_i, b_j, t_j))
        triangles.append((b_i, t_j, t_i))

    # Roof + floor caps via ear clipping (handles concave footprints)
    roof_tris = ear_clip_triangulate(coords)
    if not roof_tris:
        raise ValueError("could not triangulate roof/floor cap (degenerate footprint)")
    for (a, b, c) in roof_tris:
        triangles.append((n + a, n + b, n + c))          # roof, upward normal
        triangles.append((a, c, b))                      # floor, reversed winding

    mesh = o3d.geometry.TriangleMesh()
    mesh.vertices = o3d.utility.Vector3dVector(np.array(vertices))
    mesh.triangles = o3d.utility.Vector3iVector(np.array(triangles))
    mesh.remove_duplicated_vertices()
    mesh.remove_degenerate_triangles()
    return mesh


# --------------------------------------------------------------------------- #
# Step 7: Export extruded mesh per building (proper walls + roof + floor)
# --------------------------------------------------------------------------- #
def step_export_meshes(footprint_data, center, outdir):
    mesh_paths = []
    for rec in footprint_data["records"]:
        cluster_id = rec["id"]
        fp = rec["geometry"]
        z_min, height = footprint_data["segments"][cluster_id][1:]

        try:
            mesh = extrude_polygon_mesh(fp, z_min, height)
        except Exception as e:
            print(f"    cluster {cluster_id}: mesh build failed ({e}), skipped")
            continue

        mesh.compute_vertex_normals()
        mesh.translate(center)
        mesh.paint_uniform_color([random.random(), random.random(), random.random()])

        out_path = outdir / f"building_{cluster_id}.ply"
        o3d.io.write_triangle_mesh(
            str(out_path), mesh,
            write_ascii=False, compressed=True,
            write_vertex_normals=False, write_vertex_colors=True,
        )
        mesh_paths.append(out_path)
        print(f"    cluster {cluster_id}: {len(mesh.triangles)} triangles "
              f"(walls + roof + floor) -> {out_path}")

    return mesh_paths


# --------------------------------------------------------------------------- #
# Step 8: Floor plan + height SVGs
# --------------------------------------------------------------------------- #
def step_export_floorplan_svg(gdf, outdir):
    fig, ax = plt.subplots(figsize=(10, 10))
    for _, row in gdf.iterrows():
        coords = list(row.geometry.exterior.coords)
        ax.add_patch(MplPolygon(coords, closed=True, fill=False,
                                 edgecolor="black", linewidth=1.2))
        c = row.geometry.centroid
        ax.annotate(f"B{row['id']}\nh={row['height']:.1f} m\n"
                     f"{row['area']:.0f} m²",
                     (c.x, c.y), ha="center", va="center", fontsize=7)
    ax.set_aspect("equal")
    ax.autoscale_view()
    ax.set_title("Building Floor Plans (local frame)")
    ax.set_xlabel("X (m)")
    ax.set_ylabel("Y (m)")
    fig.tight_layout()

    out_path = outdir / "floorplans.svg"
    fig.savefig(out_path, format="svg")
    plt.close(fig)
    print(f"    Wrote floor plan -> {out_path}")
    return out_path


def step_export_height_chart_svg(gdf, outdir):
    fig, ax = plt.subplots(figsize=(max(6, 0.6 * len(gdf)), 5))
    labels = [f"B{i}" for i in gdf["id"]]
    heights = gdf["height"].values
    ax.bar(labels, heights, color="steelblue")
    for i, h in enumerate(heights):
        ax.text(i, h, f"{h:.1f} m", ha="center", va="bottom", fontsize=8)
    ax.set_ylabel("Height (m)")
    ax.set_title("Extracted Building Heights")
    fig.tight_layout()

    out_path = outdir / "building_heights.svg"
    fig.savefig(out_path, format="svg")
    plt.close(fig)
    print(f"    Wrote height chart -> {out_path}")
    return out_path


# --------------------------------------------------------------------------- #
# Main: run each step in order via run_step
# --------------------------------------------------------------------------- #
def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Simple building/wire extractor for LAS/LAZ (classes 6/13/14)."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--outdir", type=Path, default=Path("RESULTS"))
    parser.add_argument("--building-class", type=int, default=6)
    parser.add_argument("--wire-classes", type=int, nargs="*", default=[13, 14])
    parser.add_argument("--eps", type=float, default=2.0)
    parser.add_argument("--min-points", type=int, default=100)
    parser.add_argument("--alpha-footprint", type=float, default=0.5)
    parser.add_argument("--crs", type=str, default="EPSG:26910")
    parser.add_argument("--no-meshes", action="store_true")
    parser.add_argument("--no-svg", action="store_true")
    args = parser.parse_args(argv)

    args.outdir.mkdir(parents=True, exist_ok=True)
    o3d.utility.set_verbosity_level(o3d.utility.VerbosityLevel.Error)

    total_steps = 6
    if not args.no_meshes:
        total_steps += 1
    if not args.no_svg:
        total_steps += 2

    las = run_step(1, total_steps, "Load LAS/LAZ file", step_load, args.input)

    data = run_step(
        2, total_steps, "Split classes (building / wire) and recenter",
        step_split_classes, las, args.building_class, args.wire_classes,
    )

    run_step(
        3, total_steps, "Export wire points (reference only)",
        step_export_wires, data, args.outdir,
    )

    cluster_data = run_step(
        4, total_steps, "Cluster building points (DBSCAN)",
        step_cluster, data, args.eps, args.min_points,
    )

    footprint_data = run_step(
        5, total_steps, "Extract per-building footprint + height",
        step_extract_footprints, cluster_data, data["center"],
        args.alpha_footprint, args.min_points,
    )

    gdf = run_step(
        6, total_steps, "Write footprints to shapefile",
        step_write_shapefile, footprint_data, args.crs, args.outdir,
    )

    step_n = 6

    if not args.no_meshes:
        step_n += 1
        mesh_paths = run_step(
            step_n, total_steps, "Export extruded meshes (walls + roof + floor, .ply)",
            step_export_meshes, footprint_data, data["center"], args.outdir,
        )
    else:
        mesh_paths = []

    if not args.no_svg:
        step_n += 1
        run_step(
            step_n, total_steps, "Export floor plan SVG",
            step_export_floorplan_svg, gdf, args.outdir,
        )
        step_n += 1
        run_step(
            step_n, total_steps, "Export height chart SVG",
            step_export_height_chart_svg, gdf, args.outdir,
        )

    print(f"\nDone. {len(gdf)} buildings, {len(mesh_paths)} meshes -> {args.outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
