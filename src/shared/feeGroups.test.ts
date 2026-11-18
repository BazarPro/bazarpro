import { describe, expect, it } from 'vitest';
import { appliedGroup, compareFees, groupFees, type FeeGroup } from './feeGroups';

// The same cases as the tests of backend/src/modules/fee_groups.rs
const members: FeeGroup = {
  id: 'members',
  label: 'Mitglieder',
  commission: 5,
  assignment: 'selfDeclared',
  proofHint: 'Ausweis zeigen',
};
const helpers: FeeGroup = {
  id: 'helpers',
  label: 'Helfer',
  commission: 0,
  intakeFee: 0.5,
  maxItemsPerSeller: 40,
  assignment: 'helpers',
};
const event = {
  commission: 10,
  features: {
    intakeFee: 1,
    maxFeesPerSeller: 20,
    maxItemsPerSeller: 20,
    feeGroups: [members, helpers],
  },
};

describe('fee groups', () => {
  it('have their own fees and fall back to the bazaar for cap and item limit', () => {
    expect(groupFees(event, members)).toEqual({
      commission: 5,
      intakeFee: undefined,
      maxFeesPerSeller: 20,
      maxItemsPerSeller: 20,
    });
    expect(groupFees(event, helpers).maxItemsPerSeller).toBe(40);
  });

  it('give who is in two groups the cheapest', () => {
    expect(appliedGroup(event, undefined, false)).toBeUndefined();
    expect(appliedGroup(event, 'gone', false)).toBeUndefined();
    expect(appliedGroup(event, 'members', false)).toBe(members);
    expect(appliedGroup(event, undefined, true)).toBe(helpers);
    expect(appliedGroup(event, 'members', true)).toBe(helpers);
  });

  it('compare by commission, then intake fee, then cap', () => {
    expect(compareFees({ commission: 5 }, { commission: 6, intakeFee: 0 })).toBeLessThan(0);
    expect(compareFees({ commission: 5, intakeFee: 1 }, { commission: 5 })).toBeGreaterThan(0);
    expect(compareFees({ commission: 5, maxFeesPerSeller: 10 }, { commission: 5 })).toBeLessThan(0);
  });
});
