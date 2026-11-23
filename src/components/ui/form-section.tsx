import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { InfoTip } from './info-tip';

/**
 * One block of a form or settings page: a card with an optional title and intro, used by
 * the event forms and the account page. A longer explanation goes behind the (i) of `info`.
 */
export function FormSection({
  title,
  description,
  info,
  icon: Icon,
  action,
  tone = 'default',
  children,
  className,
  contentClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  info?: ReactNode;
  icon?: LucideIcon;
  /** Next to the title, e.g. a button that shows or hides the content */
  action?: ReactNode;
  tone?: 'default' | 'destructive';
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
}) {
  const destructive = tone === 'destructive';
  return (
    <section
      id={id}
      className={cn(
        'rounded-xl border bg-card p-5 shadow-xs sm:p-6',
        destructive && 'border-destructive/30',
        className
      )}
    >
      {(title || description || action) && (
        <div className={cn(children !== undefined && 'mb-5')}>
          <div className="flex min-h-8 items-center gap-2.5">
            {Icon && (
              <span
                aria-hidden
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            )}
            {title && (
              <h2
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-1 text-lg font-semibold',
                  destructive && 'text-destructive'
                )}
              >
                {title}
                {info && <InfoTip>{info}</InfoTip>}
              </h2>
            )}
            {action && <div className="ml-auto shrink-0">{action}</div>}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children !== undefined && (
        <div className={cn('space-y-5', contentClassName)}>{children}</div>
      )}
    </section>
  );
}

/** Rows split by lines instead of cards inside a card: `contentClassName` of a FormSection. */
export const FORM_ROWS = 'space-y-0 divide-y *:py-4 *:first:pt-0 *:last:pb-0';
