import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

/** A key figure that links to its page. `urgent` marks something that needs doing. */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  to,
  urgent,
}: {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  to: string;
  urgent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/50 sm:p-5"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground',
          urgent && 'bg-primary/10 text-primary dark:bg-primary/25 dark:text-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span
          className={cn(
            'block whitespace-nowrap text-2xl font-semibold tabular-nums',
            urgent && 'text-primary dark:text-foreground'
          )}
        >
          {value}
        </span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export interface StatItem {
  icon: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  to: string;
  urgent?: boolean;
}

/**
 * Key figures side by side in one strip, each a link to its page: the figure big, its
 * name below. Short on phones too (three in a row).
 */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div
      className="grid divide-x overflow-hidden rounded-xl border bg-card shadow-xs"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ icon: Icon, label, value, hint, to, urgent }) => (
        <Link
          key={to}
          to={to}
          className="group min-w-0 px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 sm:py-4"
        >
          <span
            className={cn(
              'block truncate text-xl font-semibold tabular-nums sm:text-2xl',
              urgent && 'text-primary'
            )}
          >
            {value}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
            <ChevronRight className="ml-auto size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden" />
          </span>
          {hint && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hint}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
