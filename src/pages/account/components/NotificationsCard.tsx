import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '../../../lib/api/react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api/functions';
import { NOTIFICATION_CATEGORIES } from '../../../shared/constants';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../../components/ui/switch';
import { InfoTip } from '../../../components/ui/info-tip';
import { Skeleton } from '../../../components/ui/skeleton';
import { FORM_ROWS, FormSection } from '../../../components/ui/form-section';
import { Label } from '../../../components/ui/label';
import { getUserFacingErrorMessage } from '../../../lib/errors';

/** The other categories explain themselves by their title */
const NOTIFICATION_HINTS: readonly string[] = ['buyer', 'reminders', 'organizer'];

/** Which emails the user gets; the red markers in the menu stay either way. */
export function NotificationsCard() {
  const { t } = useTranslation('account');
  const prefs = useQuery(api.notifications.getMyNotificationPrefs);
  const update = useMutation(api.notifications.updateMyNotificationPrefs).withOptimisticUpdate(
    (store, { prefs: change }) => {
      const current = store.getQuery(api.notifications.getMyNotificationPrefs, {});
      if (current) {
        store.setQuery(api.notifications.getMyNotificationPrefs, {}, { ...current, ...change });
      }
    }
  );

  // Opened from the unsubscribe page via /account#notifications
  const { hash } = useLocation();
  const loaded = prefs !== undefined;
  useEffect(() => {
    if (loaded && hash === '#notifications') {
      document.getElementById('notifications')?.scrollIntoView();
    }
  }, [loaded, hash]);

  return (
    <FormSection
      id="notifications"
      icon={Bell}
      title={t('notifications.title')}
      info={t('notifications.intro')}
      className="scroll-mt-24"
      contentClassName={FORM_ROWS}
    >
      {prefs
        ? NOTIFICATION_CATEGORIES.map((category) => {
            const description = NOTIFICATION_HINTS.includes(category)
              ? t(`notifications.categories.${category}.description` as never)
              : null;
            const id = `notify-${category}`;
            return (
              <div key={category} className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Label htmlFor={id} className="cursor-pointer font-medium">
                    {t(`notifications.categories.${category}.title`)}
                  </Label>
                  {description && <InfoTip>{description}</InfoTip>}
                </div>
                <Switch
                  id={id}
                  checked={prefs[category]}
                  onCheckedChange={(checked) =>
                    update({ prefs: { [category]: !!checked } }).catch((error) =>
                      toast.error(getUserFacingErrorMessage(error))
                    )
                  }
                />
              </div>
            );
          })
        : NOTIFICATION_CATEGORIES.map((category) => (
            <Skeleton key={category} className="h-6 w-full" />
          ))}
    </FormSection>
  );
}
