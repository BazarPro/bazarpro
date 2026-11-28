import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { HELPER_PERMISSIONS, type HelperPermission } from '../../shared/constants';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { HelperPermissionsFields } from './HelperPermissionsFields';

export type HelperAction = {
  mode: 'add' | 'edit' | 'remove';
  vendor: {
    _id: Id<'users'>;
    name?: string | null;
    helperPermissions?: HelperPermission[] | undefined;
  };
};

/** Texts of the helper dialog by what it does */
const HELPER_DIALOG = {
  add: {
    title: 'sellers.appointHelper',
    text: 'sellers.appointText',
    confirm: 'sellers.appoint',
  },
  edit: {
    title: 'sellers.editPermissions',
    text: 'sellers.editPermissionsText',
    confirm: 'sellers.savePermissions',
  },
  remove: { title: 'sellers.revoke', text: 'sellers.revokeText', confirm: 'sellers.revoke' },
} as const;

/** What the dialog starts with: the helper's rights when editing, all for a new helper */
function initialPermissions(action: HelperAction | null): HelperPermission[] {
  return action?.mode === 'edit'
    ? (action.vendor.helperPermissions ?? [...HELPER_PERMISSIONS])
    : [...HELPER_PERMISSIONS];
}

/**
 * Appoints a seller as helper, changes what a helper may do or takes the role back.
 * Open while `action` is set; editing offers taking the role back, so each helper needs
 * just one entry point.
 */
export function HelperRoleDialog({
  eventId,
  action,
  onActionChange,
}: {
  eventId: Id<'events'>;
  action: HelperAction | null;
  onActionChange: (action: HelperAction | null) => void;
}) {
  const { t } = useTranslation('organizer');
  const addHelper = useMutation(api.eventRoles.addCoOrganizerForEvent);
  const removeHelper = useMutation(api.eventRoles.removeCoOrganizerForEvent);
  const setHelperPermissions = useMutation(api.eventRoles.setHelperPermissions);
  const [permissions, setPermissions] = useState(() => initialPermissions(action));
  // A new action starts from its own rights
  const [shownAction, setShownAction] = useState(action);
  if (action !== shownAction) {
    setShownAction(action);
    setPermissions(initialPermissions(action));
  }

  const execute = async () => {
    if (!action) return;
    const { mode, vendor } = action;
    try {
      if (mode === 'remove') {
        await removeHelper({ eventId, userId: vendor._id });
        toast.success(t('sellers.helperRemoved', { name: vendor.name }));
      } else if (mode === 'edit') {
        await setHelperPermissions({ eventId, userId: vendor._id, permissions });
        toast.success(t('sellers.permissionsSaved', { name: vendor.name }));
      } else {
        await addHelper({ eventId, userId: vendor._id, permissions });
        toast.success(t('sellers.helperAdded', { name: vendor.name }));
      }
    } catch (error) {
      toast.error(t('sellers.actionFailed'), {
        description: error instanceof Error ? error.message : t('sellers.unknownError'),
      });
    } finally {
      onActionChange(null);
    }
  };

  const texts = HELPER_DIALOG[action?.mode ?? 'add'];
  return (
    <ConfirmDialog
      open={!!action}
      onOpenChange={(open) => !open && onActionChange(null)}
      title={t(texts.title)}
      description={
        <Trans
          i18nKey={texts.text}
          ns="organizer"
          values={{ name: action?.vendor.name }}
          components={{ b: <b /> }}
        />
      }
      confirmLabel={t(texts.confirm)}
      destructive={action?.mode === 'remove'}
      onConfirm={execute}
    >
      {action && action.mode !== 'remove' && (
        <HelperPermissionsFields value={permissions} onChange={setPermissions} />
      )}
      {action?.mode === 'edit' && (
        <Button
          variant="danger"
          size="sm"
          className="-mt-2 justify-self-start gap-2"
          onClick={() => onActionChange({ mode: 'remove', vendor: action.vendor })}
        >
          <UserMinus className="h-4 w-4" /> {t('sellers.removeHelper')}
        </Button>
      )}
    </ConfirmDialog>
  );
}
