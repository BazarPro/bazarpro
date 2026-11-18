/**
 * The fee cap per seller (features.maxFeesPerSeller, #301): a seller pays at most this
 * much in fees, commission and intake fee together. The backend has the same rules
 * (fee_cap_credit and capped_commission in backend/src/modules/sales.rs). Amounts in €,
 * computed in cents.
 */

const cents = (euro: number) => Math.round(euro * 100);

/** What the cap gives back of a seller's fees: everything above it; 0 without a cap. */
export function feeCapCredit(fees: number, cap: number | undefined): number {
  if (cap === undefined) return 0;
  return Math.max(cents(fees) - cents(cap), 0) / 100;
}

/**
 * The commission of a direct sale under the cap: at most what is left of it after the
 * commissions the seller paid before.
 */
export function cappedCommission(commission: number, paid: number, cap: number | undefined) {
  if (cap === undefined) return commission;
  return Math.min(cents(commission), Math.max(cents(cap) - cents(paid), 0)) / 100;
}
