import { describe, expect, it } from 'vitest';
import { draftJson, withoutNulls } from './eventDraft';

describe('event drafts', () => {
  it('leave out empty numbers, which JSON would turn into null', () => {
    const values = {
      commission: 10,
      features: { maxFeesPerSeller: NaN, feeGroups: [{ id: 'g', intakeFee: NaN, commission: 5 }] },
    };
    expect(draftJson(values)).toEqual({
      commission: 10,
      features: { feeGroups: [{ id: 'g', commission: 5 }] },
    });
  });

  it('drop the nulls of older drafts, which no field accepts', () => {
    expect(
      withoutNulls({ intakeFee: null, feeGroups: [{ id: 'g', maxItemsPerSeller: null }], ok: 1 })
    ).toEqual({ feeGroups: [{ id: 'g' }], ok: 1 });
    expect(withoutNulls('text')).toBe('text');
  });
});
