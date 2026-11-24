import { describe, expect, it } from 'vitest';
import type { Id } from '../lib/api/types';
import { filterAndSortProducts, type ProductForFilter } from './useMyProductsFilters';

const item = (id: string, extra: Partial<ProductForFilter> = {}): ProductForFilter => ({
  _id: id as Id<'products'>,
  title: id,
  price: 5,
  sold: false,
  eventIds: ['e1'],
  description: '',
  images: [],
  productCategory: 'c1' as Id<'categories'>,
  ...extra,
});

const state = {
  searchTerm: '',
  filterEvent: 'all',
  filterCategory: 'all',
  filterStatus: 'labelMissing',
  sortBy: 'newest',
  minPrice: '',
  maxPrice: '',
};

describe('filterAndSortProducts', () => {
  it('finds the unsold items whose label is missing', () => {
    const result = filterAndSortProducts(
      [item('missing'), item('printed', { labelPrintedAt: 1 }), item('sold', { sold: true })],
      state
    );
    expect(result.map((p) => p._id)).toEqual(['missing']);
  });
});

describe('labelMissing', () => {
  it('is no topic once the item was taken in at the bazaar', () => {
    expect(filterAndSortProducts([item('in', { eventStatus: 'available' })], state)).toEqual([]);
    expect(
      filterAndSortProducts([item('announced', { eventStatus: 'announced' })], state)
    ).toHaveLength(1);
  });
});
