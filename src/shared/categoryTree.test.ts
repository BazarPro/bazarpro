import { describe, expect, it } from 'vitest';
import {
  collapseSubcategories,
  compactSelection,
  expandCategories,
  expandSelection,
  groupCategories,
  isCategoryAllowed,
  isForItems,
  withSubcategories,
} from './categoryTree';

const categories = [
  { _id: 'clothes' },
  { _id: 'bikes' },
  { _id: 'cargo', parentCategory: 'bikes' },
  { _id: 'trailers', parentCategory: 'bikes' },
  { _id: 'bells', parentCategory: 'trailers' },
  { _id: 'orphan', parentCategory: 'gone' },
];

describe('category tree', () => {
  it('groups sub-categories under their main category, one level deep', () => {
    const groups = groupCategories(categories).map(({ category, children }) => [
      category._id,
      children.map((child) => child._id),
    ]);
    // A deeper one and one with a missing parent are shown on top instead of getting lost
    expect(groups).toEqual([
      ['clothes', []],
      ['bikes', ['cargo', 'trailers']],
      ['bells', []],
      ['orphan', []],
    ]);
  });

  it('a filter on a main category finds its sub-categories', () => {
    expect([...withSubcategories('bikes', categories)]).toEqual(['bikes', 'cargo', 'trailers']);
    expect([...withSubcategories('cargo', categories)]).toEqual(['cargo']);
    expect([...withSubcategories('bikes', undefined)]).toEqual(['bikes']);
  });

  it('a main category with all its sub-categories stands for them', () => {
    expect(collapseSubcategories(['clothes', 'bikes', 'cargo', 'trailers'], categories)).toEqual([
      'clothes',
      'bikes',
    ]);
    // Not all chosen: every name stays
    expect(collapseSubcategories(['bikes', 'cargo'], categories)).toEqual(['bikes', 'cargo']);
    expect(collapseSubcategories(['cargo', 'trailers'], categories)).toEqual(['cargo', 'trailers']);
  });

  it('a bazaar stores a main category when all its sub-categories are chosen', () => {
    const tree = categories.filter((category) => category._id !== 'bells');
    expect([...expandSelection(['bikes', 'clothes'], tree)]).toEqual([
      'clothes',
      'cargo',
      'trailers',
    ]);
    expect(compactSelection(new Set(['clothes', 'cargo', 'trailers']), tree)).toEqual([
      'clothes',
      'bikes',
    ]);
    expect(compactSelection(new Set(['cargo']), tree)).toEqual(['cargo']);
    expect(expandCategories(['bikes'], tree)).toEqual(['bikes', 'cargo', 'trailers']);
  });

  it('a bazaar takes a category it allows or whose main category it allows', () => {
    expect(isCategoryAllowed('cargo', ['bikes'], categories)).toBe(true);
    expect(isCategoryAllowed('cargo', ['cargo'], categories)).toBe(true);
    expect(isCategoryAllowed('trailers', ['cargo'], categories)).toBe(false);
    expect(isCategoryAllowed('clothes', ['bikes'], categories)).toBe(false);
    // Without a list it takes everything
    expect(isCategoryAllowed('clothes', [], categories)).toBe(true);
    expect(isForItems('bikes', categories)).toBe(false);
    expect(isForItems('cargo', categories)).toBe(true);
  });
});
