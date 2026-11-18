import { formatPriceDE } from './utils';
import { feeCapCredit } from '../shared/feeCap';
import { resolveEventFeatures, type StoredEventFeatures } from '../shared/eventFeatures';
import { formatBerlinRange, formatBerlinTime } from '../shared/berlinTime';
import i18n, { currentLocale } from '../i18n';
import { dateLocale } from '../i18n/format';
import { requirableFields, type CategoryField } from '../shared/categoryFields';
import { categoryFieldText } from '../i18n/categoryFields';

function text(key: string, values?: Record<string, unknown>): string {
  return i18n.t(`conditions.${key}` as never, { ns: 'events', ...values }) as string;
}

export interface SellerFees {
  /** Percent of the sale price kept by the organizer */
  commission: number;
  /** Fixed € per accepted item, sold or not */
  intakeFee?: number;
  /** All fees of a seller together at most, in € */
  maxFeesPerSeller?: number;
}

/** What sellers agree to when they register; all of it comes from the event. */
export interface SellerConditionsEvent {
  commission: number;
  features?: StoredEventFeatures;
  /** Places for items left on the whole market, as the backend counts them */
  itemPlacesLeft?: number;
  sellerLogistics?: {
    dropoffStart?: number;
    dropoffEnd?: number;
    pickupStart?: number;
    pickupEnd?: number;
    note?: string;
  };
}

/** Why fees cannot change freely: the bazaar runs (fixed), or sellers registered (only down). */
export type FeeLock = 'running' | 'sellers' | null;

export function feeLockHint(lock: 'running' | 'sellers'): string {
  return i18n.t(`feeLock.${lock}` as never, { ns: 'organizer' }) as string;
}

/** Example for sellers: 10 items handed in, 6 of them sold for 5 € each. */
const EXAMPLE = { handedIn: 10, sold: 6, price: 5 };

export interface ExampleRow {
  label: string;
  /** Signed: income positive, fees negative */
  amount: number;
  /** Fees given back by the cap */
  credit?: boolean;
}

export interface FeeExample {
  intro: string;
  rows: ExampleRow[];
  /** Payout when positive, otherwise what the seller pays */
  total: number;
}

/** What sellers pay, in plain words, with a worked example; empty without fees. */
export function describeSellerFees({ commission, intakeFee = 0, maxFeesPerSeller }: SellerFees): {
  lines: string[];
  example: FeeExample | null;
} {
  const lines: string[] = [];
  if (commission > 0) {
    lines.push(text('commissionLine', { percent: formatPercent(commission) }));
  }
  if (intakeFee > 0) {
    lines.push(text('intakeFeeLine', { fee: formatPriceDE(intakeFee) }));
  }
  if (lines.length === 0) return { lines, example: null };
  if (maxFeesPerSeller !== undefined) {
    lines.push(text('feeCapLine', { fee: formatPriceDE(maxFeesPerSeller) }));
  }

  const revenue = EXAMPLE.sold * EXAMPLE.price;
  const rows: ExampleRow[] = [
    {
      label: text('exampleSold', { sold: EXAMPLE.sold, price: formatPriceDE(EXAMPLE.price) }),
      amount: revenue,
    },
  ];
  if (commission > 0) {
    rows.push({
      label: text('exampleCommission', { percent: formatPercent(commission) }),
      amount: -Math.round(revenue * commission) / 100,
    });
  }
  if (intakeFee > 0) {
    rows.push({
      label: text('exampleIntakeFee', {
        handedIn: EXAMPLE.handedIn,
        fee: formatPriceDE(intakeFee),
      }),
      amount: -Math.round(EXAMPLE.handedIn * intakeFee * 100) / 100,
    });
  }
  // Fees are the negative rows; what is above the cap comes back
  const fees = -rows.reduce((sum, row) => sum + Math.min(row.amount, 0), 0);
  const credit = feeCapCredit(fees, maxFeesPerSeller);
  if (credit > 0) {
    rows.push({
      label: text('exampleFeeCap', { fee: formatPriceDE(maxFeesPerSeller ?? 0) }),
      amount: credit,
      credit: true,
    });
  }
  const total = Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  return {
    lines,
    example: {
      intro: text('exampleIntro', {
        handedIn: EXAMPLE.handedIn,
        sold: EXAMPLE.sold,
        price: formatPriceDE(EXAMPLE.price),
      }),
      rows,
      total,
    },
  };
}

