import type { ItemKind } from '../components/illustrations/ItemIllustrations';
import type { StoredEventFeatures } from '../shared/eventFeatures';

/**
 * Kinds of bazaars with suggested settings for the creation wizard, the most asked for
 * first. They only fill the form; the organizer can change everything afterwards.
 * Texts: organizer.eventTypes.<id> (title, text, highlights, example item and title).
 */
export type EventTypeId = 'kidsBazaar' | 'clothingBazaar' | 'skiBazaar' | 'bikeExchange';

export interface EventType {
  id: EventTypeId;
  /** Drawing for the picker and the previews of the wizard */
  item: ItemKind;
  /** Prices of the example items in the previews (titles: eventTypes.<id>.exampleItems) */
  examplePrices: [number, number, number];
  commission: number;
  features: StoredEventFeatures;
  /**
   * Categories preselected by name, e.g. all bike categories. A main category that matches
   * brings its sub-categories along.
   */
  categoryMatch?: RegExp;
  /** Not preselected, even below a main category that matches, e.g. women's clothes */
  categoryExclude?: RegExp;
}

const BIKES = /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i;
/** Ridden by children, sold at children's bazaars and at bike sales */
const KIDS_VEHICLES = /kinderfahrz|laufr|roller|scooter|einr[aä]d|bobby|rutsch/i;

export const EVENT_TYPES: EventType[] = [
  {
    // Many small items per seller: small labels, no photos needed, discounts at the end
    id: 'kidsBazaar',
    item: 'kids',
    examplePrices: [9, 15, 6],
    commission: 15,
    features: {
      discounts: true,
      maxDiscountPercent: 50,
      priceOffers: false,
      minimumPrice: false,
      questions: false,
      photosOptional: true,
      maxItemsPerSeller: 50,
      labelFormat: 'small',
      // Many small items: sorted back by sight, and the labels work at the next bazaar
      labelMark: 'universal',
      priceOnLabel: false,
    },
    categoryMatch: new RegExp(`kind|baby|spiel|kleid|schuh|b[uü]ch|${KIDS_VEHICLES.source}`, 'i'),
    categoryExclude: /damen|herren|roman|sachb|kochb|comic|video|konsole/i,
  },
  {
    // Second-hand for everyone, e.g. a women's clothing bazaar or a flea market
    id: 'clothingBazaar',
    item: 'clothing',
    examplePrices: [35, 24, 28],
    commission: 10,
    features: {
      discounts: true,
      maxDiscountPercent: 30,
      priceOffers: true,
      minimumPrice: false,
      questions: true,
      photosOptional: true,
      maxItemsPerSeller: 30,
      labelFormat: 'small',
      // Many small items: sorted back by sight, and the labels work at the next bazaar
      labelMark: 'universal',
      priceOnLabel: false,
    },
    categoryMatch: /kleid|schuh|accessoir|haushalt|b[uü]ch|spiel/i,
  },
  {
    // Fewer, pricier items: a negotiable price and questions about size and condition
    id: 'skiBazaar',
    item: 'ski',
    examplePrices: [90, 45, 25],
    commission: 10,
    features: {
      discounts: false,
      priceOffers: true,
      minimumPrice: true,
      questions: true,
      photosOptional: true,
      maxItemsPerSeller: 15,
      labelFormat: 'standard',
      priceOnLabel: true,
    },
    categoryMatch: /ski|snowboard|winter|sport|schuh/i,
  },
  {
    // Classic bike exchange as in the guide "Fahrradbörse organisieren" of the docs: bikes
    // are handed in, sold at a cash desk, paid out after. A record for the police is the
    // same plus private sellers only, fixed data and a limit, switched on by the organizer.
    id: 'bikeExchange',
    item: 'bike',
    examplePrices: [140, 65, 25],
    commission: 10,
    features: {
      discounts: false,
      priceOffers: true,
      minimumPrice: true,
      questions: true,
      photosOptional: false,
      // Against suspicion of theft, and it belongs on the purchase contract
      requiredFields: ['frameNumber'],
      // Charged for every accepted bike, sold or not, like in the guide
      intakeFee: 3,
      labelFormat: 'standard',
      priceOnLabel: true,
    },
    categoryMatch: new RegExp(`${BIKES.source}|${KIDS_VEHICLES.source}`, 'i'),
    // Pushed, not ridden
    categoryExclude: /kinderwagen|buggy/i,
  },
];

/** The type of a draft or of the picker; drafts from before may name a removed one. */
export function findEventType(id: string | undefined): EventType | undefined {
  return EVENT_TYPES.find((type) => type.id === id);
}

/**
 * The categories a kind of bazaar preselects: those whose name matches, and the
 * sub-categories of a main category that matches, unless the kind excludes them.
 */
export function preselectedCategories(
  type: Pick<EventType, 'categoryMatch' | 'categoryExclude'>,
  categories: readonly { _id: string; label: string; parentCategory?: string }[]
): string[] {
  const { categoryMatch: match, categoryExclude: exclude } = type;
  if (!match) return [];
  const byId = new Map(categories.map((category) => [category._id, category]));
  return categories
    .filter((category) => {
      if (exclude?.test(category.label)) return false;
      if (match.test(category.label)) return true;
      const parent = category.parentCategory ? byId.get(category.parentCategory) : undefined;
      return !!parent && !parent.parentCategory && match.test(parent.label);
    })
    .map((category) => category._id);
}
