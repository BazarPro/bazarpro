import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, Link2, Lock, LockOpen, Settings2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { Doc } from '../../lib/api/types';
import { api } from '../../lib/api/functions';
import { useMutation } from '../../lib/api/react';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { cn, formatDateTimeDE } from '../../lib/utils';
import { useNowPassing } from '../../hooks/useNowPassing';
import { getRegistrationState, registrationTimes } from '../../shared/eventFeatures';
import { VISIBILITY_OPTIONS } from '../../constants/records';
import { Button } from '../ui/button';
import { spotsLeft } from './registrationText';

type RegistrationPanelEvent = Pick<
  Doc<'events'>,
  '_id' | 'features' | 'vendorLimit' | 'sellerCount' | 'accessCode' | 'visibility' | 'endDate'
> & {
  /** Places for items left on the whole market; sent with `maxItemsTotal` */
  itemPlacesLeft?: number;
};

/** "12 / 50" over a bar that turns amber once every place is taken. */
function PlacesMeter({
  taken,
  limit,
  label,
  leftText,
  fullText,
  small,
}: {
  taken: number;
  limit: number;
  label: string;
  leftText: string;
  fullText: string;
  small?: boolean;
}) {
  const full = taken >= limit;
  return (
    <>
      <div className="flex items-baseline gap-1 tabular-nums">
        <span className={cn('font-semibold', small ? 'text-lg' : 'text-2xl')}>{taken}</span>
        <span className="text-muted-foreground">/ {limit}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(taken, limit)}
        aria-label={label}
      >
        <div
          className={cn('h-full rounded-full transition-all', full ? 'bg-tag' : 'bg-primary')}
          style={{ width: `${Math.min(100, (taken / limit) * 100)}%` }}
        />
      </div>
      <p
        className={cn(
          'text-sm',
          full ? 'font-medium text-warning-soft-foreground' : 'text-muted-foreground'
        )}
      >
        {full ? fullText : leftText}
      </p>
    </>
  );
}

