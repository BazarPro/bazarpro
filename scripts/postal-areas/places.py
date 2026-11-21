"""Place names of the postal code maps (#304): the towns drawn on the map and the names of
each area's largest places, shown when the pointer rests on an area and in the picture of
a bazaar's region. build.py writes them; run alone, this refreshes them in maps built
before, without the large area sources:

    python places.py <download dir> <output dir>

The download dir needs cities1000.txt and <CC>/<CC>.txt of GeoNames (see README.md).
"""

import csv
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

R = 63710  # Mercator units per radian: 100 m at the equator
# Towns drawn on the map, by population; rank 4 shows only close up
MIN_POPULATION = {"DE": 15_000, "AT": 4_000, "CH": 5_000, "LI": 0, "LU": 2_500}
# Population from which a town has rank 1, 2, 3; below is rank 4
RANKS = {"DE": (400_000, 120_000, 50_000), "other": (150_000, 40_000, 12_000)}
# Names of an area: its largest places
AREA_NAMES = 3
# Degrees within which a town and a postal code of its name are the same place
NEAR = 0.12
# Post boxes and offices in the postal code files, no places
NOT_A_PLACE = re.compile(r"\b(Postfach|PF|Adm|Caselle|Verarb|UBS)\b")
# Villages GeoNames gives the population of a whole town
WRONG_POPULATION = {"Eisenzicken"}


def project(lon, lat):
    x = R * math.radians(lon)
    y = -R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def normalize(code):
    return "".join(ch for ch in code if ch.isdigit())


def postal_places(dl, cc):
    """(code, name, lon, lat) of the GeoNames postal codes; "Wien, Leopoldstadt" is "Wien".

    The German file also lists the codes of companies and offices, without the accuracy of
    a place: they are left out.
    """
    places = []
    with open(dl / cc / f"{cc}.txt", encoding="utf-8") as file:
        for row in csv.reader(file, delimiter="\t", quoting=csv.QUOTE_NONE):
            if not row[9] or not row[10] or (cc == "DE" and not row[11].strip()):
                continue
            if NOT_A_PLACE.search(row[2]):
                continue
            name = row[2].split(",")[0].strip()
            # "Aarau 1": a post office of the town
            name = name.rstrip("0123456789 ").strip() or name
            # "Birmensdorf ZH": the canton tells places of the same name apart
            if cc == "CH":
                name = re.sub(r" [A-Z]{2}$", "", name)
            places.append((normalize(row[1]), name, float(row[10]), float(row[9])))
    return places


def cities(dl, cc):
    """GeoNames places of the country with at least 1000 people, largest first."""
    result = []
    with open(dl / "cities1000.txt", encoding="utf-8") as file:
        for row in csv.reader(file, delimiter="\t", quoting=csv.QUOTE_NONE):
            if row[8] != cc or row[6] != "P" or row[1] in WRONG_POPULATION:
                continue
            result.append(
                {
                    "name": row[1],
                    "alternates": set(filter(None, row[3].split(","))) | {row[2]},
                    "code": row[7],
                    "lon": float(row[5]),
                    "lat": float(row[4]),
                    "population": int(row[14] or 0),
                }
            )
    result.sort(key=lambda city: -city["population"])
    return result


class Grid:
    """Postal places by a grid of about 5 km, to find those near a point."""

    CELL = 0.05

    def __init__(self, places):
        self.cells = defaultdict(list)
        for place in places:
            self.cells[self.key(place[2], place[3])].append(place)

    def key(self, lon, lat):
        return (math.floor(lon / self.CELL), math.floor(lat / self.CELL))

    def near(self, lon, lat):
        kx, ky = self.key(lon, lat)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                yield from self.cells.get((kx + dx, ky + dy), [])


def local_name(city, grid):
    """The name the postal codes nearby use: "München" for GeoNames' "Munich"."""
    nearby = {place[1] for place in grid.near(city["lon"], city["lat"])}
    if city["name"] in nearby:
        return city["name"]
    matches = sorted(city["alternates"] & nearby, key=len)
    return matches[0] if matches else city["name"]


def rank(population, cc):
    first, second, third = RANKS["DE" if cc == "DE" else "other"]
    if population >= first:
        return 1
    if population >= second:
        return 2
    if population >= third:
        return 3
    return 4


def towns(dl, cc, grid=None, all_cities=None):
    """Towns for orientation, largest first: name, point and rank 1 to 4."""
    grid = grid or Grid(postal_places(dl, cc))
    result = []
    seen = set()
    for city in all_cities if all_cities is not None else cities(dl, cc):
        # Parts of a town ("Kreuzberg") are no towns of their own
        if city["code"] == "PPLX" or city["population"] < max(MIN_POPULATION[cc], 1):
            continue
        name = local_name(city, grid)
        if name in seen:
            continue
        seen.add(name)
        x, y = project(city["lon"], city["lat"])
        result.append({"n": name, "c": [round(x), round(y)], "r": rank(city["population"], cc)})
    return result


def area_names(dl, cc, digits=3, grid=None, all_cities=None):
    """The names of the largest places of each area of `digits` digits, largest first.

    A place's size is its population where GeoNames knows the town, else the number of its
    postal codes: Ulm has five, a village one.
    """
    places = postal_places(dl, cc)
    grid = grid or Grid(places)
    # Towns by name: there are two Ambergs in Bavaria, so a town counts only near the
    # postal codes of its name
    by_name = defaultdict(list)
    for city in all_cities if all_cities is not None else cities(dl, cc):
        if city["code"] != "PPLX":
            by_name[local_name(city, grid)].append(city)
    codes = defaultdict(lambda: defaultdict(set))
    points = defaultdict(lambda: defaultdict(list))
    for code, name, lon, lat in places:
        if len(code) >= digits:
            codes[code[:digits]][name].add(code)
            points[code[:digits]][name].append((lon, lat))

    def population(prefix, name):
        return max(
            (
                city["population"]
                for city in by_name.get(name, [])
                for lon, lat in points[prefix][name]
                if abs(city["lon"] - lon) < NEAR and abs(city["lat"] - lat) < NEAR
            ),
            default=0,
        )

    result = {}
    for prefix, names in codes.items():
        ordered = sorted(
            names, key=lambda name: (-population(prefix, name), -len(names[name]), name)
        )
        chosen = []
        for name in ordered:
            # "Dresden Striesen" next to "Dresden" adds nothing
            if any(name.startswith((f"{other} ", f"{other}-")) for other in chosen):
                continue
            chosen.append(name)
            if len(chosen) == AREA_NAMES:
                break
        result[prefix] = chosen
    return result


def with_names(area, names):
    """The area with the names of its places as "n" after "s"."""
    result = {key: value for key, value in area.items() if key != "n"}
    found = names.get(area["p"])
    if found:
        result["n"] = found
    return result


def refresh(dl, target):
    data = json.loads(target.read_text())
    cc = data["country"]
    places = postal_places(dl, cc)
    grid = Grid(places)
    all_cities = cities(dl, cc)
    names = area_names(dl, cc, grid=grid, all_cities=all_cities)
    data["areas"] = [with_names(area, names) for area in data["areas"]]
    data["towns"] = towns(dl, cc, grid=grid, all_cities=all_cities)
    target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    named = sum(1 for area in data["areas"] if "n" in area)
    print(cc, len(data["towns"]), "towns", named, "of", len(data["areas"]), "areas named")


if __name__ == "__main__":
    download, output = Path(sys.argv[1]), Path(sys.argv[2])
    for target in sorted(output.glob("*.json")):
        refresh(download, target)
