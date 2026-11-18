import { useState, useEffect, useCallback } from 'react';
import { useApiClient, useMutation, useQuery } from '../../../lib/api/react';
import { api } from '../../../lib/api/functions';
import {
  STEP_SECONDS,
  checkInQrValue,
  currentCodes,
  fetchOwnKeys,
  ownKeys,
  type OwnKeys,
} from '../../../lib/checkInCode';
import { isNetworkError } from '../../../lib/offlineMode';
import { Button } from '../../../components/ui/button';
import { Eye, EyeOff, QrCode as QrCodeIcon, RefreshCw } from 'lucide-react';
import { QrCode } from '../../../components/ui/QrCode';
import { toast } from 'sonner';
import { getUserFacingErrorMessage } from '../../../lib/errors';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '../../../components/ui/skeleton';
import { FormSection } from '../../../components/ui/form-section';
import { cn } from '../../../lib/utils';

/**
 * The seller's ID QR code for intake and pickup. Online it carries the 60-second token of
 * the backend and the time-based codes of the seller's bazaars; without internet only the
 * codes, which the phone computes from its kept keys (lib/checkInCode.ts).
 */
export function DigitalIdCard() {
  const { t } = useTranslation('account');
  const client = useApiClient();
  const viewer = useQuery(api.users.viewer);
  const generateToken = useMutation(api.users.generateCheckInToken);
  const [checkInToken, setCheckInToken] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showDigitalId, setShowDigitalId] = useState(false);
  const [isGeneratingId, setIsGeneratingId] = useState(false);
  const [own, setOwn] = useState<OwnKeys | null>(null);
  /** The codes and the keys they are of: once the keys change or are gone, they no longer count */
  const [computed, setComputed] = useState<{ of: OwnKeys; codes: string[] } | null>(null);
  const [noKey, setNoKey] = useState(false);
  const userId = viewer?._id ?? null;

  const handleRefreshId = useCallback(async () => {
    setIsGeneratingId(true);
    try {
      const result = await generateToken();
      setCheckInToken(result.token);
      setTimeLeft(Math.floor((result.expires - Date.now()) / 1000));
    } catch (err) {
      setCheckInToken(null);
      // Offline the time-based code is enough
      if (!isNetworkError(err)) {
        console.error('Failed to generate token', err);
        toast.error(t('digitalId.loadFailed'), {
          description: getUserFacingErrorMessage(err),
        });
      }
    } finally {
      setIsGeneratingId(false);
    }
  }, [generateToken, t]);

  // The keys: fresh from the backend, else the ones kept on the device
  useEffect(() => {
    if (!showDigitalId || !userId) return;
    let active = true;
    fetchOwnKeys(client)
      .catch(() => ownKeys(userId))
      .then((keys) => {
        if (!active) return;
        setOwn(keys?.keys.length ? keys : null);
        setNoKey(!keys?.keys.length);
      })
      .catch(() => active && setNoKey(true));
    return () => {
      active = false;
    };
  }, [client, showDigitalId, userId]);

  // The codes change every STEP_SECONDS
  useEffect(() => {
    if (!showDigitalId || !own) return;
    let active = true;
    const update = () =>
      void currentCodes(own).then(
        (next) =>
          active &&
          setComputed((previous) =>
            previous?.of === own && previous.codes.join() === next.join()
              ? previous
              : { of: own, codes: next }
          )
      );
    update();
    const timer = setInterval(update, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [own, showDigitalId]);

  const codes = own && computed?.of === own ? computed.codes : null;
  // An expired token is left out, e.g. while a slow refresh runs
  const token = timeLeft > 0 ? checkInToken : null;
  const qrValue =
    userId && codes
      ? checkInQrValue(token, userId, codes)
      : token
        ? `bazarpro://user/${token}`
        : null;
  const offlineOnly = !token && !!qrValue;

  useEffect(() => {
    if (!showDigitalId || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, showDigitalId]);

  useEffect(() => {
    if (!showDigitalId) return;
    const interval = setInterval(handleRefreshId, 45000);
    return () => clearInterval(interval);
  }, [showDigitalId, handleRefreshId]);

  const toggleIdVisibility = () => {
    if (!showDigitalId) {
      handleRefreshId();
    }
    setShowDigitalId(!showDigitalId);
  };

  return (
    <FormSection
      icon={QrCodeIcon}
      title={t('digitalId.title')}
      description={t('digitalId.onlyOnSite')}
      info={t('digitalId.usage')}
      action={
        <Button
          variant={showDigitalId ? 'ghost' : 'outline'}
          size="sm"
          onClick={toggleIdVisibility}
          aria-label={showDigitalId ? t('digitalId.hide') : t('digitalId.showId')}
        >
          {showDigitalId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showDigitalId ? t('digitalId.hide') : t('digitalId.show')}
        </Button>
      }
    >
      {/* Opens by its height (grid rows), so nothing below jumps */}
      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
          showDigitalId ? 'grid-rows-[1fr] opacity-100' : '-mt-5 grid-rows-[0fr] opacity-0'
        )}
        inert={!showDigitalId}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Stays while it folds away; the codes stop meanwhile */}
          {(showDigitalId || qrValue) && (
            <div className="flex flex-col items-center gap-5 pt-1 sm:flex-row sm:items-center sm:gap-6">
              <div className="rounded-xl border bg-white p-3">
                {/* While a new token loads the last code stays: the time-based codes work */}
                {qrValue ? (
                  <QrCode value={qrValue} className="h-[180px] w-[180px]" />
                ) : (
                  <Skeleton className="h-[180px] w-[180px] rounded-lg" />
                )}
              </div>
              <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
                <div className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />
                    {offlineOnly
                      ? t('digitalId.offline', { seconds: STEP_SECONDS })
                      : t('digitalId.validFor', { seconds: Math.max(0, timeLeft) })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={handleRefreshId}
                    disabled={isGeneratingId}
                    aria-label={t('digitalId.refresh')}
                    title={t('digitalId.refresh')}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', isGeneratingId && 'animate-spin')} />
                  </Button>
                </div>
                {noKey && !checkInToken && (
                  <p className="text-xs text-destructive">{t('digitalId.noOfflineKey')}</p>
                )}
                <p className="max-w-xs text-xs text-muted-foreground">
                  {t('digitalId.noScreenshot')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </FormSection>
  );
}
