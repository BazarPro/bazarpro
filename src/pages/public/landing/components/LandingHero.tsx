import { ArrowRight, Calendar, ShoppingBag } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { HeroSaleScene } from './demo/HeroSaleScene';
import { useTranslation } from 'react-i18next';

interface LandingHeroProps {
  isAuthenticated: boolean;
  onOrganizerClick: () => void;
  onSellerClick: () => void;
}

export function LandingHero({
  isAuthenticated,
  onOrganizerClick,
  onSellerClick,
}: LandingHeroProps) {
  const { t } = useTranslation('landing');
  return (
    <section className="relative isolate flex items-center overflow-hidden lg:min-h-[min(calc(100svh-4rem),44rem)]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-tag/15 blur-3xl lg:left-1/4" />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:py-16">
        <div className="mx-auto min-w-0 max-w-2xl space-y-6 text-center lg:mx-0 lg:text-left">
          {/* "Second-Hand-Basare" does not break: on phones the size follows the width */}
          <h1 className="text-[clamp(1.75rem,8vw,2.25rem)] font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
            <span className="whitespace-nowrap">{t('hero.titleStart')}</span>
            <br />
            {/* A stroke of the tag-yellow marker behind the highlighted words */}
            <span className="relative isolate inline-block">
              {t('hero.titleHighlight')}
              <span
                aria-hidden="true"
                className="absolute -inset-x-1 bottom-[0.06em] -z-10 h-[0.32em] -rotate-1 rounded-sm bg-tag"
              />
            </span>{' '}
            {t('hero.titleEnd')}
          </h1>

          <p className="text-pretty text-lg text-muted-foreground sm:text-xl lg:text-[1.3rem] lg:leading-relaxed">
            <span className="block">
              {t('hero.line1Start')} <span className="whitespace-nowrap">{t('hero.line1End')}</span>
            </span>
            <span className="mt-1 block">
              {t('hero.line2Start')} <span className="whitespace-nowrap">{t('hero.line2End')}</span>
            </span>
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button
              size="lg"
              className="group h-12 px-6 text-base font-semibold"
              onClick={onOrganizerClick}
            >
              <Calendar className="mr-2 h-5 w-5" />
              {isAuthenticated ? t('actions.myEvents') : t('actions.organize')}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 bg-background/80 px-6 text-base font-semibold"
              onClick={onSellerClick}
            >
              <ShoppingBag className="mr-2 h-5 w-5" />
              {isAuthenticated ? t('actions.myProducts') : t('actions.joinAsSeller')}
            </Button>
          </div>
        </div>

        <HeroSaleScene />
      </div>
    </section>
  );
}
