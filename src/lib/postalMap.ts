import { COUNTRIES, type Country } from '../shared/constants';
import {
  compactPrefixes,
  compactRegion,
  postalCodeDigits,
  type PostalCodesByCountry,
} from '../shared/postalCodes';

/**
 * The postal code maps of the registration settings (#304), built by
 * scripts/postal-areas/build.py: areas of the first three digits as SVG paths in Web
 * Mercator units (`R` per radian, 100 m at the equator).
 */
export interface PostalMapData {
  country: Country;
  /** Digits of a full postal code, e.g. 5 in Germany */
  digits: number;
  /** minX, minY, maxX, maxY */
  bounds: [number, number, number, number];
  outline: string;
  /** Areas of the first three digits: path, label point, size of the largest part */
  areas: PostalArea[];
  /** Regions of the first two digits, for their borders and labels */
  regions: PostalArea[];
  /** Larger towns for orientation, rank 1 (largest) to 3 */
  towns: { n: string; c: Point; r: 1 | 2 | 3 }[];
}

export interface PostalArea {
  p: string;
  d: string;
  c: Point;
  s: number;
  /** On a map of several countries: the prefix shown, while `p` is the key "AT:690" */
  l?: string;
}

export type Point = [number, number];

const R = 63710;

const loaders = import.meta.glob<PostalMapData>('../assets/postal-areas/*.json', {
  import: 'default',
});
const cache = new Map<string, Promise<PostalMapData>>();

/** The map of a country, loaded once; it is large, so only where it is shown. */
export function loadPostalMap(country: Country): Promise<PostalMapData> {
  let promise = cache.get(country);
  if (!promise) {
    const loader = loaders[`../assets/postal-areas/${country}.json`];
    if (!loader) return Promise.reject(new Error(`no postal map for ${country}`));
    promise = loader();
    cache.set(country, promise);
    promise.catch(() => cache.delete(country));
  }
  return promise;
}

