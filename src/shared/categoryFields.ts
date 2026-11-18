/**
 * Extra item fields per product category (e.g. frame number for bikes, size for clothes).
 * Admins define the fields and pick them per category; the server sends each category with
 * the fields its items have (`fieldList`, inherited from the main category). The values
 * live on the product, so an item keeps them when it moves on to the next bazaar.
 * Pure helpers only, so the frontend can import this file as well.
 */

export interface CategoryField {
  /** Picked by categories, e.g. "clothingSize" */
  _id: string;
  /** Under which the value is stored on the item; sizes share "size" */
  key: string;
  label: string;
  labelEn?: string;
  placeholder?: string;
  placeholderEn?: string;
  hint?: string;
  hintEn?: string;
  /** At most MAX_SHORT_LENGTH characters, so it fits on the labels (e.g. a size) */
  short: boolean;
  /**
   * Sellers may not find the value (e.g. a worn frame number): a button fills in the
   * agreed text (records:categoryFields.notFoundValue), the same for everyone, so it can be
   * filtered in the records (#299). A required field stays required.
   */
  notFoundButton: boolean;
}

const MAX_VALUE_LENGTH = 120;
/** Longest short value, e.g. "134/140" or "160 cm"; longer ones would not fit on the labels */
export const MAX_SHORT_LENGTH = 7;

export function fieldMaxLength(field: Pick<CategoryField, 'short'>): number {
  return field.short ? MAX_SHORT_LENGTH : MAX_VALUE_LENGTH;
}

/**
 * Fields an organizer can make required for a bazaar, one per key. The same key means
 * the same thing in every category (e.g. "size"), so one choice covers all of them.
 */
export function requirableFields(definitions: readonly CategoryField[] | undefined) {
  return (definitions ?? []).filter(
    (field, index, all) => all.findIndex((other) => other.key === field.key) === index
  );
}

type CategoryWithFields = { _id: string; fieldList?: CategoryField[] };

/** The fields of a category, as the server resolved them. */
export function getCategoryFields(
  categoryId: string | undefined,
  categories: readonly CategoryWithFields[] | undefined
): CategoryField[] {
  if (!categoryId || !categories) return [];
  return categories.find((category) => category._id === categoryId)?.fieldList ?? [];
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

/** A value of an item with the name of its field, as the server describes it too. */
export interface DescribedAttribute {
  label: string;
  labelEn?: string;
  /** The id of the field */
  text: string;
  value: string;
}

/** Label/value pairs for display, in the order the category defines. */
export function describeAttributes(
  fields: CategoryField[],
  attributes: Record<string, string> | undefined
): DescribedAttribute[] {
  if (!attributes) return [];
  return fields
    .filter((field) => attributes[field.key])
    .map((field) => ({
      label: field.label,
      labelEn: field.labelEn,
      text: field._id,
      value: attributes[field.key],
    }));
}
