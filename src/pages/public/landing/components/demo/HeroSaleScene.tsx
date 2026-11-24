import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, formatPrice } from '../../../../../lib/utils';
import {
  AppBar,
  BikePhoto,
  BikeWithTag,
  HangTag,
  PhoneFrame,
  RackWithTag,
  RaincoatThumb,
} from './Illustrations';

/** The tags grow with the scene (container width), but stay readable on phones */
const TAG_WIDTH = 'max(3.4rem, 15cqw)';

/** Red scan line running down a QR code; `className` sets its animation. */
function ScanLine({ className }: { className: string }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-destructive shadow-[0_0_8px_2px_color-mix(in_oklab,var(--destructive)_70%,transparent)]',
        className
      )}
      style={{ ['--landing-scan-distance' as string]: `calc(${TAG_WIDTH} - 0.6rem)` }}
    />
  );
}

/**
 * Hero scene: a raincoat on a clothes rack and an old bike, both with a BazarPro hang
 * tag, are scanned one after the other with an ordinary phone; both land in the cart and
 * are sold together. Decorative (aria-hidden). `still`: the final state without motion,
 * e.g. for the link preview (scripts/social-preview).
 */
export function HeroSaleScene({
  still = false,
  className,
}: {
  still?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('landing');
  const motion = (name: string) => (still ? undefined : name);
  return (
    <div aria-hidden="true" className={cn('relative mx-auto w-full max-w-2xl', className)}>
      {/* A calm petrol ground with the dots of the page, no haze */}
      <div className="absolute inset-x-2 bottom-4 top-8 -z-10 rounded-[2.5rem] bg-primary/[0.07] bg-[radial-gradient(color-mix(in_oklab,var(--primary)_22%,transparent)_1.5px,transparent_1.5px)] [background-size:18px_18px] dark:bg-primary/10" />

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="@container relative aspect-[6/5] min-w-0 flex-1">
          <RackWithTag
            className="absolute left-0 top-0 w-[56%]"
            tag={
              <div className={cn('origin-top [animation-delay:-1.5s]', motion('landing-swing'))}>
                <HangTag
                  style={{ width: TAG_WIDTH }}
                  itemNumber={t('demo.itemNumber', { number: '07-112' })}
                  overlay={!still && <ScanLine className="landing-hero-scan-a" />}
                />
              </div>
            }
          />
          <BikeWithTag
            className="absolute bottom-0 right-0 w-[78%] drop-shadow-sm"
            tag={
              <div className={cn('origin-top', motion('landing-swing'))}>
                <HangTag
                  style={{ width: TAG_WIDTH }}
                  itemNumber={t('demo.itemNumber', { number: '12-034' })}
                  overlay={!still && <ScanLine className="landing-hero-scan-b" />}
                />
              </div>
            }
          />
        </div>

        <PhoneFrame short className="w-[40%] max-w-[10.5rem] shrink-0 sm:w-[28%] lg:w-[33%]">
          <AppBar title={t('demo.checkout')} />
          <div className="flex flex-1 flex-col gap-1.5 p-2 pb-3">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-lg border bg-card p-1',
                motion('landing-hero-line-a')
              )}
            >
              <RaincoatThumb className="h-8 w-8 shrink-0 rounded-md py-1" />
              <div className="min-w-0">
                <p className="truncate text-[0.55rem] text-muted-foreground">
                  {t('demo.raincoat')}
                </p>
                <p className="text-xs font-bold tabular-nums">{formatPrice(8)} €</p>
              </div>
            </div>
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-lg border bg-card p-1',
                motion('landing-hero-line-b')
              )}
            >
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
                <BikePhoto className="h-full px-0.5 pb-1" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[0.55rem] text-muted-foreground">{t('demo.bike')}</p>
                <p className="text-xs font-bold tabular-nums">{formatPrice(45)} €</p>
              </div>
            </div>
            <div
              className={cn(
                'flex items-baseline justify-between px-1 pt-0.5',
                motion('landing-hero-line-b')
              )}
            >
              <span className="text-[0.55rem] text-muted-foreground">{t('demo.total')}</span>
              <span className="text-sm font-extrabold tabular-nums">{formatPrice(53)} €</span>
            </div>
            <div className="relative mt-auto">
              <div className="rounded-lg bg-primary py-1.5 text-center text-[0.65rem] font-bold text-primary-foreground">
                {t('demo.sell')}
              </div>
              <div
                className={cn(
                  'absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-success text-[0.65rem] font-bold text-white',
                  motion('landing-hero-sold')
                )}
              >
                <CheckCircle2 className="h-3 w-3" /> {t('demo.sold')}
              </div>
            </div>
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}
