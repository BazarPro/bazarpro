import { FormSection } from '../../../../components/ui/form-section';
import { FieldError } from '../../../../components/ui/field-error';
import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Badge } from '../../../../components/ui/badge';
import { EVENT_SERVICES } from '../../../../shared/constants';
import type { Doc } from '../../../../lib/api/types';
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { groupCategories } from '../../../../shared/categoryTree';
import { cn } from '../../../../lib/utils';
import { useTranslation } from 'react-i18next';
import { serviceLabel } from '../../../../i18n/services';
import { categoryName } from '../../../../i18n/categories';

type EventCategoriesProbs = {
  categoryList: Doc<'categories'>[];
};

export function EditEventCategories({ categoryList }: EventCategoriesProbs) {
  const { t } = useTranslation('organizer');
  const {
    watch,
    setValue,
    register,
    formState: { errors },
  } = useFormContext();

  const categories: string[] = watch('categories') || [];
  const services: string[] = watch('services') || [];

  useEffect(() => {
    register('categories');
    register('services');
  }, [register]);

  const [expanded, setExpanded] = useState<string[]>([]);
  const groups = groupCategories(categoryList.map((cat) => ({ ...cat, _id: String(cat._id) })));

  const choose = (current: string[]) =>
    setValue('categories', current, { shouldValidate: true, shouldDirty: true, shouldTouch: true });

  const toggleCategory = (catId: string) => {
    const id = String(catId);
    choose(categories.includes(id) ? categories.filter((c) => c !== id) : [...categories, id]);
  };

  /** A main category comes with its sub-categories, and goes with them. */
  const toggleGroup = (ids: string[]) => {
    const all = ids.every((id) => categories.includes(id));
    choose(
      all
        ? categories.filter((c) => !ids.includes(c))
        : [...categories, ...ids.filter((id) => !categories.includes(id))]
    );
  };

  const toggleExpanded = (id: string) =>
    setExpanded((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    );

  const toggleService = (svc: string) => {
    const current = services.includes(svc)
      ? services.filter((s: string) => s !== svc)
      : [...services, svc];
    setValue('services', current, { shouldValidate: true, shouldDirty: true, shouldTouch: true });
  };

  return (
    <FormSection>
      <div className="space-y-2">
        <Label>{t('categories.allowed')}</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {groups.map(({ category, children }) => {
            const id = category._id;
            if (children.length === 0) {
              return (
                <Badge
                  key={id}
                  variant={categories.includes(id) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleCategory(id)}
                >
                  {categoryName(category)}
                </Badge>
              );
            }
            const childIds = children.map((child) => child._id);
            const chosenChildren = childIds.filter((c) => categories.includes(c)).length;
            const isOpen = expanded.includes(id);
            return (
              <div key={id} className={cn('contents', isOpen && 'block basis-full')}>
                <span className="inline-flex items-center gap-0.5">
                  <Badge
                    variant={categories.includes(id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleGroup([id, ...childIds])}
                  >
                    <span>{categoryName(category)}</span>
                    <span className="opacity-70">
                      {chosenChildren}/{childIds.length}
                    </span>
                  </Badge>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-expanded={isOpen}
                    aria-label={t('categories.subcategories', { name: categoryName(category) })}
                    onClick={() => toggleExpanded(id)}
                  >
                    <ChevronDown
                      className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
                    />
                  </button>
                </span>
                {isOpen && (
                  <div className="mt-2 flex flex-wrap gap-2 border-l-2 pl-3">
                    {children.map((child) => (
                      <Badge
                        key={child._id}
                        variant={categories.includes(child._id) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => toggleCategory(child._id)}
                      >
                        {categoryName(child)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">{t('categories.groupHint')}</p>
        {errors.categories && <FieldError>{errors.categories.message as string}</FieldError>}
      </div>

      <div className="space-y-2">
        <Label>{t('categories.services')}</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {EVENT_SERVICES.map((svc) => (
            <Badge
              key={svc}
              variant={services.includes(svc) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleService(svc)}
            >
              {serviceLabel(svc)}
            </Badge>
          ))}
        </div>
      </div>
    </FormSection>
  );
}
