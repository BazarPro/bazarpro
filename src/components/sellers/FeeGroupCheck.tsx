import { useState } from 'react';
import { BadgePercent, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Id, VendorWithCalculations } from '../../lib/api/types';
import type { FeeGroup } from '../../shared/feeGroups';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { Button } from '../ui/button';

/**
 * At the intake: the seller says they belong to a fee group (#302). The team checks the
 * proof and confirms or removes the group; until then no item of the seller is accepted.
 */
export function FeeGroupCheck({
  eventId,
  seller,
  groups,
}: {
  eventId: Id<'events'>;
  seller: VendorWithCalculations;
  groups: FeeGroup[];
}) {
  const { t } = useTranslation('organizer');
  const confirm = useMutation(api.feeGroups.confirmFeeGroup);
  const remove = useMutation(api.feeGroups.removeFeeGroup);
  const [busy, setBusy] = useState<'confirm' | 'remove' | null>(null);
  const pending = seller.feeGroup?.pending ? seller.feeGroup : undefined;
  if (!pending) return null;
  const group = groups.find((candidate) => candidate.id === pending.id);

  const run = async (action: 'confirm' | 'remove') => {
    setBusy(action);
    try {
      await (action === 'confirm' ? confirm : remove)({ eventId, sellerId: seller._id });
      toast.success(
        t(action === 'confirm' ? 'feeGroupCheck.confirmed' : 'feeGroupCheck.removed', {
          group: pending.label,
        })
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label={t('feeGroupCheck.title', { group: pending.label })}
      data-testid="fee-group-check"
      className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
        <BadgePercent className="h-4 w-4 shrink-0" />
        {t('feeGroupCheck.title', { group: pending.label })}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {group?.proofHint
          ? t('feeGroupCheck.textWithProof', { proof: group.proofHint })
          : t('feeGroupCheck.text')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={busy === 'confirm'}
          disabled={!!busy}
          onClick={() => void run('confirm')}
        >
          <Check className="mr-1.5 h-4 w-4" /> {t('feeGroupCheck.confirm')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={busy === 'remove'}
          disabled={!!busy}
          onClick={() => void run('remove')}
        >
          <X className="mr-1.5 h-4 w-4" /> {t('feeGroupCheck.remove')}
        </Button>
      </div>
    </section>
  );
}
