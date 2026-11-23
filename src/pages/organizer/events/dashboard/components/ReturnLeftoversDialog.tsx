import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../../../../components/ui/confirm-dialog';
import { useMutation } from '../../../../../lib/api/react';
import { api } from '../../../../../lib/api/functions';
import type { Id } from '../../../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import type { ProductWithStatus } from './inventoryTypes';

/** Asks before returning everything left over after the bazaar at once (#305). */
export function ReturnLeftoversDialog({
  eventId,
  leftovers,
  undoEnabled,
  open,
  onOpenChange,
}: {
  eventId: Id<'events'>;
  leftovers: ProductWithStatus[];
  /** Single returns can be taken back (flag allow_undo_inventory_actions) */
  undoEnabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('organizer');
  const returnLeftovers = useMutation(api.eventProducts.returnLeftovers);
  const [isReturning, setIsReturning] = useState(false);
  const sellers = t('products.leftoverSellers', {
    count: new Set(leftovers.map((p) => p.vendorId)).size,
  });

  const handleConfirm = async (e: React.MouseEvent) => {
    // Open while saving, so a double click does not ask twice
    e.preventDefault();
    setIsReturning(true);
    try {
      const { returnedCount } = await returnLeftovers({
        eventId,
        productIds: leftovers.map((p) => p._id),
      });
      toast.success(t('products.leftoversReturned', { count: returnedCount }));
      onOpenChange(false);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsReturning(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => !next && !isReturning && onOpenChange(false)}
      title={t('products.returnLeftoversTitle', { count: leftovers.length })}
      description={t('products.returnLeftoversText', { sellers })}
      confirmLabel={t('products.returnLeftoversConfirm')}
      loading={isReturning}
      disabled={leftovers.length === 0}
      onConfirm={handleConfirm}
    >
      <p className="text-sm text-muted-foreground">
        {t('products.returnLeftoversPickup')} {undoEnabled && t('products.returnLeftoversUndo')}
      </p>
    </ConfirmDialog>
  );
}
