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
  /** Categories preselected by name, e.g. all bike categories */
  categoryMatch?: RegExp;
}

const BIKES = /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i;
/** Ridden by children, sold at children's bazaars and at bike sales */
const KIDS_VEHICLES = /laufr|roller|scooter|einr[aä]d|bobby|rutsch/i;

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
    categoryMatch: new RegExp(`kind|baby|spiel|kleid|schuh|buch|${KIDS_VEHICLES.source}`, 'i'),
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
    categoryMatch: /kleid|schuh|accessoir|haushalt|buch|spiel/i,
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
  },
];

/** The type of a draft or of the picker; drafts from before may name a removed one. */
export function findEventType(id: string | undefined): EventType | undefined {
  return EVENT_TYPES.find((type) => type.id === id);
}
