import type { Id } from '../../../../../lib/api/types';
import type { ProductWithStatus } from './inventoryTypes';

/** Returns stay possible while the settlement runs (sales::SETTLEMENT_DAYS) */
const SETTLEMENT_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Items left over after the bazaar (#305): still available, of sellers not paid out yet.
 * The team may return them at once from the "…" menu; otherwise the cron does the night
 * after the bazaar and its pickup.
 */
export function leftoversOf(
  products: ProductWithStatus[] | undefined,
  isVendorPaid: (vendorId: Id<'users'>) => boolean,
  endDate: number | undefined,
  now: number
): ProductWithStatus[] {
  if (!products || endDate === undefined) return [];
  if (endDate >= now || endDate + SETTLEMENT_MS <= now) return [];
  return products.filter((p) => p.status === 'available' && !isVendorPaid(p.vendorId));
}
