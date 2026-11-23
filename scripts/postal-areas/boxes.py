"""Bounding boxes of the map areas, so the app finds the areas near a circle without
reading every path (#304). build.py writes them; run alone, this adds them to maps built
before: python boxes.py <output dir>
"""

import json
import re
import sys
from pathlib import Path


def path_box(d):
    """minX, minY, maxX, maxY of a path as `ring_path` writes it: "M x y l dx dy … z"."""
    xs, ys = [], []
    for part in filter(None, d.split("M")):
        start, _, rest = part.replace("z", "").partition("l")
        x, y = (int(n) for n in re.findall(r"-?\d+", start)[:2])
        xs.append(x)
        ys.append(y)
        deltas = [int(n) for n in re.findall(r"-?\d+", rest)]
        for dx, dy in zip(deltas[0::2], deltas[1::2]):
            x, y = x + dx, y + dy
            xs.append(x)
            ys.append(y)
    return [min(xs), min(ys), max(xs), max(ys)] if xs else None


def with_box(area):
    """The area with its box as "b" after "d"; areas too small to draw get none."""
    box = path_box(area["d"])
    result = {}
    for key, value in area.items():
        if key == "b":
            continue
        result[key] = value
        if key == "d" and box:
            result["b"] = box
    return result


if __name__ == "__main__":
    for target in sorted(Path(sys.argv[1]).glob("*.json")):
        data = json.loads(target.read_text())
        data["areas"] = [with_box(area) for area in data["areas"]]
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        print(target.name, target.stat().st_size)