/** One column of the panel: a small heading over its content. */
function Section({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2 p-4 sm:p-5">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * How new sellers get in, at a glance on the sellers page: whether the registration is
 * open (and the organizer's switch for it), how many places are taken, and whether a
 * code or the link is needed.
 */
export function RegistrationPanel({
  event,
  canSwitch,
}: {
  event: RegistrationPanelEvent;
  /** Only the organizer opens and closes the registration */
  canSwitch: boolean;
}) {
  const { t } = useTranslation('organizer');
  const setRegistrationOpen = useMutation(api.events.setRegistrationOpen);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const now = useNowPassing([...registrationTimes(event), event.endDate]);
  if (event.endDate < now) return null;

  const state = getRegistrationState(event, now);
  const limit = event.vendorLimit && event.vendorLimit > 0 ? event.vendorLimit : undefined;
  const left = spotsLeft(event);
  const taken = event.sellerCount ?? 0;
  const full = left === 0;
  const maxItemsTotal =
    event.features?.maxItemsTotal && event.features.maxItemsTotal > 0
      ? event.features.maxItemsTotal
      : undefined;
  const itemsLeft = maxItemsTotal !== undefined ? event.itemPlacesLeft : undefined;
  const code = event.accessCode?.trim() || undefined;
  const linkOnly = event.visibility === 'approved';

  const tone = !state.open
    ? state.reason === 'notYet'
      ? 'waiting'
      : 'closed'
    : full
      ? 'full'
      : 'open';
  const statusText = {
    open: t('registrationPanel.open'),
    full: t('registrationPanel.full'),
    waiting: t('registrationPanel.notYet'),
    closed: t('registrationPanel.closed'),
  }[tone];
  const statusDetail = !state.open
    ? state.reason === 'notYet'
      ? t('registrationPanel.opensAt', { time: formatDateTimeDE(state.opensAt) })
      : t('registrationPanel.invitationOnly')
    : state.closesAt !== undefined
      ? t('registrationPanel.until', { time: formatDateTimeDE(state.closesAt) })
      : t('registrationPanel.noDeadline');

  const toggle = async () => {
    setIsSaving(true);
    try {
      await setRegistrationOpen({ eventId: event._id, open: !state.open });
      toast.success(
        t(state.open ? 'registrationPanel.closedToast' : 'registrationPanel.openedToast')
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('registrationPanel.copyFailed'));
    }
  };

  return (
    <section
      aria-label={t('registrationPanel.title')}
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
      data-testid="registration-panel"
    >
      <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Section
          icon={
            state.open ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />
          }
          label={t('registrationPanel.title')}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
              {tone === 'open' && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
              )}
              <span
                className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  tone === 'open' && 'bg-success',
                  tone === 'full' && 'bg-tag',
                  tone === 'waiting' && 'bg-sky-500',
                  tone === 'closed' && 'bg-muted-foreground/50'
                )}
              />
            </span>
            <span className="text-lg font-semibold">{statusText}</span>
          </div>
          <p className="text-sm text-muted-foreground">{statusDetail}</p>
          {canSwitch && (
            <Button
              variant={state.open ? 'outline' : 'default'}
              size="sm"
              className="mt-1 gap-2"
              disabled={isSaving}
              onClick={() => void toggle()}
            >
              {state.open ? (
                <>
                  <Lock className="h-4 w-4" /> {t('registrationPanel.close')}
                </>
              ) : (
                <>
                  <LockOpen className="h-4 w-4" />{' '}
                  {t(
                    state.reason === 'notYet'
                      ? 'registrationPanel.openNow'
                      : 'registrationPanel.reopen'
                  )}
                </>
              )}
            </Button>
          )}
        </Section>

        <Section icon={<Users className="h-3.5 w-3.5" />} label={t('registrationPanel.places')}>
          {maxItemsTotal !== undefined && (
            <div className="text-xs font-medium text-muted-foreground">
              {t('registrationPanel.sellers')}
            </div>
          )}
          {limit !== undefined ? (
            <PlacesMeter
              taken={taken}
              limit={limit}
              label={t('registrationPanel.places')}
              leftText={t('registrationPanel.left', { count: left ?? 0 })}
              fullText={t('registrationPanel.noneLeft')}
              small={maxItemsTotal !== undefined}
            />
          ) : (
            <>
              <span className="block text-lg font-semibold">
                {t('registrationPanel.unlimited')}
              </span>
              <p className="text-sm text-muted-foreground">
                {t('registrationPanel.unlimitedHint')}
              </p>
            </>
          )}
          {maxItemsTotal !== undefined && (
            <div className="space-y-2 border-t pt-3" data-testid="item-places">
              <div className="text-xs font-medium text-muted-foreground">
                {t('registrationPanel.items')}
              </div>
              {itemsLeft !== undefined ? (
                <PlacesMeter
                  taken={Math.max(0, maxItemsTotal - itemsLeft)}
                  limit={maxItemsTotal}
                  label={t('registrationPanel.itemPlaces')}
                  leftText={t('registrationPanel.itemsLeft', { count: itemsLeft })}
                  fullText={t('registrationPanel.noItemsLeft')}
                  small
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('registrationPanel.itemLimit', { count: maxItemsTotal })}
                </p>
              )}
            </div>
          )}
        </Section>

        <Section icon={<KeyRound className="h-3.5 w-3.5" />} label={t('registrationPanel.access')}>
          {code ? (
            <div className="flex items-center gap-2">
              <code className="truncate rounded-md border border-dashed bg-muted/60 px-2 py-1 font-mono text-base font-semibold tracking-wider">
                {code}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t('registrationPanel.copyCode')}
                title={t('registrationPanel.copyCode')}
                onClick={() => void copyCode()}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success-soft-foreground" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <span className="block text-lg font-semibold">{t('registrationPanel.noCode')}</span>
          )}
          <p className="text-sm text-muted-foreground">
            {code ? t('registrationPanel.codeNeeded') : t('registrationPanel.noCodeHint')}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {linkOnly && <Link2 className="h-3.5 w-3.5" />}
              {VISIBILITY_OPTIONS[event.visibility].title}
            </span>
            {canSwitch && (
              <Link
                to={`/events/view/${event._id}/settings`}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                <Settings2 className="h-3.5 w-3.5" /> {t('registrationPanel.edit')}
              </Link>
            )}
          </div>
        </Section>
      </div>
    </section>
  );
}
