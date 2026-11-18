import { useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, Link2, Monitor, Smartphone } from 'lucide-react';
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
import { SumUpPairForm, SumUpReaderList } from '../dashboard/components/SumUpSoloPanel';
import { useSumUpReturnToast } from './useSumUpReturnToast';

/**
 * One line of the SumUp box: icon, title with its explanation behind an (i), and on the
 * right what it stands at. What belongs to it (e.g. the paired Solos) goes below.
 */
function SumUpRow({
  icon: Icon,
  title,
  info,
  status,
  children,
}: {
  icon: typeof Link2;
  title: string;
  info: string;
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-2">
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          <InfoTip>{info}</InfoTip>
        </div>
        {status && <div className="flex items-center gap-2">{status}</div>}
      </div>
      {children}
    </div>
  );
}

/** A short state on the right of a row: green once it is ready. */
function Status({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <span
      className={
        ok
          ? 'flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400'
          : 'text-xs text-muted-foreground'
      }
    >
      {ok && <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

/**
 * The SumUp account of the event, under "card payments": on a server with SumUp's OAuth
 * the organizer connects it here once, and every desk of the team charges it, in the app
 * with a card reader, in the browser with a SumUp Solo. Shows nothing on a server without,
 * where each device logs in at the desk.
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

  const accountStatus = connection.connected ? (
    <>
      <Status ok>
        {t('features.sumup.linked')}
        {connection.merchantCode && (
          <span className="font-mono font-normal text-muted-foreground">
            · {connection.merchantCode}
          </span>
        )}
      </Status>
      {connection.mine && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={busy}
            >
              {t('features.sumup.disconnect')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('features.sumup.disconnectTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('features.sumup.disconnectText')}</AlertDialogDescription>
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
    </>
  ) : connection.mine ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      // On the web SumUp opens on this page; unsaved settings would be lost
      disabled={busy || isDirty}
      onClick={() => void act(connect)()}
    >
      {t('features.sumup.connect')}
    </Button>
  ) : (
    <Status>{t('features.sumup.notLinked')}</Status>
  );

  return (
    <div className="divide-y rounded-lg border bg-card">
      <SumUpRow
        icon={Link2}
        title={t('features.sumup.account')}
        info={t('features.sumup.connectText')}
        status={accountStatus}
      >
        {!connection.connected && connection.mine && isDirty && (
          <p className="text-xs text-muted-foreground">{t('features.sumup.saveFirst')}</p>
        )}
        {!connection.connected && !connection.mine && (
          <p className="text-xs text-muted-foreground">{t('features.sumup.organizerConnects')}</p>
        )}
      </SumUpRow>
      {connection.connected && (
        <>
          <SumUpRow
            icon={Smartphone}
            title={t('features.sumup.app')}
            info={t('features.sumup.appText')}
            status={<Status>{t('features.sumup.appStatus')}</Status>}
          />
          {connection.mine && <SoloRow eventId={eventId} />}
        </>
      )}
    </div>
  );
}

/**
 * The organizer's SumUp Solos, which take cards at desks without the SumUp SDK, e.g. in
 * the browser on a PC: paired here once by the code the Solo shows.
 */
function SoloRow({ eventId }: { eventId: Id<'events'> }) {
  const { t } = useTranslation('organizer');
  const solo = useSumUpSolo(true, eventId);
  const count = solo.readers?.length ?? 0;
  return (
    <SumUpRow
      icon={Monitor}
      title={t('features.sumup.soloTitle')}
      info={t('features.sumup.soloText')}
      status={
        solo.readers !== null && !solo.error ? (
          <Status ok={count > 0}>{t('features.sumup.soloCount', { count })}</Status>
        ) : undefined
      }
    >
      {solo.error ? (
        <p className="text-xs text-destructive">{getUserFacingErrorMessage(solo.error)}</p>
      ) : solo.readers === null ? (
        <p className="text-xs text-muted-foreground">{t('checkout.sumup.checking')}</p>
      ) : (
        <>
          <SumUpReaderList solo={solo} disabled={false} />
          <SumUpPairForm solo={solo} disabled={false} />
        </>
      )}
    </SumUpRow>
  );
}
