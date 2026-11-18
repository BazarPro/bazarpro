import { useState } from 'react';
import { BadgePercent } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Id, VendorWithCalculations } from '../../lib/api/types';
import type { FeeGroup } from '../../shared/feeGroups';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

/** The seller's fee group next to their name; amber while the intake still checks it. */
export function FeeGroupBadge({ group }: { group: VendorWithCalculations['feeGroup'] }) {
  const { t } = useTranslation('organizer');
  if (!group) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        group.pending
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
          : 'border-primary/20 bg-primary/5 text-primary'
      )}
      title={group.pending ? t('sellerFeeGroup.pendingHint') : t('sellerFeeGroup.title')}
    >
      <BadgePercent className="h-3 w-3" />
      {group.label}
      {group.pending && <span className="font-normal">· {t('sellerFeeGroup.pending')}</span>}
    </span>
  );
}

/**
 * The organizer puts a seller in a fee group by hand, e.g. a helper without rights in
 * the helper group, or takes them out. Helper groups apply by role anyway.
 */
export function FeeGroupMenu({
  eventId,
  vendor,
  groups,
  iconOnly,
}: {
  eventId: Id<'events'>;
  vendor: VendorWithCalculations;
  groups: FeeGroup[];
  iconOnly?: boolean;
}) {
  const { t } = useTranslation('organizer');
  const assign = useMutation(api.feeGroups.assignFeeGroup);
  const [busy, setBusy] = useState(false);
  if (groups.length === 0 || vendor.paid) return null;
  const current = vendor.feeGroup?.byRole
    ? (vendor.feeGroup.chosen ?? 'none')
    : (vendor.feeGroup?.id ?? 'none');
  const label = t('sellerFeeGroup.assign');

  const choose = async (value: string) => {
    if (value === current) return;
    setBusy(true);
    try {
      await assign({ eventId, sellerId: vendor._id, groupId: value === 'none' ? null : value });
      const group = groups.find((candidate) => candidate.id === value);
      toast.success(
        group
          ? t('sellerFeeGroup.assigned', { name: vendor.name, group: group.label })
          : t('sellerFeeGroup.unassigned', { name: vendor.name })
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={iconOnly ? 'icon' : 'sm'}
          title={label}
          aria-label={label}
          disabled={busy}
          className={iconOnly ? 'text-muted-foreground' : 'w-full gap-2 text-muted-foreground'}
          onClick={(e) => e.stopPropagation()}
        >
          <BadgePercent className="h-4 w-4" />
          {!iconOnly && label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>{t('sellerFeeGroup.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => void choose(value)}>
          <DropdownMenuRadioItem value="none">{t('sellerFeeGroup.none')}</DropdownMenuRadioItem>
          {groups.map((group) => (
            <DropdownMenuRadioItem key={group.id} value={group.id}>
              {group.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {vendor.feeGroup?.byRole && (
          <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">
            {t('sellerFeeGroup.byRole', { group: vendor.feeGroup.label })}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
