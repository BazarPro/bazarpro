import { describe, expect, it } from 'vitest';
import germany from '../assets/postal-areas/DE.json';
import {
  areaAt,
  areaContains,
  areasIn,
  areasWithin,
  combineMaps,
  keysWithin,
  loadAllPostalMaps,
  regionFromSelection,
  selectionFromRegion,
  distanceKm,
  loadPostalMap,
  pathRings,
  positionOf,
  prefixesFromSelection,
  project,
  selectionFromPrefixes,
  townRankAt,
  unproject,
  type PostalMapData,
} from './postalMap';

const data = germany as PostalMapData;
const ulm = project(9.9876, 48.4011);

describe('postal map (#304)', () => {
  it('projects back and forth and measures on the ground', () => {
    const back = unproject(ulm);
    expect(back.longitude).toBeCloseTo(9.9876, 4);
    expect(back.latitude).toBeCloseTo(48.4011, 4);
    // Ulm – Munich is about 123 km as the crow flies
    expect(distanceKm(ulm, project(11.5755, 48.1372))).toBeCloseTo(123, -1);
  });

  it('reads the paths of the build script', () => {
    expect(pathRings('M10 20l5 0 0-5-5 5zM0 0l1 1z')).toEqual([
      [
        [10, 20],
        [15, 20],
        [15, 15],
        [10, 20],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ]);
  });

  it('finds the bazaar and the areas around it', () => {
    const neuUlm = positionOf(data, '89231');
    expect(neuUlm).toBeDefined();
    const area = data.areas.find((candidate) => candidate.p === '892')!;
    expect(areaContains(area, ulm)).toBe(false);
    const around = areasWithin(data, ulm, 20);
    // Ulm itself and Neu-Ulm across the river, nothing far away
    expect(around).toEqual(expect.arrayContaining(['890', '892']));
    expect(around).not.toContain('602');
    expect(around.length).toBeLessThan(10);
    expect(areasWithin(data, ulm, 0)).toEqual([]);
  });

  it('finds the area under a point and the areas in view', () => {
    const area890 = data.areas.find((area) => area.p === '890')!;
    expect(areaAt(data.areas, area890.c)?.p).toBe('890');
    // Far out in the North Sea
    expect(areaAt(data.areas, project(4, 55))).toBeUndefined();
    const [x, y] = area890.c;
    const near = areasIn(data.areas, [x - 100, y - 100, x + 100, y + 100]).map((a) => a.p);
    expect(near).toContain('890');
    expect(near).not.toContain('101');
    expect(near.length).toBeLessThan(40);
  });

  it('names the areas by their largest places and shows smaller towns close up', () => {
    const area = (prefix: string) => data.areas.find((candidate) => candidate.p === prefix)!;
    expect(area('893').n).toEqual(['Günzburg', 'Burgau', 'Ichenhausen']);
    expect(area('804').n).toEqual(['München']);
    expect(data.towns.some((town) => town.n === 'Senden' && town.r === 4)).toBe(true);
    expect([2, 0.6, 0.3, 0.1].map(townRankAt)).toEqual([1, 2, 3, 4]);
  });

  it('stores whole regions short and keeps finer prefixes', () => {
    const all89 = data.areas.filter((area) => area.p.startsWith('89')).map((area) => area.p);
    expect(prefixesFromSelection(data, new Set(all89))).toEqual(['89']);
    expect(prefixesFromSelection(data, new Set(['890', '892']), ['7322'])).toEqual([
      '7322',
      '890',
      '892',
    ]);
    const selection = selectionFromPrefixes(data, ['89', '7322']);
    expect(selection.areas.has('890')).toBe(true);
    expect(selection.partial.has('732')).toBe(true);
    expect(selection.finer).toEqual(['7322']);
  });

  it('joins the countries into one map with keyed areas', async () => {
    const combined = combineMaps(await loadAllPostalMaps());
    expect(combined.attribution).toBe('© OpenStreetMap · © GeoNames');
    const bregenz = combined.areas.find((area) => area.p === 'AT:690')!;
    expect(bregenz.l).toBe('690');
    // Lindau: the circle reaches Austria, and both are stored per country
    const lindau = project(9.6844, 47.5459);
    const keys = keysWithin(combined, lindau, 15);
    expect(keys).toEqual(expect.arrayContaining(['DE:881', 'AT:690']));
    const region = regionFromSelection(combined, new Set(['DE:881', 'AT:690']), ['DE:7322']);
    expect(region).toEqual({ DE: ['7322', '881'], AT: ['690'] });
    const selection = selectionFromRegion(combined, region);
    expect([...selection.areas]).toEqual(expect.arrayContaining(['DE:881', 'AT:690']));
    expect(selection.partial.has('DE:732')).toBe(true);
    expect(selection.finer).toEqual(['DE:7322']);
  });

  it('loads every country of the app', async () => {
    for (const country of ['DE', 'AT', 'CH', 'LI', 'LU'] as const) {
      const map = await loadPostalMap(country);
      expect(map.country).toBe(country);
      expect(map.areas.length).toBeGreaterThan(0);
    }
  });
});
