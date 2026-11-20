import { describe, expect, it } from 'vitest';
import {
  admitsPostalCode,
  compactPrefixes,
  formatPrefixes,
  postalCodeDigits,
  postalRegion,
  profileCountry,
} from './postalCodes';

describe('postal regions (#304)', () => {
  it('reads the region from the features', () => {
    expect(postalRegion(undefined)).toBeUndefined();
    expect(postalRegion({ allowedPostalCodes: [] })).toBeUndefined();
    expect(postalRegion({ allowedPostalCodes: ['89', ' 7322'] })).toEqual({
      country: 'DE',
      prefixes: ['89', '7322'],
    });
    expect(postalRegion({ allowedPostalCodes: ['49'], postalCodeCountry: 'LU' })?.country).toBe(
      'LU'
    );
  });

  it('admits postal codes of the region in its country only', () => {
    const region = { country: 'DE' as const, prefixes: ['89', '7322'] };
    expect(admitsPostalCode(region, '89073', 'DE')).toBe(true);
    expect(admitsPostalCode(region, '73223', 'Deutschland')).toBe(true);
    expect(admitsPostalCode(region, '89073', undefined)).toBe(true);
    expect(admitsPostalCode(region, '88400', 'DE')).toBe(false);
    expect(admitsPostalCode(region, '8900', 'AT')).toBe(false);
    expect(admitsPostalCode(region, '', 'DE')).toBe(false);
    expect(admitsPostalCode({ country: 'LU', prefixes: ['49'] }, 'L-4968', 'Luxemburg')).toBe(true);
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
  });
});
