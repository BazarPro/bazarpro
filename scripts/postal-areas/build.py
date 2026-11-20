"""Builds the postal code maps of the registration settings (#304).

One file per country in src/assets/postal-areas/<CC>.json: areas of the first three digits
of the postal code as SVG paths in Web Mercator units (1 unit = 100 m at the equator),
the regions of the first two digits, the country's outline and its larger towns.

Sources (download them into one directory, see README.md next to this file):
- Germany: postal code areas of OpenStreetMap (github.com/yetzt/postleitzahlen, ODbL)
- Austria, Switzerland, Liechtenstein, Luxembourg: postal codes with coordinates of
  GeoNames (CC BY 4.0); the areas are the Voronoi cells of their places
- Outlines: Natural Earth admin 0 countries 10m (public domain)
- Towns: GeoNames cities15000 (CC BY 4.0)

Run: python build.py <download dir> <output dir>  (needs shapely >= 2.1)
"""

import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import shapely
from shapely.geometry import MultiPoint, Point, shape
from shapely.ops import polylabel, unary_union

R = 63710  # Mercator units per radian: 100 m at the equator
COUNTRIES = {"DE": "DEU", "AT": "AUT", "CH": "CHE", "LI": "LIE", "LU": "LUX"}
# Simplification in Mercator units; small countries keep more detail
TOLERANCE = {"DE": 10, "AT": 7, "CH": 6, "LI": 1.5, "LU": 2}
# Towns shown on the map, by population
MIN_POPULATION = {"DE": 60_000, "AT": 15_000, "CH": 15_000, "LI": 0, "LU": 0}


def project(lon, lat):
    x = R * math.radians(lon)
    y = -R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def project_geom(geom):
    return shapely.transform(geom, lambda c: _project_array(c))


def _project_array(coords):
    import numpy as np

    lon = np.radians(coords[:, 0])
    lat = np.radians(coords[:, 1])
    return np.column_stack([R * lon, -R * np.log(np.tan(np.pi / 4 + lat / 2))])


def normalize(code):
    return "".join(ch for ch in code if ch.isdigit())


def country_shape(dl, a3):
    data = json.loads((dl / "ne_countries.geojson").read_text())
    for feature in data["features"]:
        if feature["properties"]["ADM0_A3"] == a3:
            return shape(feature["geometry"])
    raise SystemExit(f"no outline for {a3}")


def german_cells(dl):
    data = json.loads((dl / "plz.geojson").read_text())
    cells = defaultdict(list)
    for feature in data["features"]:
        code = normalize(feature["properties"]["postcode"])
        if len(code) == 5:
            cells[code].append(shapely.make_valid(shape(feature["geometry"])))
    return {code: unary_union(parts) for code, parts in cells.items()}


