import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * A quiet box above a list: what is the matter, and the one thing to do about it, e.g.
 * turning down items nobody handed in or the items returned after the bazaar.
 */
export function ActionNotice({
  icon: Icon,
  title,
  children,
  action,
  className,
  ...props
}: {
  icon: LucideIcon;
  /** The fact, in bold */
  title?: ReactNode;
  /** What it means, muted */
  children?: ReactNode;
  /** Buttons on the right, below on phones */
  action?: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-3 text-sm">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <p>
          {title && <span className="font-medium">{title} </span>}
          {children && <span className="text-muted-foreground">{children}</span>}
        </p>
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}
