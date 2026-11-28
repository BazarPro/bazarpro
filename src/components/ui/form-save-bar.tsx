import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { ConfirmDialog } from './confirm-dialog';
import { StickyActionBar } from './sticky-action-bar';

/**
 * Saving a form, the same everywhere (#336): a bar at the lower edge of the screen, whether
 * something is unsaved on the left, "Speichern" on the right. With `onSave` the button saves
 * by itself, otherwise it submits its form. `children` are further actions, before "Speichern".
 */
export function FormSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saveLabel,
  saveAriaLabel,
  disabled = false,
  status = true,
  children,
  className,
  saveClassName,
}: {
  dirty: boolean;
  saving: boolean;
  onSave?: () => void;
  /** Back to what is saved, after asking */
  onDiscard?: () => void;
  saveLabel?: ReactNode;
  /** The button's name when its label differs by screen size */
  saveAriaLabel?: string;
  /** No save yet, e.g. without changes where saving the same again makes no sense */
  disabled?: boolean;
  /** Whether something is unsaved: off for a form that creates something new */
  status?: boolean;
  children?: ReactNode;
  className?: string;
  saveClassName?: string;
}) {
  const { t } = useTranslation('common');
  return (
    <StickyActionBar
      className={cn(
        'bottom-[calc(var(--bottom-inset,0px)+var(--tab-bar-bulge,0px)+0.75rem)] mx-0 mb-3 rounded-xl border bg-card/95 px-4 pb-3 shadow-lg md:mx-0 md:px-5 lg:mx-0 lg:px-5',
        className
      )}
    >
      {status &&
        (dirty ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground" role="status">
            {/* Phones: "Verwerfen" and "Speichern" in one row, the note only for screen readers */}
            <span className="max-sm:sr-only">{t('saveBar.unsaved')}</span>
            {onDiscard && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="ghost" size="sm" disabled={saving}>
                    {t('saveBar.discard')}
                  </Button>
                }
                title={t('saveBar.discardTitle')}
                description={t('saveBar.discardText')}
                confirmLabel={t('saveBar.discardConfirm')}
                onConfirm={onDiscard}
                destructive
              />
            )}
          </span>
        ) : (
          <span
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
            role="status"
            data-testid="form-saved"
          >
            <Check className="size-4" aria-hidden />
            {t('saveBar.allSaved')}
          </span>
        ))}
      {children}
      <Button
        type={onSave ? 'button' : 'submit'}
        onClick={onSave}
        loading={saving}
        disabled={saving || disabled}
        aria-label={saveAriaLabel}
        // Not greyed out like a second button: still the main action, only paler
        className={cn(
          'ml-auto flex-1 sm:min-w-40 sm:flex-none disabled:bg-primary disabled:text-primary-foreground disabled:opacity-50',
          saveClassName
        )}
      >
        {saving ? t('actions.saving') : (saveLabel ?? t('actions.save'))}
      </Button>
    </StickyActionBar>
  );
}