export interface SellerRule {
  text: string;
  /** false for something the bazaar does not offer */
  allowed: boolean;
}

/** Item limit, photos and the price features of the bazaar, as sellers read them. */
export function describeSellerRules(
  event: SellerConditionsEvent,
  fieldDefinitions?: readonly CategoryField[]
): SellerRule[] {
  const features = resolveEventFeatures(event);
  const rules: SellerRule[] = [
    {
      text: features.maxItemsPerSeller
        ? text('maxItems', { max: features.maxItemsPerSeller })
        : text('unlimitedItems'),
      allowed: true,
    },
    {
      text: features.photosOptional ? text('photosOptional') : text('photosRequired'),
      allowed: true,
    },
  ];
  if (features.maxItemsTotal) {
    const left = event.itemPlacesLeft;
    rules.splice(1, 0, {
      text:
        left === 0
          ? text('marketFull', { max: features.maxItemsTotal })
          : left !== undefined
            ? text('placesLeft', { count: left, max: features.maxItemsTotal })
            : text('maxItemsTotal', { max: features.maxItemsTotal }),
      allowed: left !== 0,
    });
  }
  if (!features.publicCatalog) {
    rules.push({ text: text('noPublicCatalog'), allowed: true });
  }
  const required = requirableFields(fieldDefinitions).filter((field) =>
    features.requiredFields?.includes(field.key)
  );
  if (required.length > 0) {
    rules.push({
      text: text('requiredFields', {
        fields: required
          .map((field) => categoryFieldText(field, 'label') ?? field.label)
          .join(', '),
      }),
      allowed: true,
    });
  }
  if (features.directSale) {
    rules.push({ text: text('directSale'), allowed: true });
  }
  if (features.privateSellersOnly) {
    rules.push({ text: text('privateSellers'), allowed: true });
  }
  if (features.fixedSellerData) {
    rules.push({ text: text('fixedData'), allowed: true });
  }
  if (features.discounts) {
    rules.push({
      text:
        features.discountStartsAt !== undefined
          ? text('discountsFrom', {
              time: formatBerlinTime(features.discountStartsAt),
              percent: features.maxDiscountPercent,
            })
          : text('discounts', { percent: features.maxDiscountPercent }),
      allowed: true,
    });
  } else {
    rules.push({ text: text('noDiscounts'), allowed: false });
  }
  rules.push(
    features.priceOffers
      ? { text: text('offers'), allowed: true }
      : { text: text('noOffers'), allowed: false },
    features.minimumPrice
      ? { text: text('minimumPrice'), allowed: true }
      : { text: text('noMinimumPrice'), allowed: false }
  );
  if (features.questions) {
    rules.push({
      text: features.questionsDuringEventOnly ? text('questionsDuringEvent') : text('questions'),
      allowed: true,
    });
  }
  return rules;
}

/**
 * Hand-in and pickup times, empty when the organizer has not set them. At a direct sale
 * sellers stand at their items themselves: the same times mean setup and teardown (#299).
 */
export function describeSellerSchedule(event: SellerConditionsEvent) {
  const logistics = event.sellerLogistics ?? {};
  const direct = resolveEventFeatures(event).directSale;
  const rows: { label: string; value: string }[] = [];
  if (logistics.dropoffStart !== undefined) {
    rows.push({
      label: text(direct ? 'setup' : 'dropoff'),
      value: formatBerlinRange(logistics.dropoffStart, logistics.dropoffEnd, currentLocale()),
    });
  }
  if (logistics.pickupStart !== undefined) {
    rows.push({
      label: text(direct ? 'teardown' : 'pickup'),
      value: formatBerlinRange(logistics.pickupStart, logistics.pickupEnd, currentLocale()),
    });
  }
  return {
    title: text(direct ? 'scheduleDirect' : 'schedule'),
    rows,
    note: logistics.note?.trim() || undefined,
  };
}

export function formatSignedEuro(amount: number) {
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
  return `${sign}${formatPriceDE(Math.abs(amount))} €`;
}

function formatPercent(value: number) {
  return value.toLocaleString(dateLocale(), { maximumFractionDigits: 1 });
}
