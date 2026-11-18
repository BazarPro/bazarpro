import { api } from '../lib/api/functions';
import { requirableFields, type CategoryField } from '../shared/categoryFields';
import { usePublicQuery } from './usePublicQuery';

/** The extra fields admins defined; undefined while loading. */
export function useCategoryFieldDefinitions(): CategoryField[] | undefined {
  return usePublicQuery(api.categories.listFields, {});
}

/** The fields a bazaar can make required, one per key. */
export function useRequirableFields(): CategoryField[] {
  return requirableFields(useCategoryFieldDefinitions());
}
