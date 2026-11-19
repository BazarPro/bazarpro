/**
 * Fee groups (features.feeGroups, #302): sellers with own fees instead of the bazaar's,
 * e.g. club members or helpers. Each group has its own fees ("5 % instead of 10 %"), not a
 * discount. The backend has the same rules (backend/src/modules/fee_groups.rs).
 */

/** How a seller gets into a group */
export type FeeGroupAssignment = 'selfDeclared' | 'helpers';

export interface FeeGroup {
  id: string;
  /** Chosen by the organizer, e.g. "Vereinsmitglieder" or "Helfer" */
  label: string;
  /** Percent of each sale for this group */
  commission: number;
  /** € per accepted item; unset: no intake fee */
  intakeFee?: number;
  /** Own fee cap; unset: the bazaar's */
  maxFeesPerSeller?: number;
  /** Own item limit per seller; unset: the bazaar's */
  maxItemsPerSeller?: number;
  /**
   * `selfDeclared`: the seller says so when joining, the team checks it at the intake.
   * `helpers`: everyone with a helper role, and whom the organizer puts in by hand.
   */
  assignment: FeeGroupAssignment;
  /** Shown to sellers, e.g. "Mitgliedsausweis bei der Abgabe zeigen" */
  proofHint?: string;
}

export const MAX_FEE_GROUPS = 4;

/** The fees one seller pays: the bazaar's or those of their group. */
export interface GroupFees {
  commission: number;
  intakeFee?: number;
  maxFeesPerSeller?: number;
  maxItemsPerSeller?: number;
}

interface FeesEvent {
  commission: number;
  features?: {
    intakeFee?: number;
    maxFeesPerSeller?: number;
    maxItemsPerSeller?: number;
    feeGroups?: FeeGroup[];
  };
}

export function eventFees(event: FeesEvent): GroupFees {
  const features = event.features ?? {};
  return {
    commission: event.commission,
    intakeFee: features.intakeFee && features.intakeFee > 0 ? features.intakeFee : undefined,
    maxFeesPerSeller: features.maxFeesPerSeller,
    maxItemsPerSeller: features.maxItemsPerSeller,
  };
}

/** The fees of a group; cap and item limit fall back to the bazaar's. */
export function groupFees(event: FeesEvent, group: FeeGroup): GroupFees {
  const base = eventFees(event);
  return {
    commission: group.commission,
    intakeFee: group.intakeFee && group.intakeFee > 0 ? group.intakeFee : undefined,
    maxFeesPerSeller: group.maxFeesPerSeller ?? base.maxFeesPerSeller,
    maxItemsPerSeller: group.maxItemsPerSeller ?? base.maxItemsPerSeller,
  };
}

/** Lower commission first, then lower intake fee, then lower cap (as the backend sorts). */
export function compareFees(a: GroupFees, b: GroupFees): number {
  return (
    a.commission - b.commission ||
    (a.intakeFee ?? 0) - (b.intakeFee ?? 0) ||
    (a.maxFeesPerSeller ?? Infinity) - (b.maxFeesPerSeller ?? Infinity) ||
    0
  );
}

/** The group whose fees apply: the chosen one and, for helpers, the helper groups; the cheapest. */
export function appliedGroup(
  event: FeesEvent,
  chosen: string | undefined,
  helper: boolean
): FeeGroup | undefined {
  return (event.features?.feeGroups ?? [])
    .filter((group) => group.id === chosen || (helper && group.assignment === 'helpers'))
    .sort((a, b) => compareFees(groupFees(event, a), groupFees(event, b)))[0];
}

/** A new id for a group: short, URL-safe, unique enough within one bazaar */
export function newFeeGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
