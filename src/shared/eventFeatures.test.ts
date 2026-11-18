import { describe, expect, test } from 'vitest';
import {
  describeAttributes,
  getCategoryFields,
  fieldMaxLength,
  requirableFields,
  type CategoryField,
  sanitizeAttributes,
} from './categoryFields';
import {
  DEFAULT_EVENT_FEATURES,
  areOffersOpen,
  areQuestionsOpen,
  getDiscountAvailability,
  getRegistrationState,
  missingInfoLabel,
  resolveEventFeatures,
} from './eventFeatures';

/** A field as admins define it (category_field_definitions). */
const field = (id: string, label: string, extra: Partial<CategoryField> = {}): CategoryField => ({
  _id: id,
  key: id,
  label,
  short: false,
  notFoundButton: false,
  ...extra,
});
const FRAME_NUMBER = field('frameNumber', 'Rahmennummer', { labelEn: 'Frame number' });
const BRAND = field('brand', 'Marke');
const SIZE = field('clothingSize', 'Größe', { key: 'size', short: true });

describe('category fields', () => {
  test('come with the category, as the server resolved them', () => {
    const categories = [{ _id: 'bikes', fieldList: [FRAME_NUMBER, BRAND] }, { _id: 'books' }];
    expect(getCategoryFields('bikes', categories)).toEqual([FRAME_NUMBER, BRAND]);
    expect(getCategoryFields('books', categories)).toEqual([]);
    expect(getCategoryFields('gone', categories)).toEqual([]);
    expect(getCategoryFields(undefined, categories)).toEqual([]);
    expect(getCategoryFields('bikes', undefined)).toEqual([]);
  });

  test('one per key can be required, short ones fit on the labels', () => {
    const shoeSize = field('shoeSize', 'Größe (EU)', { key: 'size', short: true });
    expect(requirableFields([FRAME_NUMBER, SIZE, shoeSize]).map((f) => f._id)).toEqual([
      'frameNumber',
      'clothingSize',
    ]);
    expect(requirableFields(undefined)).toEqual([]);
    expect(fieldMaxLength(SIZE)).toBe(7);
    expect(fieldMaxLength(BRAND)).toBe(120);
  });

  test('sanitize keeps known, non-empty, trimmed and shortened values', () => {
    const fields = [FRAME_NUMBER, BRAND, SIZE];
    expect(
      sanitizeAttributes(fields, {
        frameNumber: '  WBK 1  ',
        brand: '',
        colour: 'rot',
        size: '134/140/146',
      })
    ).toEqual({ frameNumber: 'WBK 1', size: '134/140' });
    expect(sanitizeAttributes(fields, { brand: '   ' })).toBeUndefined();
    expect(sanitizeAttributes(fields, undefined)).toBeUndefined();
  });

  test('describe lists values in category order with both names', () => {
    expect(
      describeAttributes([FRAME_NUMBER, BRAND], { brand: 'Cube', frameNumber: 'WBK 1' })
    ).toEqual([
      { label: 'Rahmennummer', labelEn: 'Frame number', text: 'frameNumber', value: 'WBK 1' },
      { label: 'Marke', labelEn: undefined, text: 'brand', value: 'Cube' },
    ]);
    expect(describeAttributes([BRAND], undefined)).toEqual([]);
  });
});

describe('event feature helpers', () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_800_000_000_000;
  const running = { startDate: now - HOUR, endDate: now + HOUR };

  test('missing features fall back to the old behaviour', () => {
    expect(resolveEventFeatures({})).toEqual(DEFAULT_EVENT_FEATURES);
  });

  test('maximum discount is clamped to 1–50 and rounded', () => {
    expect(resolveEventFeatures({ features: { maxDiscountPercent: 80 } }).maxDiscountPercent).toBe(
      50
    );
    expect(resolveEventFeatures({ features: { maxDiscountPercent: 0 } }).maxDiscountPercent).toBe(
      1
    );
    expect(
      resolveEventFeatures({ features: { maxDiscountPercent: 22.6 } }).maxDiscountPercent
    ).toBe(23);
  });

  test('discounts: switched off, outside the event, before start time, allowed', () => {
    expect(getDiscountAvailability({ ...running, features: { discounts: false } }, now)).toEqual({
      allowed: false,
      reason: expect.stringContaining('keine Rabatte'),
      code: 'discount.none',
    });
    expect(getDiscountAvailability(running, now + 2 * HOUR).allowed).toBe(false);
    expect(getDiscountAvailability(running, now - 2 * HOUR).allowed).toBe(false);
    expect(
      getDiscountAvailability({ ...running, features: { discountStartsAt: now + 1 } }, now)
    ).toEqual({
      allowed: false,
      reason: expect.stringContaining('Uhrzeit'),
      code: 'discount.notYet',
    });
    expect(
      getDiscountAvailability({ ...running, features: { discountStartsAt: now } }, now)
    ).toEqual({ allowed: true });
  });
});

describe('opening rules', () => {
  const event = { startDate: 1000, endDate: 2000 };

  test('questions: switched off, any time, or only while the bazaar runs', () => {
    expect(areQuestionsOpen({ ...event, features: { questions: false } }, 1500)).toBe(false);
    expect(areQuestionsOpen({ ...event, features: { questions: true } }, 500)).toBe(true);
    const during = { ...event, features: { questions: true, questionsDuringEventOnly: true } };
    expect(areQuestionsOpen(during, 500)).toBe(false);
    expect(areQuestionsOpen(during, 1500)).toBe(true);
  });

  test('offers only for handed-in items while the bazaar runs', () => {
    expect(areOffersOpen({ ...event, status: 'available' }, 1500)).toBe(true);
    expect(areOffersOpen({ ...event, status: 'announced' }, 1500)).toBe(false);
    expect(areOffersOpen({ ...event, status: 'available' }, 2500)).toBe(false);
  });

  test('missing info is named for the error message', () => {
    const fields = [{ key: 'frameNumber', text: 'frameNumber', label: 'Rahmennummer' }] as never;
    expect(missingInfoLabel('photo', fields)).toBe('Foto');
    expect(missingInfoLabel('field:frameNumber', fields)).toBe('Rahmennummer');
    expect(missingInfoLabel('field:brand', fields)).toBe('brand');
  });
});

describe('getRegistrationState', () => {
  const now = Date.UTC(2026, 2, 1, 10);
  const hour = 3_600_000;
  const state = (features: Record<string, unknown>) => getRegistrationState({ features }, now);

  test('open by default, also for bazaars from before the setting', () => {
    expect(getRegistrationState({}, now)).toEqual({ open: true });
  });

  test('switched off', () => {
    expect(state({ registrationOpen: false })).toEqual({ open: false, reason: 'closed' });
  });

  test('before, within and after the window', () => {
    expect(state({ registrationStartsAt: now + hour })).toEqual({
      open: false,
      reason: 'notYet',
      opensAt: now + hour,
    });
    expect(state({ registrationStartsAt: now - hour, registrationEndsAt: now + hour })).toEqual({
      open: true,
      closesAt: now + hour,
    });
    // The end itself is closed already, as in the backend
    expect(state({ registrationEndsAt: now })).toEqual({ open: false, reason: 'closed' });
  });
});