def voronoi_cells(dl, cc, land):
    points = defaultdict(list)
    with open(dl / cc / f"{cc}.txt", encoding="utf-8") as file:
        for row in csv.reader(file, delimiter="\t"):
            code = normalize(row[1])
            if row[9] and row[10]:
                points[code].append((float(row[10]), float(row[9])))
    centers = {
        code: Point(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        for code, pts in points.items()
    }
    # Places that share a spot would give no cell of their own
    by_spot = {}
    for code, point in sorted(centers.items()):
        by_spot.setdefault((round(point.x, 5), round(point.y, 5)), code)
    codes = {spot: code for spot, code in by_spot.items()}
    multipoint = MultiPoint([Point(*spot) for spot in codes])
    region = land.buffer(0.5)
    # Ordered: the n-th cell belongs to the n-th place
    diagram = shapely.voronoi_polygons(multipoint, extend_to=region, ordered=True)
    cells = defaultdict(list)
    for code, cell in zip(codes.values(), diagram.geoms):
        cells[code].append(cell.intersection(land))
    return {code: unary_union(parts) for code, parts in cells.items()}


def group(cells, digits):
    groups = defaultdict(list)
    for code, geom in cells.items():
        groups[code[:digits]].append(geom)
    return {prefix: unary_union(parts) for prefix, parts in groups.items()}


def ring_path(coords):
    points = [(round(x), round(y)) for x, y in coords]
    deduped = [points[0]]
    for point in points[1:]:
        if point != deduped[-1]:
            deduped.append(point)
    if len(deduped) < 4:
        return ""
    if deduped[-1] == deduped[0]:
        deduped.pop()
    out = [f"M{deduped[0][0]} {deduped[0][1]}l"]
    previous = deduped[0]
    parts = []
    for point in deduped[1:]:
        parts.append(f"{point[0] - previous[0]} {point[1] - previous[1]}")
        previous = point
    out.append(" ".join(parts).replace(" -", "-"))
    out.append("z")
    return "".join(out)


def polygons(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    if hasattr(geom, "geoms"):
        return [p for g in geom.geoms for p in polygons(g)]
    return []


def only_polygons(geom):
    """The polygons of a geometry; cutting along the border leaves lines and points."""
    return shapely.MultiPolygon(polygons(shapely.make_valid(geom)))


def path(geom, min_area=0):
    rings = []
    for polygon in polygons(geom):
        if polygon.area < min_area:
            continue
        rings.append(ring_path(polygon.exterior.coords))
        rings.extend(ring_path(interior.coords) for interior in polygon.interiors)
    return "".join(rings)


def label_point(geom):
    largest = max(polygons(geom), key=lambda p: p.area)
    point = polylabel(largest, tolerance=5)
    return [round(point.x), round(point.y)]


def size(geom):
    """Side of a square as large as the largest part: whether its label fits on screen."""
    return round(math.sqrt(max(p.area for p in polygons(geom))))


def towns(dl, cc):
    result = []
    with open(dl / "cities15000.txt", encoding="utf-8") as file:
        for row in csv.reader(file, delimiter="\t", quoting=csv.QUOTE_NONE):
            if row[8] != cc or row[6] != "P" or int(row[14]) < MIN_POPULATION[cc]:
                continue
            x, y = project(float(row[5]), float(row[4]))
            population = int(row[14])
            rank = 1 if population >= 400_000 else 2 if population >= 120_000 else 3
            if cc != "DE":
                rank = 1 if population >= 150_000 else 2 if population >= 40_000 else 3
            result.append({"n": row[1], "c": [round(x), round(y)], "r": rank, "pop": population})
    result.sort(key=lambda town: -town["pop"])
    for town in result:
        del town["pop"]
    return result


def build(dl, out, cc):
    land = country_shape(dl, COUNTRIES[cc])
    cells = german_cells(dl) if cc == "DE" else voronoi_cells(dl, cc, land)
    digits = len(next(iter(cells)))
    areas = group(cells, 3)
    if cc == "DE":
        areas = {prefix: geom.intersection(land) for prefix, geom in areas.items()}
    prefixes = sorted(prefix for prefix, geom in areas.items() if not geom.is_empty)
    projected = [only_polygons(project_geom(areas[prefix])) for prefix in prefixes]
    simplified = shapely.coverage_simplify(projected, TOLERANCE[cc])
    simplified = [only_polygons(geom) for geom in simplified]
    by_prefix = dict(zip(prefixes, simplified))
    min_area = TOLERANCE[cc] ** 2 * 2
    regions = group(by_prefix, 2)
    outline = unary_union(simplified)
    minx, miny, maxx, maxy = outline.bounds
    result = {
        "country": cc,
        "digits": digits,
        "bounds": [round(minx), round(miny), round(maxx), round(maxy)],
        "outline": path(outline, min_area),
        "areas": [
            {"p": prefix, "d": path(geom, min_area), "c": label_point(geom), "s": size(geom)}
            for prefix, geom in by_prefix.items()
            if not geom.is_empty
        ],
        "regions": [
            {"p": prefix, "d": path(geom, min_area), "c": label_point(geom), "s": size(geom)}
            for prefix, geom in sorted(regions.items())
        ],
        "towns": towns(dl, cc),
    }
    target = out / f"{cc}.json"
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    print(cc, digits, len(result["areas"]), len(result["regions"]), target.stat().st_size)


if __name__ == "__main__":
    download, output = Path(sys.argv[1]), Path(sys.argv[2])
    for code in sys.argv[3:] or COUNTRIES:
        build(download, output, code)
