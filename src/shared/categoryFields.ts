/**
 * Extra item fields per product category (e.g. frame number for bikes, size for clothes).
 * The values live on the product, so an item keeps them when it moves on to the next
 * bazaar. Pure helpers only, so the frontend can import this file as well.
 */

export interface CategoryField {
  key: string;
  /** Translation of label, placeholder and hint: categoryFields.<text> in src/locales */
  text: CategoryFieldText;
  label: string;
  placeholder?: string;
  hint?: string;
  /** Longest value; sizes stay short so they fit on the labels */
  maxLength?: number;
  /**
   * Sellers may not find the value (e.g. a worn frame number): a button fills in the
   * agreed text (categoryFields.<text>.notFoundValue), the same for everyone, so it can be
   * filtered in the records (#299). A required field stays required.
   */
  notFoundButton?: boolean;
}

export type CategoryFieldText =
  | 'frameNumber'
  | 'frameSize'
  | 'wheelSize'
  | 'bikeBrand'
  | 'clothingSize'
  | 'shoeSize'
  | 'sportSize'
  | 'brand'
  | 'color'
  | 'model';

const MAX_VALUE_LENGTH = 120;
/** Longest size, e.g. "134/140" or "160 cm"; longer ones would not fit on the labels */
export const MAX_SIZE_LENGTH = 7;

export function fieldMaxLength(field: CategoryField): number {
  return field.maxLength ?? MAX_VALUE_LENGTH;
}

const FRAME_NUMBER: CategoryField = {
  key: 'frameNumber',
  text: 'frameNumber',
  label: 'Rahmennummer',
  placeholder: 'z. B. WBK123456',
  hint: 'Nicht gefunden? Schreib „nicht gefunden“ hinein – wir suchen sie vor Ort gemeinsam.',
  notFoundButton: true,
};
const FRAME_SIZE: CategoryField = {
  key: 'frameSize',
  text: 'frameSize',
  label: 'Rahmengröße',
  placeholder: 'z. B. 52 cm oder M',
};
const WHEEL_SIZE: CategoryField = {
  key: 'wheelSize',
  text: 'wheelSize',
  label: 'Laufradgröße',
  placeholder: 'z. B. 28 Zoll',
};
const BRAND: CategoryField = { key: 'brand', text: 'brand', label: 'Marke' };
const BIKE_BRAND: CategoryField = { ...BRAND, text: 'bikeBrand', placeholder: 'z. B. Cube' };
/** Helps to find an item again on site and to describe it, e.g. a bike for the police */
const COLOR: CategoryField = {
  key: 'color',
  text: 'color',
  label: 'Farbe',
  placeholder: 'z. B. Rot',
};
const CLOTHING_SIZE: CategoryField = {
  key: 'size',
  text: 'clothingSize',
  label: 'Größe',
  placeholder: 'z. B. M oder 128',
  maxLength: MAX_SIZE_LENGTH,
};
const SHOE_SIZE: CategoryField = {
  key: 'size',
  text: 'shoeSize',
  label: 'Größe (EU)',
  placeholder: 'z. B. 38',
  maxLength: MAX_SIZE_LENGTH,
};
const SPORT_SIZE: CategoryField = {
  key: 'size',
  text: 'sportSize',
  label: 'Größe / Länge',
  placeholder: 'z. B. 160 cm',
  maxLength: MAX_SIZE_LENGTH,
};
const MODEL: CategoryField = { key: 'model', text: 'model', label: 'Modell' };

/**
 * The fields an admin can pick for a category, by `text`; one size at most, since all
 * sizes share the key. Same list as SELECTABLE in backend/src/modules/category_fields.rs.
 */
export const SELECTABLE_FIELDS: CategoryField[] = [
  FRAME_NUMBER,
  FRAME_SIZE,
  WHEEL_SIZE,
  BRAND,
  COLOR,
  CLOTHING_SIZE,
  SHOE_SIZE,
  SPORT_SIZE,
  MODEL,
];

const BIKE_FIELDS = [FRAME_NUMBER, FRAME_SIZE, WHEEL_SIZE, BIKE_BRAND, COLOR];
const CLOTHING_FIELDS = [CLOTHING_SIZE, BRAND, COLOR];
const SHOE_FIELDS = [SHOE_SIZE, BRAND];
const SPORT_FIELDS = [SPORT_SIZE, BRAND, COLOR];
const ELECTRONICS_FIELDS = [BRAND, MODEL];

/**
 * Category names are free text (admins create e.g. "Trekkingräder" or "E-Bikes / Pedelecs"),
 * so fields are matched by keywords. The first matching rule wins.
 */
