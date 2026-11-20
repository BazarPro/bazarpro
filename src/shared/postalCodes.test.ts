import { describe, expect, it } from 'vitest';
import {
  admitsPostalCode,
  compactPrefixes,
  compactRegion,
  formatPrefixes,
  formatRegion,
  regionSize,
  postalCodeDigits,
  postalRegion,
  profileCountry,
} from './postalCodes';

describe('postal regions (#304)', () => {
  it('reads the region from the features', () => {
    expect(postalRegion(undefined)).toBeUndefined();
    expect(postalRegion({ allowedPostalCodes: {} })).toBeUndefined();
    expect(postalRegion({ allowedPostalCodes: { DE: [] } })).toBeUndefined();
    expect(postalRegion({ allowedPostalCodes: { AT: ['69'], DE: ['89', ' 7322'] } })).toEqual({
      parts: [
        { country: 'DE', prefixes: ['89', '7322'] },
        { country: 'AT', prefixes: ['69'] },
      ],
    });
  });

  it('admits postal codes of the region in their own country only', () => {
    const region = { parts: [{ country: 'DE' as const, prefixes: ['89', '7322'] }] };
    expect(admitsPostalCode(region, '89073', 'DE')).toBe(true);
    expect(admitsPostalCode(region, '73223', 'Deutschland')).toBe(true);
    expect(admitsPostalCode(region, '89073', undefined)).toBe(true);
    expect(admitsPostalCode(region, '88400', 'DE')).toBe(false);
    expect(admitsPostalCode(region, '8900', 'AT')).toBe(false);
    expect(admitsPostalCode(region, '', 'DE')).toBe(false);
    const border = postalRegion({ allowedPostalCodes: { DE: ['88'], AT: ['69'], LU: ['49'] } })!;
    expect(admitsPostalCode(border, 'L-4968', 'Luxemburg')).toBe(true);
    expect(admitsPostalCode(border, '6900', 'AT')).toBe(true);
    expect(admitsPostalCode(border, '6900', 'DE')).toBe(false);
    expect(admitsPostalCode(border, '88131', 'DE')).toBe(true);
  });

  it('keeps prefixes short, like the backend stores them', () => {
    expect(compactPrefixes(['890', '89', '7322', '73', 'x', '7322'])).toEqual(['73', '89']);
    expect(compactPrefixes(['8907', '890'])).toEqual(['890']);
    expect(postalCodeDigits('L-1234')).toBe('1234');
    expect(profileCountry(' at ')).toBe('AT');
    expect(profileCountry('Schweiz')).toBe('CH');
  });

  it('writes the prefixes for people', () => {
    expect(formatPrefixes(['89', '7322'])).toBe('89…, 7322…');
    expect(formatPrefixes(['1', '2', '3', '4'], 2)).toBe('1…, 2… +2');
    const one = postalRegion({ allowedPostalCodes: { DE: ['89', '7322'] } })!;
    expect(formatRegion(one)).toBe('89…, 7322…');
    const two = postalRegion({ allowedPostalCodes: { DE: ['88', '89'], AT: ['69', '68'] } })!;
    expect(formatRegion(two)).toBe('88…, 89… (DE), 69…, 68… (AT)');
    expect(formatRegion(two, 3)).toBe('88…, 89… (DE), 69… (AT) +1');
    expect(
      formatRegion(two, 12, (country) => (country === 'DE' ? 'Deutschland' : 'Österreich'))
    ).toBe('88…, 89… (Deutschland), 69…, 68… (Österreich)');
  });

  it('keeps each country of a region short', () => {
    expect(compactRegion({ AT: ['690', '69'], DE: [], CH: ['8'] })).toEqual({
      AT: ['69'],
      CH: ['8'],
    });
    expect(regionSize({ AT: ['69'], DE: ['88', '89'] })).toBe(3);
  });
});
