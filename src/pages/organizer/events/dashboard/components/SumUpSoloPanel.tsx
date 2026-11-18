import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Monitor, Plus, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../../components/ui/dialog';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { NativeSelect } from '../../../../../components/ui/native-select';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import type { SumUpReader } from '../../../../../lib/api/types';
import type { SumUpSoloState } from '../../../../../lib/sumupSolo';
import { cn } from '../../../../../lib/utils';
import { sumUpSettingsPath } from './sumUpSettingsPath';

const act = (action: () => Promise<unknown>) => () =>
  void action().catch((error: unknown) => toast.error(getUserFacingErrorMessage(error)));

/** Whether a Solo can take a payment now, as a small dot with its word. */
export function ReaderState({ reader }: { reader: SumUpReader }) {
  const { t } = useTranslation('organizer');
  const state =
    reader.status === 'processing'
      ? 'processing'
      : reader.online === false
        ? 'offline'
        : reader.online
          ? 'online'
          : null;
  if (!state) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          state === 'online' && 'bg-emerald-500',
          state === 'offline' && 'bg-muted-foreground/40',
          state === 'processing' && 'animate-pulse bg-amber-500'
        )}
      />
      {t(`checkout.solo.${state}`)}
    </span>
  );
}

/** A quiet line at the desk, e.g. why the Solo cannot charge, with the way to fix it. */
function DeskNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

/** The way to the settings, for the organizer, who sets SumUp up there. */
function SettingsLink({ eventId }: { eventId: string }) {
  const { t } = useTranslation('organizer');
  return (
    <Button asChild size="sm" variant="ghost" className="h-8 shrink-0 gap-1.5 px-2 text-xs">
      <Link to={sumUpSettingsPath(eventId)}>
        <Settings className="h-3.5 w-3.5" />
        {t('checkout.solo.toSettings')}
      </Link>
    </Button>
  );
}

/**
 * The SumUp Solo at a desk without the SumUp SDK, under the payment method "card": which
 * Solo takes the card. Connecting SumUp and pairing Solos is done in the event settings;
 * without a Solo the desk records the card payment by hand, as with any other terminal.
 */
export function SumUpSoloPanel({
  solo,
  disabled,
  eventId,
}: {
  solo: SumUpSoloState;
  disabled: boolean;
  eventId: string;
}) {
  const { t } = useTranslation('organizer');
  const busy = disabled || solo.busy;

  if (solo.paying) {
    return (
      <div className="flex w-full items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
        <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm">
          {t('checkout.solo.payOnReader', { reader: solo.reader?.name ?? 'Solo' })}
        </p>
        <Button size="sm" variant="outline" onClick={act(solo.cancel)}>
          {t('checkout.solo.cancel')}
        </Button>
      </div>
    );
  }
  if (!solo.connected) {
    return (
      <DeskNote action={solo.mayConnect && <SettingsLink eventId={eventId} />}>
        {t(solo.mayConnect ? 'checkout.solo.notConnected' : 'checkout.sumup.notConnected')}
      </DeskNote>
    );
  }
  if (solo.error) {
    return (
      <DeskNote
        action={
          <Button
            size="sm"
            variant="ghost"
            className="h-8 shrink-0 px-2 text-xs"
            disabled={busy}
            onClick={act(solo.refresh)}
          >
            {t('checkout.sumup.retry')}
          </Button>
        }
      >
        {getUserFacingErrorMessage(solo.error)}
      </DeskNote>
    );
  }
  if (!solo.readers) {
    return <p className="text-xs text-muted-foreground">{t('checkout.sumup.checking')}</p>;
  }
  const paired = solo.readers.filter((reader) => reader.status === 'paired');
  if (paired.length === 0) {
    return (
      <DeskNote action={solo.mayPair && <SettingsLink eventId={eventId} />}>
        {t(solo.mayPair ? 'checkout.solo.noneOrganizer' : 'checkout.solo.none')}
      </DeskNote>
    );
  }
  const current = solo.reader ?? paired[0];
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border px-3 py-1.5">
      <Monitor aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      {paired.length > 1 ? (
        <NativeSelect
          aria-label={t('checkout.solo.title')}
          value={solo.reader?.id ?? ''}
          disabled={busy}
          onChange={(event) => solo.choose(event.target.value)}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none dark:bg-transparent"
        >
          {!solo.reader && <option value="">{t('checkout.solo.choose')}</option>}
          {paired.map((reader) => (
            <option key={reader.id} value={reader.id}>
              {reader.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <span className="min-w-0 flex-1 truncate py-1 text-sm font-medium">{current.name}</span>
      )}
      <ReaderState reader={current} />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0"
        aria-label={t('checkout.solo.refresh')}
        disabled={busy}
        onClick={act(solo.refresh)}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * The organizer's Solos in the event settings: one card each, with its state and a way to
 * remove it, and pairing a new one in a dialog.
 */
export function SumUpReaderList({ solo }: { solo: SumUpSoloState }) {
  const { t } = useTranslation('organizer');
  const readers = solo.readers ?? [];
  return (
    <div className="space-y-2">
      {readers.length > 0 && (
        <ul className="space-y-2" aria-label={t('checkout.solo.title')}>
          {readers.map((reader) => (
            <li key={reader.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
              >
                <Monitor className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{reader.name}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">SumUp Solo</span>
                  <ReaderState reader={reader} />
                </div>
              </div>
              {solo.mayPair && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-label={t('checkout.solo.remove', { reader: reader.name })}
                  disabled={solo.busy}
                  onClick={act(() => solo.remove(reader.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {solo.mayPair && <SumUpPairDialog solo={solo} />}
    </div>
  );
}

/** Pairs a Solo with the organizer's account by the code it shows, step by step. */
function SumUpPairDialog({ solo }: { solo: SumUpSoloState }) {
  const { t } = useTranslation('organizer');
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setCode('');
      setName('');
    }
  };
  const steps = [t('checkout.solo.step1'), t('checkout.solo.step2'), t('checkout.solo.step3')];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 sm:w-auto"
        disabled={solo.busy}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        {t('checkout.solo.pairButton')}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('checkout.solo.pairTitle')}</DialogTitle>
            <DialogDescription>{t('checkout.solo.pairIntro')}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm">
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {/* No <form>: the event settings are a form of their own */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="solo-code">{t('checkout.solo.code')}</Label>
              <Input
                id="solo-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                autoComplete="off"
                maxLength={12}
                className="font-mono uppercase tracking-widest"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="solo-name">{t('checkout.solo.name')}</Label>
              <Input
                id="solo-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('checkout.solo.namePlaceholder')}
                maxLength={60}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {t('checkout.solo.cancel')}
            </Button>
            <Button
              type="button"
              loading={solo.busy}
              disabled={solo.busy || code.replace(/\s/g, '').length < 8}
              onClick={act(async () => {
                await solo.pair(code, name || undefined);
                close(false);
                toast.success(t('checkout.solo.paired'));
              })}
            >
              {t('checkout.solo.pair')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
