import { Fragment } from 'react';
import { SelectGroup, SelectItem, SelectSeparator } from '../ui/select';
import { categoryName } from '../../i18n/categories';
import type { CategoryTranslations } from '../../lib/api/types';
import { groupCategories } from '../../shared/categoryTree';

type SelectableCategory = {
  _id: string;
  label: string;
  parentCategory?: string;
  translations?: CategoryTranslations;
};

/**
 * The options of a category select: main categories, each followed by its indented
 * sub-categories, so a long list reads as a few groups.
 */
export function CategorySelectItems({ categories }: { categories: readonly SelectableCategory[] }) {
  const groups = groupCategories(categories);
  // A line around each group with sub-categories, one between two groups
  const hasChildren = (index: number) => (groups[index]?.children.length ?? 0) > 0;
  return groups.map(({ category, children }, index) =>
    children.length === 0 ? (
      <SelectItem key={category._id} value={category._id}>
        {categoryName(category)}
      </SelectItem>
    ) : (
      <Fragment key={category._id}>
        {index > 0 && !hasChildren(index - 1) && <SelectSeparator />}
        <SelectGroup>
          <SelectItem value={category._id} className="font-medium">
            {categoryName(category)}
          </SelectItem>
          {children.map((child) => (
            <SelectItem key={child._id} value={child._id} className="pl-6">
              {categoryName(child)}
            </SelectItem>
          ))}
        </SelectGroup>
        {index < groups.length - 1 && <SelectSeparator />}
      </Fragment>
    )
  );
}