const FIELD_RULES: { match: RegExp; exclude?: RegExp; fields: CategoryField[] }[] = [
  {
    // "rad" only as a whole word or word ending, so "Radio" does not count as a bike
    match: /fahrr|räder|\brad\b|rad$|bike|pedelec|\bmtb\b|bmx/i,
    // No frame number: accessories, cycling clothes, trailers, child seats, unicycles
    exclude: /zubehör|teile|bekleidung|helm|anhänger|schloss|sitz|einr[aä]d/i,
    fields: BIKE_FIELDS,
  },
  { match: /schuh|stiefel|sneaker/i, fields: SHOE_FIELDS },
  // "mode" only as a word or word ending ("Damenmode"), not in "Sondermodelle"
  { match: /kleid|jacke|hose|\bmode\b|mode$|shirt|pullover/i, fields: CLOTHING_FIELDS },
  { match: /sport|\bski|snowboard/i, fields: SPORT_FIELDS },
  {
    match: /elektron|handy|smartphone|computer|laptop|tablet|kamera|konsole/i,
    fields: ELECTRONICS_FIELDS,
  },
];

/**
 * Fields an organizer can make required for a bazaar, one per key. The same key means
 * the same thing in every category (e.g. "brand"), so one choice covers all of them.
 */
export const REQUIRABLE_FIELDS: CategoryField[] = SELECTABLE_FIELDS.filter(
  (field, index) => SELECTABLE_FIELDS.findIndex((other) => other.key === field.key) === index
);

/**
 * Fields as ids of SELECTABLE_FIELDS, e.g. to start an admin's choice from those of the
 * name; a variant like the bike brand becomes the plain field with its key.
 */
export function selectableIds(fields: CategoryField[]): string[] {
  const ids = fields.map(
    (field) =>
      (
        SELECTABLE_FIELDS.find((s) => s.text === field.text) ??
        SELECTABLE_FIELDS.find((s) => s.key === field.key)
      )?.text
  );
  return SELECTABLE_FIELDS.map((field) => field.text).filter((id) => ids.includes(id));
}

export const REQUIRABLE_FIELD_KEYS = REQUIRABLE_FIELDS.map((field) => field.key);

/**
 * Fields for a single category label, without looking at parent categories; undefined
 * when no rule speaks about it. A label a rule excludes on purpose ("Fahrradanhänger") has
 * no fields: as a sub-category of "Fahrräder" it must not inherit the frame number.
 */
export function getFieldsForLabel(label: string): CategoryField[] | undefined {
  const name = label.trim();
  let excluded = false;
  for (const rule of FIELD_RULES) {
    if (!rule.match.test(name)) continue;
    if (!rule.exclude?.test(name)) return rule.fields;
    excluded = true;
  }
  return excluded ? [] : undefined;
}

type CategoryLike = {
  _id: string;
  label: string;
  parentCategory?: string;
  /** Picked by an admin (ids of SELECTABLE_FIELDS); unset: by the name */
  fields?: string[];
};

/**
 * Fields for a category: the ones an admin picked, else those of its name. Sub-categories
 * without either inherit the fields of their parent.
 */
export function getCategoryFields(
  categoryId: string | undefined,
  categories: CategoryLike[] | undefined
): CategoryField[] {
  if (!categoryId || !categories) return [];
  const byId = new Map(categories.map((c) => [c._id, c]));
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current && !seen.has(current._id)) {
    seen.add(current._id);
    if (current.fields) {
      const picked = current.fields;
      return SELECTABLE_FIELDS.filter((field) => picked.includes(field.text));
    }
    const fields = getFieldsForLabel(current.label);
    if (fields) return fields;
    current = current.parentCategory ? byId.get(current.parentCategory) : undefined;
  }
  return [];
}

/**
 * Keeps only the fields of the given category, trims values and drops empty ones.
 * Returns undefined when nothing is left, so the product stays without attributes.
 */
export function sanitizeAttributes(
  fields: CategoryField[],
  attributes: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!attributes) return undefined;
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = attributes[field.key]?.trim();
    if (value) result[field.key] = value.slice(0, fieldMaxLength(field));
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Label/value pairs for display, in the order the category defines. */
export function describeAttributes(
  fields: CategoryField[],
  attributes: Record<string, string> | undefined
): { label: string; text: CategoryFieldText; value: string }[] {
  if (!attributes) return [];
  return fields
    .filter((field) => attributes[field.key])
    .map((field) => ({ label: field.label, text: field.text, value: attributes[field.key] }));
}
