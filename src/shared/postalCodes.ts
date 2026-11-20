import { COUNTRIES, type Country } from './constants';
import type { StoredEventFeatures } from './eventFeatures';

/**
 * A bazaar for its region (#304): only sellers whose postal code starts with one of the
 * prefixes, in one country, join on their own. Mirrors `PostalCodes` in
 * backend/src/modules/features.rs.
 */
export interface PostalRegion {
  country: Country;
  /** Digits only, e.g. "89" or "7322" */
  prefixes: string[];
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

function isCountry(value: string | undefined): value is Country {
  return COUNTRIES.some((code) => code === value);
}

/** The region of the bazaar; undefined when everyone may join. */
export function postalRegion(features: StoredEventFeatures | undefined): PostalRegion | undefined {
  const prefixes = (features?.allowedPostalCodes ?? [])
    .map(postalCodeDigits)
    .filter((prefix) => prefix.length > 0);
  if (prefixes.length === 0) return undefined;
  const country = features?.postalCodeCountry;
  return { country: isCountry(country) ? country : 'DE', prefixes };
}

/** Whether a seller with this postal code and country is from the region. */
export function admitsPostalCode(
  region: PostalRegion,
  postalCode: string | null | undefined,
  country: string | null | undefined
): boolean {
  const digits = postalCodeDigits(postalCode ?? '');
  return (
    digits.length > 0 &&
    profileCountry(country) === region.country &&
    region.prefixes.some((prefix) => digits.startsWith(prefix))
  );
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

/** "89…, 7322…"; with `max`, the rest as "+3". */
export function formatPrefixes(prefixes: string[], max = Infinity): string {
  const shown = prefixes.slice(0, max).map((prefix) => `${prefix}…`);
  const rest = prefixes.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ');
}
