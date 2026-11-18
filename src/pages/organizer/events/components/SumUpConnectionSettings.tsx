import { useEffect, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Smartphone } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { InfoTip } from '../../../../components/ui/info-tip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../../components/ui/alert-dialog';
import { api } from '../../../../lib/api/functions';
import { useMutation, useOptionalQuery } from '../../../../lib/api/react';
import type { Id } from '../../../../lib/api/types';
import { getUserFacingErrorMessage } from '../../../../lib/errors';
import { useSumUpConnect, useSumUpReturn } from '../../../../native/sumup';
import { useSumUpSolo } from '../../../../lib/sumupSolo';
import { cn } from '../../../../lib/utils';
import { SumUpReaderList } from '../dashboard/components/SumUpSoloPanel';
import { useSumUpReturnToast } from './useSumUpReturnToast';

/** Green dot with "Verbunden", grey without. */
function ConnectionState({ connected }: { connected: boolean }) {
  const { t } = useTranslation('organizer');
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'
        )}
      />
      {t(connected ? 'features.sumup.linked' : 'features.sumup.notLinked')}
    </span>
  );
}

/**
 * The SumUp account of the event, under "card payments": on a server with SumUp's OAuth
 * the organizer connects it here once, and every desk of the team charges it, in the app
 * with a card reader, in the browser with a SumUp Solo paired here. Shows nothing on a
 * server without, where each device logs in at the desk. The desk links here (#sumup).
 */
export function SumUpConnectionSettings({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const connection = useOptionalQuery(api.sumup.getConnection, { eventId });
  const connect = useSumUpConnect();
  const disconnect = useMutation(api.sumup.disconnect);
  const [busy, setBusy] = useState(false);
  const {
    formState: { isDirty },
  } = useFormContext();
  useSumUpReturn(useSumUpReturnToast());
  const box = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();
  const shown = !!connection?.oauth;
  useEffect(() => {
    if (shown && hash === '#sumup') box.current?.scrollIntoView({ block: 'start' });
  }, [shown, hash]);

  if (!connection?.oauth) return null;

  const act = (action: () => Promise<unknown>) => async () => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={box} id="sumup" className="scroll-mt-32 space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">SumUp</span>
        <InfoTip>{t('features.sumup.connectText')}</InfoTip>
        <span className="flex-1" />
        <ConnectionState connected={connection.connected} />
      </div>

      {connection.connected ? (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {connection.merchantCode
              ? t('features.sumup.merchant', { merchant: connection.merchantCode })
              : t('features.sumup.connectedText')}
          </span>
          {connection.mine && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-my-1 h-7 shrink-0 px-2 text-xs"
                  disabled={busy}
                >
                  {t('features.sumup.disconnect')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('features.sumup.disconnectTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('features.sumup.disconnectText')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('features.sumup.keep')}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void act(() => disconnect({}))()}>
                    {t('features.sumup.disconnect')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ) : connection.mine ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('features.sumup.connectShort')}</p>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            // On the web SumUp opens on this page; unsaved settings would be lost
            disabled={busy || isDirty}
            onClick={() => void act(connect)()}
          >
            {t('features.sumup.connect')}
          </Button>
          {isDirty && (
            <p className="text-xs text-muted-foreground">{t('features.sumup.saveFirst')}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('features.sumup.organizerConnects')}</p>
      )}

      {connection.connected && connection.mine && <Devices eventId={eventId} />}
    </div>
  );
}

/**
 * The card terminals of the account: the Solos for desks in the browser, paired here, and
 * a word on the readers of the app, which are connected at the desk.
 */
function Devices({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const solo = useSumUpSolo(true, eventId);
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium">{t('features.sumup.soloTitle')}</span>
        <InfoTip>{t('features.sumup.soloText')}</InfoTip>
      </div>
      {solo.error ? (
        <p className="text-xs text-destructive">{getUserFacingErrorMessage(solo.error)}</p>
      ) : solo.readers === null ? (
        <p className="text-xs text-muted-foreground">{t('checkout.sumup.checking')}</p>
      ) : (
        <>
          {solo.readers.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('features.sumup.soloNone')}</p>
          )}
          <SumUpReaderList solo={solo} />
        </>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Smartphone aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {t('features.sumup.appShort')} <InfoTip>{t('features.sumup.appText')}</InfoTip>
        </span>
      </p>
    </div>
  );
}
