import { FieldError } from '../../../../components/ui/field-error';
import { useFormContext } from 'react-hook-form';
import { Label } from '../../../../components/ui/label';
import { Input } from '../../../../components/ui/input';
import { Textarea } from '../../../../components/ui/text-area';
import { CONDITION_OPTIONS } from '../../../../constants/records';
import { PRODUCT_CONDITIONS } from '../../../../shared/constants';
import { api } from '../../../../lib/api/functions';
import { useQuery } from '../../../../lib/api/react';
import { cn } from '../../../../lib/utils';
import { MyProductCategoryFields, MyProductNegotiation } from './MyProductExtras';
import { CategoryPicker } from '../../../../components/products/CategoryPicker';
import { isCategoryAllowed } from '../../../../shared/categoryTree';
import { categoryName } from '../../../../i18n/categories';
import { useTranslation } from 'react-i18next';
import { FormSkeleton, Loading } from '../../../../components/ui/loading';
import type { ReactNode } from 'react';

/**
 * The facts of an item, in the order people think of them: what it is, what it costs,
 * which kind, in what condition, then the optional description and negotiation.
 * `allowOffers`: false for walk-in sellers, see MyProductNegotiation. `requiredFields`:
 * category fields a chosen bazaar requires. `fixedFields`: set while a bazaar keeps a
 * record of the item; title, category, price and these fields cannot change then.
 * `negotiation`: the negotiation box, or what to show instead (e.g. a button to open it).
 * `bazaars`: the chosen bazaars; only categories all of them take can be picked.
 */
export function MyProductBasicInfo({
  allowOffers = true,
  requiredFields,
  fixedFields,
  negotiation,
  bazaars = [],
}: {
  allowOffers?: boolean;
  requiredFields?: string[];
  fixedFields?: string[];
  negotiation?: ReactNode;
  bazaars?: { title: string; categories?: string[] }[];
}) {
  const fixed = fixedFields !== undefined;
  const { t } = useTranslation('seller');
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();

  const categoryList = useQuery(api.categories.getAllCategories);

  // Watch values for controlled components like Select
  const categoryId = watch('categoryId');
  const condition = watch('condition');
  // Only categories every chosen bazaar takes
  const restricting = bazaars.filter((event) => (event.categories?.length ?? 0) > 0);
  const restricted = restricting.length > 0;
  const isAllowed = (id: string) =>
    restricting.every((event) => isCategoryAllowed(id, event.categories, categoryList));
  const chosenCategory = categoryList?.find((category) => category._id === categoryId);
  const refusedBy =
    chosenCategory && !fixed
      ? restricting.find(
          (event) => !isCategoryAllowed(chosenCategory._id, event.categories, categoryList)
        )
      : undefined;

  if (!categoryList) {
    return (
      <Loading>
        <FormSkeleton fields={4} />
      </Loading>
    );
  }

  return (
    <div className="bg-card rounded-xl border p-5 space-y-5 sm:p-6">
      <div className="space-y-2">
        <Label htmlFor="title">{t('form.name')}</Label>
        <Input
          id="title"
          readOnly={fixed}
          {...register('title')}
          placeholder={t('form.namePlaceholder')}
        />
        {errors.title && <FieldError>{errors.title.message as string}</FieldError>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="price">{t('form.price')}</Label>
          <div className="relative">
            <Input
              id="price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              readOnly={fixed}
              {...register('price', { valueAsNumber: true })}
              placeholder="0,00"
              className="pr-8 tabular-nums"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              €
            </span>
          </div>
          {errors.price ? (
            <FieldError>{errors.price.message as string}</FieldError>
          ) : (
            <p className="text-xs text-muted-foreground">{t('form.priceHint')}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="categoryId">{t('form.category')}</Label>
          <CategoryPicker
            id="categoryId"
            categories={categoryList}
            value={categoryId || undefined}
            disabled={fixed}
            invalid={!!errors.categoryId || !!refusedBy}
            isAllowed={isAllowed}
            placeholder={t('form.chooseCategory')}
            onChange={(id) =>
              setValue('categoryId', id, { shouldValidate: true, shouldDirty: true })
            }
          />
          {errors.categoryId ? (
            <FieldError>{errors.categoryId.message as string}</FieldError>
          ) : refusedBy ? (
            <FieldError>
              {t('form.categoryNotAllowed', {
                category: categoryName(chosenCategory!),
                event: refusedBy.title,
              })}
            </FieldError>
          ) : (
            restricted && (
              <p className="text-xs text-muted-foreground">
                {t('form.categoriesOfBazaar', {
                  events: restricting.map((event) => event.title).join(', '),
                })}
              </p>
            )
          )}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium leading-none">{t('form.condition')}</legend>
        <div
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
          role="radiogroup"
          aria-label={t('form.condition')}
        >
          {PRODUCT_CONDITIONS.map((value) => {
            const checked = condition === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={checked}
                title={CONDITION_OPTIONS[value].description}
                onClick={() =>
                  setValue('condition', value, { shouldValidate: true, shouldDirty: true })
                }
                className={cn(
                  'min-h-9 rounded-md border px-3 py-1.5 text-left text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  checked
                    ? 'border-primary bg-primary/10 font-medium text-primary dark:bg-primary/25 dark:text-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                {CONDITION_OPTIONS[value].title}
              </button>
            );
          })}
        </div>
        {errors.condition && <FieldError>{errors.condition.message as string}</FieldError>}
      </fieldset>

      <MyProductCategoryFields requiredFields={requiredFields} fixedFields={fixedFields} />

      <div className="space-y-2">
        <Label htmlFor="description">{t('form.description')}</Label>
        <Textarea
          id="description"
          {...register('description')}
          placeholder={t('form.descriptionPlaceholder')}
          rows={3}
        />
        {errors.description && <FieldError>{errors.description.message as string}</FieldError>}
      </div>

      {negotiation === undefined ? <MyProductNegotiation allowOffers={allowOffers} /> : negotiation}
    </div>
  );
}
