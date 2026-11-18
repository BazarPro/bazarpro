import i18n from '.';

type FieldTexts = {
  label?: string;
  labelEn?: string;
  placeholder?: string;
  placeholderEn?: string;
  hint?: string;
  hintEn?: string;
};

/**
 * Label, placeholder or hint of a category field in the current language: admins enter
 * them in German and English. The texts of the "not found" button are the same for all.
 */
export function categoryFieldText(
  field: FieldTexts,
  part: 'label' | 'placeholder' | 'hint' | 'notFound' | 'notFoundValue'
): string | undefined {
  if (part === 'notFound' || part === 'notFoundValue') {
    return i18n.t(`categoryFields.${part}`, { ns: 'records' });
  }
  const english = i18n.resolvedLanguage === 'en' ? field[`${part}En`] : undefined;
  return english || field[part] || undefined;
}
