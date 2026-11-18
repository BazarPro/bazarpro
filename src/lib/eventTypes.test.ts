import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, findEventType } from './eventTypes';
import { resolveEventFeatures, showsPriceOnLabel } from '../shared/eventFeatures';
import { REQUIRABLE_FIELD_KEYS } from '../shared/categoryFields';
import i18n from '../i18n';

describe('event types', () => {
  it('each has texts in every language and valid settings', () => {
    for (const type of EVENT_TYPES) {
      for (const lng of ['de', 'en']) {
        for (const part of ['title', 'text']) {
          const key = `eventTypes.${type.id}.${part}`;
          expect(i18n.exists(key, { ns: 'organizer', lng }), `${lng} ${key}`).toBe(true);
        }
      }
      for (const key of type.features.requiredFields ?? []) {
        expect(REQUIRABLE_FIELD_KEYS).toContain(key);
      }
      // A printed price only works without discounts
      if (type.features.priceOnLabel) expect(showsPriceOnLabel(type)).toBe(true);
    }
  });

  it('uses universal labels at every kind of bazaar', () => {
    const marks = Object.fromEntries(
      EVENT_TYPES.map((type) => [type.id, resolveEventFeatures(type).labelMark])
    );
    expect(marks).toEqual({
      kidsBazaar: 'universal',
      clothingBazaar: 'universal',
      skiBazaar: 'universal',
      bikeExchange: 'universal',
    });
  });

  it('the most asked for kinds come first, each with examples for the previews', () => {
    expect(EVENT_TYPES.map((type) => type.id)).toEqual([
      'kidsBazaar',
      'clothingBazaar',
      'skiBazaar',
      'bikeExchange',
    ]);
    for (const type of EVENT_TYPES) {
      for (const lng of ['de', 'en']) {
        const t = i18n.getFixedT(lng, 'organizer');
        const items = t(`eventTypes.${type.id}.exampleItems`, { returnObjects: true });
        const highlights = t(`eventTypes.${type.id}.highlights`, { returnObjects: true });
        expect(items, `${lng} ${type.id}`).toHaveLength(type.examplePrices.length);
        expect(highlights, `${lng} ${type.id}`).toHaveLength(3);
      }
    }
  });

  it('preselects the categories of each kind', () => {
    const match = (id: string, label: string) =>
      EVENT_TYPES.find((type) => type.id === id)!.categoryMatch!.test(label);
    expect(match('kidsBazaar', 'Spielzeug')).toBe(true);
    expect(match('skiBazaar', 'Sport')).toBe(true);
    expect(match('bikeExchange', 'Fahrräder')).toBe(true);
    expect(match('bikeExchange', 'Radios')).toBe(false);
    // Children's vehicles at both, cargo bikes, trailers and accessories only at the bike sale
    for (const label of [
      'Kinderfahrräder',
      'Laufräder',
      'Roller & Scooter',
      'Einräder',
      'Bobbycars & Rutschfahrzeuge',
      'Kinderfahrzeuge',
    ]) {
      expect(match('kidsBazaar', label), label).toBe(true);
      expect(match('bikeExchange', label), label).toBe(true);
    }
    for (const label of [
      'Lastenräder',
      'E-Bikes & Pedelecs',
      'Fahrradanhänger',
      'Fahrradzubehör',
    ]) {
      expect(match('bikeExchange', label), label).toBe(true);
      expect(match('kidsBazaar', label), label).toBe(false);
    }
    expect(match('bikeExchange', 'Einrichtung')).toBe(false);
  });

  it('the bike sale follows the guide: frame number required and an intake fee', () => {
    const bikes = findEventType('bikeExchange')!;
    expect(bikes.features.requiredFields).toEqual(['frameNumber']);
    expect(bikes.features.intakeFee).toBe(3);
    expect(bikes.features.photosOptional).toBe(false);
    expect(bikes.features.priceOffers && bikes.features.minimumPrice).toBe(true);
  });

  it('drafts may name a kind that no longer exists', () => {
    expect(findEventType('bikeMarketRecord')).toBeUndefined();
    expect(findEventType('skiBazaar')?.item).toBe('ski');
  });
});
