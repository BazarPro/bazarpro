import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { ReasonField } from './ReasonField';

export type ExclusionMode = 'exclude' | 'readmit';

/**
 * Takes a seller out of the bazaar, with an optional reason for them, or back in.
 * Organizer only; the seller gets a mail either way.
 */
export function ExclusionDialog({
  eventId,
  seller,
  mode,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  seller: { _id: Id<'users'>; name?: string | null };
  /** Open while set */
  mode: ExclusionMode | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('organizer');
  const excludeSeller = useMutation(api.eventExclusions.exclude);
  const readmitSeller = useMutation(api.eventExclusions.readmit);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const name = seller.name ?? '';

  const close = () => {
    setReason('');
    onOpenChange(false);
  };

  const execute = async (e: React.MouseEvent) => {
    // Open while saving; an error leaves the reason for another try
    e.preventDefault();
    const args = { eventId, userId: seller._id };
    setSaving(true);
    try {
      if (mode === 'exclude') {
        await excludeSeller({ ...args, reason: reason.trim() || undefined });
        toast.success(t('sellers.excluded', { name }));
      } else {
        await readmitSeller(args);
        toast.success(t('sellers.readmitted', { name }));
      }
      close();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const readmit = mode === 'readmit';
  return (
    <ConfirmDialog
      open={mode !== null}
      onOpenChange={(open) => !open && !saving && close()}
      title={t(readmit ? 'sellers.readmitTitle' : 'sellers.excludeTitle', { name })}
      description={
        readmit ? (
          t('sellers.readmitText')
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('sellers.excludeNoReturn')}</li>
            <li>{t('sellers.excludeItems')}</li>
            <li>{t('sellers.excludeMail')}</li>
          </ul>
        )
      }
      confirmLabel={t(readmit ? 'sellers.readmit' : 'sellers.excludeConfirm')}
      destructive={!readmit}
      loading={saving}
      onConfirm={execute}
    >
      {mode === 'exclude' && (
        <ReasonField
          value={reason}
          onChange={setReason}
          placeholder={t('sellers.excludeReasonPlaceholder')}
        />
      )}
    </ConfirmDialog>
  );
}
