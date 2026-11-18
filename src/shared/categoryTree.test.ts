import { describe, expect, it } from 'vitest';
import { collapseSubcategories, groupCategories, withSubcategories } from './categoryTree';

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
});
