import { useState } from 'react';
import { Plus, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../../components/ui/button';
import { Input } from '../../../../../components/ui/input';
import { InfoTip } from '../../../../../components/ui/info-tip';
import { getUserFacingErrorMessage } from '../../../../../lib/errors';
import type { SumUpSoloState } from '../../../../../lib/sumupSolo';
import { useSumUpReturn } from '../../../../../native/sumup';
import { useSumUpReturnToast } from '../../components/useSumUpReturnToast';

const act = (action: () => Promise<unknown>) => () =>
  void action().catch((error: unknown) => toast.error(getUserFacingErrorMessage(error)));

/**
 * The SumUp Solo at a desk without the SumUp SDK, under the payment method "card": which
 * Solo of the organizer's account takes the card, and pairing one for the organizer.
 * Without one the desk records the card payment by hand, as with any other terminal.
 */
export function SumUpSoloPanel({ solo, disabled }: { solo: SumUpSoloState; disabled: boolean }) {
  const { t } = useTranslation('organizer');
  const busy = disabled || solo.busy;
  useSumUpReturn(useSumUpReturnToast());

  if (solo.paying) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <p className="min-w-0 flex-1 basis-48 text-sm font-medium">
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
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
          {t(solo.mayConnect ? 'checkout.solo.connectText' : 'checkout.sumup.notConnected')}
        </p>
        {solo.mayConnect && (
          <Button size="sm" variant="outline" disabled={busy} onClick={act(solo.connect)}>
            {t('checkout.sumup.connect')}
          </Button>
        )}
      </div>
    );
  }
  if (solo.error) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
          {getUserFacingErrorMessage(solo.error)} {t('checkout.solo.byHand')}
        </p>
        <Button size="sm" variant="outline" disabled={busy} onClick={act(solo.refresh)}>
          {t('checkout.sumup.retry')}
        </Button>
      </div>
    );
  }
  if (!solo.readers) {
    return <p className="text-xs text-muted-foreground">{t('checkout.sumup.checking')}</p>;
  }
  return (
    <div className="w-full space-y-2 rounded-lg border bg-card p-2">
      <SumUpReaderList solo={solo} disabled={disabled} choose />
      {solo.readers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {t(solo.mayPair ? 'checkout.solo.noneOrganizer' : 'checkout.solo.none')}
        </p>
      )}
      {solo.mayPair && <SumUpPairForm solo={solo} disabled={disabled} />}
    </div>
  );
}

/**
 * The Solos of the organizer's account. At the desk one is chosen for this device; in
 * the settings the organizer removes them.
 */
export function SumUpReaderList({
  solo,
  disabled,
  choose,
}: {
  solo: SumUpSoloState;
  disabled: boolean;
  /** At the desk: pick the Solo this device charges */
  choose?: boolean;
}) {
  const { t } = useTranslation('organizer');
  const busy = disabled || solo.busy;
  const readers = solo.readers ?? [];
  if (readers.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        {/* In the settings the row above names them already */}
        {choose ? (
          <p className="text-xs text-muted-foreground">{t('checkout.solo.title')}</p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          disabled={busy}
          onClick={act(solo.refresh)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('checkout.solo.refresh')}
        </Button>
      </div>
      <div
        role={choose ? 'radiogroup' : 'list'}
        aria-label={t('checkout.solo.title')}
        className="grid gap-1"
      >
        {readers.map((reader) => {
          const selected = choose && solo.reader?.id === reader.id;
          const state =
            reader.status === 'processing'
              ? t('checkout.solo.processing')
              : reader.online === false
                ? t('checkout.solo.offline')
                : reader.online
                  ? t('checkout.solo.online')
                  : '';
          const label = (
            <>
              <Smartphone className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{reader.name}</span>
              {state && (
                <span
                  className={
                    reader.online
                      ? 'text-xs text-emerald-600 dark:text-emerald-400'
                      : 'text-xs text-muted-foreground'
                  }
                >
                  {state}
                </span>
              )}
            </>
          );
          return (
            <div key={reader.id} role={choose ? undefined : 'listitem'} className="flex gap-1">
              {choose ? (
                <Button
                  type="button"
                  role="radio"
                  size="sm"
                  aria-checked={selected}
                  variant={selected ? 'secondary' : 'outline'}
                  className="h-auto min-h-8 min-w-0 flex-1 gap-1.5"
                  disabled={busy || reader.status !== 'paired'}
                  onClick={() => solo.choose(reader.id)}
                >
                  {label}
                </Button>
              ) : (
                <div className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-3 text-sm">
                  {label}
                </div>
              )}
              {!choose && solo.mayPair && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  aria-label={t('checkout.solo.remove', { reader: reader.name })}
                  disabled={busy}
                  onClick={act(() => solo.remove(reader.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pairs a Solo with the organizer's account by the code it shows. */
export function SumUpPairForm({ solo, disabled }: { solo: SumUpSoloState; disabled: boolean }) {
  const { t } = useTranslation('organizer');
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const busy = disabled || solo.busy;
  const first = (solo.readers ?? []).length === 0;

  if (!open && !first) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        {t('checkout.solo.pairAnother')}
      </Button>
    );
  }
  return (
    // No <form>: the desk and the event settings are forms of their own
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium">{t('checkout.solo.pairTitle')}</p>
        <InfoTip>{t('checkout.solo.pairHint')}</InfoTip>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder={t('checkout.solo.code')}
          aria-label={t('checkout.solo.code')}
          autoComplete="off"
          maxLength={12}
          className="h-9 min-w-0 flex-1 basis-28 font-mono uppercase"
        />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('checkout.solo.namePlaceholder')}
          aria-label={t('checkout.solo.name')}
          maxLength={60}
          className="h-9 min-w-0 flex-1 basis-28"
        />
        <Button
          type="button"
          size="sm"
          className="h-9"
          disabled={busy || code.replace(/\s/g, '').length < 8}
          onClick={act(async () => {
            await solo.pair(code, name || undefined);
            setCode('');
            setName('');
            setOpen(false);
            toast.success(t('checkout.solo.paired'));
          })}
        >
          {t('checkout.solo.pair')}
        </Button>
      </div>
    </div>
  );
}
