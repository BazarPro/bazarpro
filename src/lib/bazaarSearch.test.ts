import { describe, expect, it } from 'vitest';
import type { Doc } from './api/types';
import { distanceKm, locate, searchBazaars, suggestPlaces, type Places } from './bazaarSearch';
import places from '../assets/postal-centroids.json';

const PLACES = places as unknown as Places;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25);

function bazaar(id: string, extra: Partial<Doc<'events'>> = {}): Doc<'events'> {
  return {
    _id: id,
    title: id,
    description: '',
    location: '',
    startDate: NOW + 5 * DAY,
    endDate: NOW + 5 * DAY + 6 * 3600_000,
    categories: [],
    services: [],
    commission: 10,
    contactInfo: '',
    visibility: 'public',
    organizerId: 'u1',
    _creationTime: 0,
    ...extra,
  } as Doc<'events'>;
}

const search = (events: Doc<'events'>[], query: string, extra: object = {}) =>
  searchBazaars(events, {
    places: PLACES,
    origin: query ? locate(PLACES, query) : undefined,
    radius: 25,
    filters: { when: 'upcoming', conditions: [], categories: [] },
    categories: [],
    now: NOW,
    ...extra,
  });

describe('bazaar search', () => {
  it('finds postal codes and towns of the five countries', () => {
    expect(locate(PLACES, '89073')?.country).toBe('DE');
    expect(locate(PLACES, 'ulm')?.label).toBe('Ulm');
    expect(locate(PLACES, 'München')).toBeDefined();
    expect(locate(PLACES, '6900')?.country).toBe('AT');
    expect(locate(PLACES, 'Atlantis')).toBeUndefined();
    expect(suggestPlaces(PLACES, 'Neu-U')).toContain('Neu-Ulm');
  });

  it('measures distances on the ground', () => {
    const ulm = locate(PLACES, 'Ulm')!.position;
    const munich = locate(PLACES, 'München')!.position;
    expect(distanceKm(ulm, munich)).toBeGreaterThan(110);
    expect(distanceKm(ulm, munich)).toBeLessThan(140);
  });

  it('keeps the bazaars within the radius', () => {
    const near = bazaar('near', { postalCode: '89073' });
    const blaustein = bazaar('blaustein', { postalCode: '89134' });
    const far = bazaar('far', { postalCode: '80331' });
    const unknown = bazaar('unknown');
    const found = search([far, blaustein, near, unknown], '89075');
    expect(found.map((f) => f.event._id).sort()).toEqual(['blaustein', 'near']);
    // Without a place: all of them, soonest first
    expect(search([far, unknown], '')).toHaveLength(2);
  });

  it('filters by time and conditions', () => {
    const past = bazaar('past', { startDate: NOW - 10 * DAY, endDate: NOW - 9 * DAY });
    const direct = bazaar('direct', { features: { directSale: true } });
    const pricey = bazaar('pricey', { commission: 25 });
    const filters = (conditions: string[], when = 'upcoming') => ({
      filters: { when, conditions, categories: [] },
    });
    expect(search([past, direct], '', filters([])).map((f) => f.event._id)).toEqual(['direct']);
    expect(search([past, direct], '', filters([], 'past')).map((f) => f.event._id)).toEqual([
      'past',
    ]);
    expect(search([direct, pricey], '', filters(['directSale'])).map((f) => f.event._id)).toEqual([
      'direct',
    ]);
    expect(
      search([direct, pricey], '', filters(['lowCommission'])).map((f) => f.event._id)
    ).toEqual(['direct']);
  });

  it('sorts by date within a radius, by distance for any distance', () => {
    const later = bazaar('later', {
      postalCode: '89073',
      startDate: NOW + 60 * DAY,
      endDate: NOW + 61 * DAY,
    });
    const sooner = bazaar('sooner', { postalCode: '89134' });
    expect(search([later, sooner], '89075').map((f) => f.event._id)).toEqual(['sooner', 'later']);
    expect(search([later, sooner], '89075', { radius: undefined }).map((f) => f.event._id)).toEqual(
      ['later', 'sooner']
    );
  });
});
