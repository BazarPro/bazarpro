import i18n from '../../i18n';
import { formatDateTimeDE } from '../../lib/utils';
import { formatRegion, postalRegion } from '../../shared/postalCodes';
import {
  getRegistrationState,
  type RegistrationState,
  type StoredEventFeatures,
} from '../../shared/eventFeatures';

/** What a bazaar tells people who think about selling there. */
export type RegistrationEvent = {
  features?: StoredEventFeatures;
  vendorLimit?: number;
  /** Places taken; the backend sends it with a `vendorLimit` */
  sellerCount?: number;
};

/** Places left for sellers; undefined without a limit. */
export function spotsLeft(event: RegistrationEvent): number | undefined {
  const { vendorLimit, sellerCount } = event;
  if (!vendorLimit || vendorLimit <= 0 || sellerCount === undefined) return undefined;
  return Math.max(0, vendorLimit - sellerCount);
}

/** "Anmeldung geschlossen" or "Anmeldung ab 14.03.2026, 10:00"; nothing while it is open. */
export function registrationClosedText(state: RegistrationState): string | undefined {
  if (state.open) return undefined;
  return state.reason === 'notYet'
    ? i18n.t('registration.opensAt', { ns: 'events', time: formatDateTimeDE(state.opensAt) })
    : i18n.t('registration.closed', { ns: 'events' });
}

export interface RegistrationInfo {
  /** Why nobody joins on their own right now: closed, not open yet, or all places taken */
  blocked?: string;
  /** Only an invitation helps (closed or not open yet), not with all places taken */
  invitationHelps?: boolean;
  /** While open with an end: "Anmeldung bis 14.03.2026, 18:00" */
  until?: string;
  /** While open with a seller limit: "Noch 12 von 50 Plätzen frei" */
  spots?: string;
  /** Only for sellers from the region (#304): "Nur aus PLZ 89…, 7322…" */
  region?: string;
}

/** "Nur aus PLZ 89…, 7322…" for a bazaar of its region; undefined for everyone else. */
export function regionText(event: RegistrationEvent): string | undefined {
  const region = postalRegion(event.features);
  return region
    ? i18n.t('registration.region', { ns: 'events', codes: formatRegion(region, 4) })
    : undefined;
}

/**
 * Who joins other than through the public registration, as the backend lets them in:
 * - `team`: organizer and helpers, at any time and without taking a place
 * - `helperInvitation`: invited as helper, also without taking a place
 * - `invitation`: invited as seller, past a closed registration but not past the limit
 */
export type Admission = 'team' | 'helperInvitation' | 'invitation';

/**
 * The registration as sellers see it on the bazaar page, in the list and in the join
 * dialog: whether they can join, until when, and how many places are left.
 */
export function describeRegistration(
  event: RegistrationEvent,
  now: number,
  admission?: Admission
): RegistrationInfo {
  if (admission === 'team' || admission === 'helperInvitation') return {};
  const state = getRegistrationState(event, now);
  const closed = admission === 'invitation' ? undefined : registrationClosedText(state);
  if (closed) return { blocked: closed, invitationHelps: true };
  const left = spotsLeft(event);
  if (left === 0) return { blocked: i18n.t('registration.full', { ns: 'events' }) };
  return {
    until:
      admission !== 'invitation' && state.open && state.closesAt !== undefined
        ? i18n.t('registration.until', { ns: 'events', time: formatDateTimeDE(state.closesAt) })
        : undefined,
    spots:
      left === undefined
        ? undefined
        : i18n.t('registration.spotsLeft', { ns: 'events', count: left, limit: event.vendorLimit }),
    // An invitation passes the region
    region: admission === 'invitation' ? undefined : regionText(event),
  };
}
