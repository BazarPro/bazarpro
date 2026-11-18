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
