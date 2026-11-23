import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

/**
 * The contact box of the bazaar page; the wizard shows the same one in its previews
 * (#299). `compact` fits it into the smaller preview; without contact it shows `empty`.
 */
export function EventContactCard({
  contact,
  empty,
  compact,
  className,
}: {
  contact?: string;
  empty?: string;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('events');
  const text = contact?.trim();
  return (
    <div className={cn('bg-card rounded-xl border', compact ? 'p-4' : 'p-6', className)}>
      <h3 className={cn('font-semibold', compact ? 'mb-2 text-sm' : 'mb-4 text-lg')}>
        {t('sidebar.contact')}
      </h3>
      <p
        className={cn(
          'whitespace-pre-line break-words text-muted-foreground',
          compact ? 'text-xs' : 'text-sm',
          !text && 'italic'
        )}
      >
        {text ? contact : empty}
      </p>
    </div>
  );
}
