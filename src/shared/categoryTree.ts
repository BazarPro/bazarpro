/**
 * Main categories with one level of sub-categories (e.g. "Fahrräder" with "Lastenräder"),
 * so the lists stay short. Pure helpers only, so the frontend can import this file as well.
 */

type TreeCategory = { _id: string; parentCategory?: string };

export interface CategoryGroup<T> {
  category: T;
  children: T[];
}

/**
 * Main categories in the given order, each with its sub-categories. A category whose main
 * category is missing, or that hangs deeper, counts as a main category itself.
 */
export function groupCategories<T extends TreeCategory>(
  categories: readonly T[]
): CategoryGroup<T>[] {
  const byId = new Map(categories.map((category) => [category._id, category]));
  const isMain = (category: T) => {
    const parent = category.parentCategory ? byId.get(category.parentCategory) : undefined;
    return !parent || !!parent.parentCategory || parent._id === category._id;
  };
  return categories.filter(isMain).map((category) => ({
    category,
    children: categories.filter((child) => !isMain(child) && child.parentCategory === category._id),
  }));
}

/** The category and its sub-categories, e.g. for a filter on a main category. */
export function withSubcategories(
  categoryId: string,
  categories: readonly TreeCategory[] | undefined
): Set<string> {
  const ids = new Set([categoryId]);
  for (const category of categories ?? []) {
    if (category.parentCategory === categoryId) ids.add(category._id);
  }
  return ids;
}

/**
 * The chosen categories for display: a main category that comes with all its
 * sub-categories stands for them, so "Fahrräder" replaces seven names.
 */
export function collapseSubcategories(
  ids: readonly string[],
  categories: readonly TreeCategory[] | undefined
): string[] {
  if (!categories) return [...ids];
  const chosen = new Set(ids);
  const covered = new Set<string>();
  for (const { category, children } of groupCategories(categories)) {
    if (
      children.length > 0 &&
      chosen.has(category._id) &&
      children.every((child) => chosen.has(child._id))
    ) {
      for (const child of children) covered.add(child._id);
    }
  }
  return ids.filter((id) => !covered.has(id));
}

/** The ids and the sub-categories of the main categories among them. */
export function expandCategories(
  ids: readonly string[],
  categories: readonly TreeCategory[] | undefined
): string[] {
  const result = new Set(ids);
  for (const category of categories ?? []) {
    if (category.parentCategory && ids.includes(category.parentCategory)) {
      result.add(category._id);
    }
  }
  return [...result];
}

/**
 * Whether a bazaar takes items of this category: it allows the category or its main
 * category. Bazaars without a list take everything. Same rule as the backend
 * (event_products::assert_category_allowed).
 */
export function isCategoryAllowed(
  categoryId: string | undefined,
  allowed: readonly string[] | undefined,
  categories: readonly TreeCategory[] | undefined
): boolean {
  if (!categoryId || !allowed || allowed.length === 0) return true;
  if (allowed.includes(categoryId)) return true;
  const parent = categories?.find((category) => category._id === categoryId)?.parentCategory;
  return !!parent && allowed.includes(parent);
}

/** Whether items can go into the category: one with sub-categories only groups them. */
export function isForItems(
  categoryId: string,
  categories: readonly TreeCategory[] | undefined
): boolean {
  return !(categories ?? []).some((category) => category.parentCategory === categoryId);
}

/**
 * The categories a bazaar allows, one per category items can go into: a stored main
 * category stands for all its sub-categories.
 */
export function expandSelection(
  stored: readonly string[],
  categories: readonly TreeCategory[]
): Set<string> {
  const result = new Set<string>();
  for (const { category, children } of groupCategories(categories)) {
    const all = stored.includes(category._id);
    if (children.length === 0) {
      if (all) result.add(category._id);
      continue;
    }
    for (const child of children) {
      if (all || stored.includes(child._id)) result.add(child._id);
    }
  }
  return result;
}

/**
 * What a bazaar stores: a main category when all its sub-categories are chosen, so ones
 * an admin adds later are allowed too; otherwise the chosen sub-categories.
 */
export function compactSelection(
  selected: ReadonlySet<string>,
  categories: readonly TreeCategory[]
): string[] {
  const result: string[] = [];
  for (const { category, children } of groupCategories(categories)) {
    if (children.length === 0) {
      if (selected.has(category._id)) result.push(category._id);
    } else if (children.every((child) => selected.has(child._id))) {
      result.push(category._id);
    } else {
      result.push(...children.filter((child) => selected.has(child._id)).map((c) => c._id));
    }
  }
  return result;
}
