import { UserX } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import i18n from '../../i18n';

/** Marks sellers the organizer created on site: no own account, no login, no emails. */
export function WalkInBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 gap-1 border-tag/60 bg-warning-soft text-warning-soft-foreground',
        className
      )}
      title={i18n.t('walkIn.badgeTitle', { ns: 'organizer' })}
    >
      <UserX className="h-3 w-3" />
      {i18n.t('walkIn.badge', { ns: 'organizer' })}
    </Badge>
  );
}
