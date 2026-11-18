import { describe, expect, it } from 'vitest';
import { cappedCommission, feeCapCredit } from './feeCap';

// The same cases as the tests of backend/src/modules/sales.rs
describe('fee cap', () => {
  it('gives back what is above the cap', () => {
    expect(feeCapCredit(35, undefined)).toBe(0);
    expect(feeCapCredit(15, 20)).toBe(0);
    expect(feeCapCredit(20, 20)).toBe(0);
    expect(feeCapCredit(35.5, 20)).toBe(15.5);
    // A cap of 0 waives every fee
    expect(feeCapCredit(3, 0)).toBe(3);
    // No float rest: 0.1 + 0.2 is not above 0.3
    expect(feeCapCredit(0.1 + 0.2, 0.3)).toBe(0);
  });

  it('takes commission at a direct sale up to the cap', () => {
    expect(cappedCommission(14, 0, undefined)).toBe(14);
    expect(cappedCommission(14, 0, 20)).toBe(14);
    expect(cappedCommission(14, 14, 20)).toBe(6);
    expect(cappedCommission(14, 20, 20)).toBe(0);
    // Paid more before the cap was lowered: nothing more, never a refund
    expect(cappedCommission(5, 25, 20)).toBe(0);
  });

  it('agrees with the settlement', () => {
    let paid = 0;
    for (let sale = 0; sale < 3; sale++) paid += cappedCommission(14, paid, 20);
    expect(paid).toBe(20);
    expect(feeCapCredit(paid + 3, 20)).toBe(3);
  });
});