export function project(longitude: number, latitude: number): Point {
  const lat = (latitude * Math.PI) / 180;
  return [R * ((longitude * Math.PI) / 180), -R * Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}

export function unproject([x, y]: Point): { longitude: number; latitude: number } {
  return {
    longitude: ((x / R) * 180) / Math.PI,
    latitude: ((2 * Math.atan(Math.exp(-y / R)) - Math.PI / 2) * 180) / Math.PI,
  };
}

/** Distance on the ground in km. */
export function distanceKm(a: Point, b: Point): number {
  const p = unproject(a);
  const q = unproject(b);
  const rad = Math.PI / 180;
  const dLat = (q.latitude - p.latitude) * rad;
  const dLon = (q.longitude - p.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p.latitude * rad) * Math.cos(q.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Map units of one km at this point; they grow towards the poles. */
export function unitsPerKm(point: Point): number {
  return 10 / Math.cos((unproject(point).latitude * Math.PI) / 180);
}

/** The rings of an SVG path as the build script writes them: "M x y l dx dy … z". */
export function pathRings(d: string): Point[][] {
  const rings: Point[][] = [];
  for (const part of d.split('M').filter(Boolean)) {
    const [start, rest = ''] = part.replace(/z/g, '').split('l');
    const [x0, y0] = start
      .trim()
      .split(/\s+|(?=-)/)
      .map(Number);
    const deltas = rest.match(/-?\d+/g)?.map(Number) ?? [];
    const ring: Point[] = [[x0, y0]];
    for (let i = 0; i + 1 < deltas.length; i += 2) {
      const [x, y] = ring[ring.length - 1];
      ring.push([x + deltas[i], y + deltas[i + 1]]);
    }
    rings.push(ring);
  }
  return rings;
}

function inRing([x, y]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** An area's border as flat x, y pairs and its bounding box, read once per area. */
interface AreaShape {
  rings: Point[][];
  /** x0, y0, x1, y1, … of every ring */
  points: Float64Array;
  /** minX, minY, maxX, maxY */
  box: [number, number, number, number];
}

const shapeCache = new WeakMap<PostalArea, AreaShape>();
function shapeOf(area: PostalArea): AreaShape {
  let shape = shapeCache.get(area);
  if (!shape) {
    const rings = pathRings(area.d);
    const count = rings.reduce((sum, ring) => sum + ring.length, 0);
    const points = new Float64Array(count * 2);
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    let i = 0;
    for (const ring of rings) {
      for (const [x, y] of ring) {
        points[i++] = x;
        points[i++] = y;
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
      }
    }
    shape = { rings, points, box };
    shapeCache.set(area, shape);
  }
  return shape;
}

/** Whether the point lies in the area. */
export function areaContains(area: PostalArea, point: Point): boolean {
  const { rings, box } = shapeOf(area);
  if (point[0] < box[0] || point[0] > box[2] || point[1] < box[1] || point[1] > box[3]) {
    return false;
  }
  // Holes count as rings too: an odd number of rings around the point is inside
  return rings.filter((ring) => inRing(point, ring)).length % 2 === 1;
}

/** Share of an area's border needed inside the circle for the area to count */
const BORDER_SHARE = 0.3;

/** The last circles asked for per map: the slider asks for the same ones again and again */
const withinCache = new WeakMap<PostalMapData, Map<string, string[]>>();
const WITHIN_CACHED = 8;

/**
 * The prefixes of the areas the circle covers: the one around its centre, those whose
 * centre lies in it, and those with a good part of their border in it. A large area
 * whose centre is far away, e.g. a town next door, counts as well. The circle is the one
 * drawn on the map: a radius in map units at its centre, which keeps this fast enough
 * for every step of the slider.
 */
export function areasWithin(data: PostalMapData, center: Point, km: number): string[] {
  if (km <= 0) return [];
  let cached = withinCache.get(data);
  if (!cached) {
    cached = new Map();
    withinCache.set(data, cached);
  }
  const key = `${center[0]},${center[1]},${km}`;
  const hit = cached.get(key);
  if (hit) return hit;

  const [cx, cy] = center;
  const radius = km * unitsPerKm(center);
  const r2 = radius * radius;
  const result: string[] = [];
  for (const area of data.areas) {
    const dx = area.c[0] - cx;
    const dy = area.c[1] - cy;
    if (dx * dx + dy * dy <= r2) {
      result.push(area.p);
      continue;
    }
    const { points, box } = shapeOf(area);
    // Nearest point of the box: an area wholly outside the circle needs no closer look
    const nx = Math.max(box[0] - cx, 0, cx - box[2]);
    const ny = Math.max(box[1] - cy, 0, cy - box[3]);
    if (nx * nx + ny * ny > r2) continue;
    if (areaContains(area, center)) {
      result.push(area.p);
      continue;
    }
    // Areas too small to draw have no border
    const count = points.length / 2;
    if (!count) continue;
    const needed = count * BORDER_SHARE;
    let inside = 0;
    for (let i = 0; i < points.length && inside < needed; i += 2) {
      const px = points[i] - cx;
      const py = points[i + 1] - cy;
      if (px * px + py * py <= r2) inside++;
    }
    if (inside >= needed) result.push(area.p);
  }

  if (cached.size >= WITHIN_CACHED) cached.delete(cached.keys().next().value!);
  cached.set(key, result);
  return result;
}

/**
 * Where a postal code is on the map: the centre of its area, else of its region. Used for
 * the bazaar's own address.
 */
export function positionOf(data: PostalMapData, postalCode: string): Point | undefined {
  const digits = postalCodeDigits(postalCode);
  if (digits.length < 2) return undefined;
  const area = data.areas.find((candidate) => candidate.p === digits.slice(0, 3));
  return (area ?? data.regions.find((region) => region.p === digits.slice(0, 2)))?.c;
}

/** The areas of the map that the stored prefixes cover, wholly or in part. */
export interface MapSelection {
  /** Areas wholly in the region */
  areas: Set<string>;
  /** Areas only partly in it, by a longer prefix such as "7322" */
  partial: Set<string>;
  /** Prefixes longer than an area, e.g. "7322" */
  finer: string[];
}

export function selectionFromPrefixes(data: PostalMapData, prefixes: string[]): MapSelection {
  const areas = new Set<string>();
  const partial = new Set<string>();
  const finer: string[] = [];
  for (const prefix of prefixes) {
    if (prefix.length > 3) {
      finer.push(prefix);
      partial.add(prefix.slice(0, 3));
      continue;
    }
    for (const area of data.areas) {
      if (area.p.startsWith(prefix)) areas.add(area.p);
    }
  }
  for (const area of areas) partial.delete(area);
  return { areas, partial, finer };
}

/**
 * The prefixes to store for the chosen areas: as short as possible, "89" once every area
 * of 89 is chosen. Longer prefixes stay unless an area covers them.
 */
export function prefixesFromSelection(
  data: PostalMapData,
  areas: ReadonlySet<string>,
  finer: string[] = []
): string[] {
  const all = data.areas.map((area) => area.p);
  const prefixes: string[] = [];
  const whole = (prefix: string) =>
    all.some((p) => p.startsWith(prefix)) &&
    all.filter((p) => p.startsWith(prefix)).every((p) => areas.has(p));
  for (const first of new Set(all.map((p) => p[0]))) {
    if (whole(first)) {
      prefixes.push(first);
      continue;
    }
    for (const second of new Set(all.filter((p) => p[0] === first).map((p) => p.slice(0, 2)))) {
      if (whole(second)) {
        prefixes.push(second);
        continue;
      }
      prefixes.push(...all.filter((p) => p.startsWith(second) && areas.has(p)));
    }
  }
  return compactPrefixes([...prefixes, ...finer]);
}

/**
 * The maps of several countries as one, so a region near a border reaches across it:
 * areas and regions are keyed "AT:690" (see `areaKey`), each still labelled "690".
 */
export interface CombinedMap {
  maps: PostalMapData[];
  bounds: [number, number, number, number];
  outline: string;
  areas: PostalArea[];
  regions: PostalArea[];
  towns: PostalMapData['towns'];
  attribution: string;
}

export function areaKey(country: Country, prefix: string): string {
  return `${country}:${prefix}`;
}

export function splitKey(key: string): { country: Country; prefix: string } {
  const [country, prefix = ''] = key.split(':');
  return { country: country as Country, prefix };
}

const keyed = (country: Country, areas: PostalArea[]) =>
  areas.map((area) => ({ ...area, p: areaKey(country, area.p), l: area.p }));

export function combineMaps(maps: PostalMapData[]): CombinedMap {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const map of maps) {
    bounds[0] = Math.min(bounds[0], map.bounds[0]);
    bounds[1] = Math.min(bounds[1], map.bounds[1]);
    bounds[2] = Math.max(bounds[2], map.bounds[2]);
    bounds[3] = Math.max(bounds[3], map.bounds[3]);
  }
  const sources = [
    maps.some((map) => map.country === 'DE') && '© OpenStreetMap',
    maps.some((map) => map.country !== 'DE') && '© GeoNames',
  ].filter(Boolean);
  return {
    maps,
    bounds,
    outline: maps.map((map) => map.outline).join(''),
    areas: maps.flatMap((map) => keyed(map.country, map.areas)),
    regions: maps.flatMap((map) => keyed(map.country, map.regions)),
    towns: maps.flatMap((map) => map.towns),
    attribution: sources.join(' · '),
  };
}

/** The maps of all countries of the app, loaded once. */
export function loadAllPostalMaps(): Promise<PostalMapData[]> {
  return Promise.all(COUNTRIES.map(loadPostalMap));
}

/** `areasWithin` on every country: the keys of the areas the circle covers. */
export function keysWithin(combined: CombinedMap, center: Point, km: number): string[] {
  return combined.maps.flatMap((map) =>
    areasWithin(map, center, km).map((prefix) => areaKey(map.country, prefix))
  );
}

/** `selectionFromPrefixes` on every country, with keys instead of prefixes. */
export function selectionFromRegion(
  combined: CombinedMap,
  region: PostalCodesByCountry
): MapSelection {
  const result: MapSelection = { areas: new Set(), partial: new Set(), finer: [] };
  for (const map of combined.maps) {
    const key = (prefix: string) => areaKey(map.country, prefix);
    const selection = selectionFromPrefixes(map, region[map.country] ?? []);
    for (const prefix of selection.areas) result.areas.add(key(prefix));
    for (const prefix of selection.partial) result.partial.add(key(prefix));
    result.finer.push(...selection.finer.map(key));
  }
  return result;
}

/** `prefixesFromSelection` on every country: the region to store for the chosen keys. */
export function regionFromSelection(
  combined: CombinedMap,
  keys: ReadonlySet<string>,
  finer: string[] = []
): PostalCodesByCountry {
  const region: PostalCodesByCountry = {};
  for (const map of combined.maps) {
    const own = (list: Iterable<string>) =>
      [...list].map(splitKey).filter((key) => key.country === map.country);
    const areas = new Set(own(keys).map((key) => key.prefix));
    const prefixes = prefixesFromSelection(
      map,
      areas,
      own(finer).map((key) => key.prefix)
    );
    if (prefixes.length) region[map.country] = prefixes;
  }
  return compactRegion(region);
}
