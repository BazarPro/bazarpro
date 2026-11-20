import { describe, expect, it } from 'vitest';
import germany from '../assets/postal-areas/DE.json';
import {
  areaContains,
  areasWithin,
  distanceKm,
  loadPostalMap,
  pathRings,
  positionOf,
  prefixesFromSelection,
  project,
  selectionFromPrefixes,
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

  it('loads every country of the app', async () => {
    for (const country of ['DE', 'AT', 'CH', 'LI', 'LU'] as const) {
      const map = await loadPostalMap(country);
      expect(map.country).toBe(country);
      expect(map.areas.length).toBeGreaterThan(0);
    }
  });
});
