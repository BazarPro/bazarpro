import { COUNTRIES, type Country } from './constants';
import type { StoredEventFeatures } from './eventFeatures';

/** Prefixes of postal codes per country as stored, e.g. `{ DE: ['89'], AT: ['6'] }` */
export type PostalCodesByCountry = Partial<Record<Country, string[]>>;

/**
 * A bazaar for its region (#304): only sellers whose postal code starts with one of the
 * prefixes of their country join on their own; a region near a border reaches into the
 * neighbouring countries. Mirrors `PostalCodes` in backend/src/modules/features.rs.
 */
export interface PostalRegion {
  /** In the order of COUNTRIES, only countries with prefixes */
  parts: {
    country: Country;
    /** Digits only, e.g. "89" or "7322" */
    prefixes: string[];
  }[];
}

/** Digits of a postal code: "L-1234" in Luxembourg is "1234". */
export function postalCodeDigits(code: string): string {
  return code.replace(/\D/g, '');
}

const COUNTRY_NAMES: Record<string, Country> = {
  DEUTSCHLAND: 'DE',
  GERMANY: 'DE',
  ÖSTERREICH: 'AT',
  AUSTRIA: 'AT',
  SCHWEIZ: 'CH',
  SWITZERLAND: 'CH',
  LUXEMBURG: 'LU',
  LUXEMBOURG: 'LU',
  LIECHTENSTEIN: 'LI',
};

/**
 * The country of a profile as code; without one it is Germany, like the address of a
 * bazaar. Older profiles may hold the name ("Deutschland").
 */
export function profileCountry(country: string | null | undefined): string {
  const upper = (country ?? '').trim().toUpperCase();
  if (!upper) return 'DE';
  return COUNTRY_NAMES[upper] ?? upper;
}

/** The region of the bazaar; undefined when everyone may join. */
export function postalRegion(features: object | null | undefined): PostalRegion | undefined {
  const stored = (features as Pick<StoredEventFeatures, 'allowedPostalCodes'> | undefined)
    ?.allowedPostalCodes;
  const parts = COUNTRIES.map((country) => ({
    country,
    prefixes: (Array.isArray(stored?.[country]) ? stored[country] : [])
      .map(postalCodeDigits)
      .filter((prefix) => prefix.length > 0),
  })).filter((part) => part.prefixes.length > 0);
  return parts.length ? { parts } : undefined;
}

/** Whether a seller with this postal code and country is from the region. */
export function admitsPostalCode(
  region: PostalRegion,
  postalCode: string | null | undefined,
  country: string | null | undefined
): boolean {
  const digits = postalCodeDigits(postalCode ?? '');
  const own = profileCountry(country);
  return (
    digits.length > 0 &&
    region.parts.some(
      (part) => part.country === own && part.prefixes.some((prefix) => digits.startsWith(prefix))
    )
  );
}

/**
 * The prefixes per country as stored: each list short (see compactPrefixes), countries
 * without prefixes left out.
 */
export function compactRegion(region: PostalCodesByCountry): PostalCodesByCountry {
  const result: PostalCodesByCountry = {};
  for (const country of COUNTRIES) {
    const prefixes = compactPrefixes(region[country] ?? []);
    if (prefixes.length) result[country] = prefixes;
  }
  return result;
}

/** Country marks typed in front of a postal code: "A-6900", "AT 6900", "L-1234" */
const TYPED_COUNTRIES: Record<string, Country> = {
  D: 'DE',
  DE: 'DE',
  A: 'AT',
  AT: 'AT',
  CH: 'CH',
  FL: 'LI',
  LI: 'LI',
  L: 'LU',
  LU: 'LU',
};

/** "89073" in the bazaar's country, "AT-6900" in Austria; undefined when it is none. */
export function parseTypedCode(
  text: string,
  home: Country
): { country: Country; digits: string } | undefined {
  const match = /^\s*([a-z]{1,2})?[\s-]*(\d[\d\s]*)$/i.exec(text);
  if (!match) return undefined;
  const country = match[1] ? TYPED_COUNTRIES[match[1].toUpperCase()] : home;
  return country ? { country, digits: postalCodeDigits(match[2]) } : undefined;
}

/** Number of prefixes of all countries. */
export function regionSize(region: PostalCodesByCountry | undefined): number {
  return COUNTRIES.reduce((sum, country) => sum + (region?.[country]?.length ?? 0), 0);
}

/**
 * Prefixes as stored: digits only, without those a shorter one covers ("89" covers "890"),
 * sorted. Mirrors `sanitize_postal_codes` in the backend.
 */
export function compactPrefixes(prefixes: Iterable<string>): string[] {
  const clean = [...new Set([...prefixes].map(postalCodeDigits).filter(Boolean))].sort(
    (a, b) => a.length - b.length || a.localeCompare(b)
  );
  const kept: string[] = [];
  for (const prefix of clean) {
    if (!kept.some((shorter) => prefix.startsWith(shorter))) kept.push(prefix);
  }
  return kept.sort();
}

/**
 * "89…, 7322… (Deutschland), 6… (Österreich)" with `name`; without it the countries as
 * codes, and none for a region of one country: "89…, 7322…". With `max`, the rest as "+3".
 */
export function formatRegion(
  region: PostalRegion,
  max = Infinity,
  name?: (country: Country) => string
): string {
  let left = max;
  let hidden = 0;
  const parts: string[] = [];
  for (const { country, prefixes } of region.parts) {
    const shown = prefixes.slice(0, Math.max(left, 0));
    left -= shown.length;
    hidden += prefixes.length - shown.length;
    if (!shown.length) continue;
    const codes = formatPrefixes(shown);
    parts.push(
      name
        ? `${codes} (${name(country)})`
        : region.parts.length > 1
          ? `${codes} (${country})`
          : codes
    );
  }
  const text = parts.join(', ');
  return hidden > 0 ? `${text} +${hidden}` : text;
}

/** "89…, 7322…"; with `max`, the rest as "+3". */
export function formatPrefixes(prefixes: string[], max = Infinity): string {
  const shown = prefixes.slice(0, max).map((prefix) => `${prefix}…`);
  const rest = prefixes.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}
