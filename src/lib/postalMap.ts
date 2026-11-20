import type { Country } from '../shared/constants';
import { compactPrefixes, postalCodeDigits } from '../shared/postalCodes';

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

const ringCache = new WeakMap<PostalArea, Point[][]>();
function ringsOf(area: PostalArea): Point[][] {
  let rings = ringCache.get(area);
  if (!rings) {
    rings = pathRings(area.d);
    ringCache.set(area, rings);
  }
  return rings;
}

/** Whether the point lies in the area. */
export function areaContains(area: PostalArea, point: Point): boolean {
  // Holes count as rings too: an odd number of rings around the point is inside
  return ringsOf(area).filter((ring) => inRing(point, ring)).length % 2 === 1;
}

/** Share of an area's border needed inside the circle for the area to count */
const BORDER_SHARE = 0.3;

/**
 * The prefixes of the areas the circle covers: the one around its centre, those whose
 * centre lies in it, and those with a good part of their border in it. A large area
 * whose centre is far away, e.g. a town next door, counts as well.
 */
export function areasWithin(data: PostalMapData, center: Point, km: number): string[] {
  if (km <= 0) return [];
  return data.areas
    .filter((area) => {
      if (distanceKm(area.c, center) <= km || areaContains(area, center)) return true;
      const points = ringsOf(area).flat();
      const inside = points.filter((point) => distanceKm(point, center) <= km).length;
      // Areas too small to draw have no border
      return points.length > 0 && inside >= points.length * BORDER_SHARE;
    })
    .map((area) => area.p);
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
