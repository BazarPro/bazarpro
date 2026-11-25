import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { SortMarkBadge } from '../../../components/sellers/SortMarkBadge';
import { Button } from '../../../components/ui/button';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { DEMO_URL } from '../../../lib/links';
import { LandingCTA } from '../landing/components/LandingCTA';
import { MarketingHero, SectionHeading } from './components/MarketingHero';
import { SortingGame } from './components/SortingGame';
import { UniversalLabelSection } from './components/UniversalLabelSection';
import { useStartActions } from './components/useStartActions';

/** Any code gives a realistic mark; this one has a clear digit and two colored fields. */
const EXAMPLE_CODE = 66_643;

const PARTS = ['pile', 'letter', 'basket'] as const;

/** How universal labels work, with a heap of labels to sort back as a small game. */
export function LabelsPage() {
  const { t } = useTranslation(['company', 'landing']);
  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();
  const { isDemoMode } = useFeatureFlags();

  const toGame = () => {
    const game = document.getElementById('sortieren');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    game?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background">
      <Seo
        title={t('labelsPage.seoTitle')}
        description={t('labelsPage.seoDescription')}
        canonical="/labels"
      />
      <main className="flex-grow">
        <MarketingHero
          eyebrow={t('labelsPage.eyebrow')}
          title={
            <Trans
              i18nKey="labelsPage.title"
              ns="company"
              components={{ highlight: <span className="text-primary" /> }}
            />
          }
          actions={
            <>
              <Button size="lg" className="h-12 px-6 text-base font-semibold" onClick={toGame}>
                <ArrowDown /> {t('labelsPage.play')}
              </Button>
              {!isDemoMode && (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base font-semibold"
                >
                  <a href={DEMO_URL} target="_blank" rel="noopener">
                    {t('labelsPage.demo')} <ArrowUpRight />
                  </a>
                </Button>
              )}
            </>
          }
        >
          {t('labelsPage.intro')}
        </MarketingHero>

        {/* The mark, part by part */}
        <section className="pb-20 sm:pb-24">
          <div className="container mx-auto max-w-5xl px-4">
            <SectionHeading
              eyebrow={t('labelsPage.anatomy.eyebrow')}
              title={t('labelsPage.anatomy.title')}
            >
              {t('labelsPage.anatomy.text')}
            </SectionHeading>
            <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
              <div className="relative mx-auto w-full max-w-sm px-6">
                <SortMarkBadge code={EXAMPLE_CODE} className="h-auto w-full drop-shadow-md" />
                {/* Numbers beside the parts they name */}
                <Marker number={1} className="left-0 top-[22%]" />
                <Marker number={2} className="left-0 top-[66%]" />
                <Marker number={3} className="right-0 top-[44%]" />
              </div>
              <ol className="space-y-6">
                {PARTS.map((part, index) => (
                  <li key={part} className="flex gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-display font-extrabold text-primary-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{t(`labelsPage.anatomy.${part}.title`)}</h3>
                      <p className="text-pretty text-muted-foreground">
                        {t(`labelsPage.anatomy.${part}.text`)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section id="sortieren" className="scroll-mt-20 bg-muted/40 py-20 sm:py-24">
          <div className="container mx-auto max-w-5xl px-4">
            <SectionHeading
              eyebrow={t('labelsPage.game.eyebrow')}
              title={t('labelsPage.game.title')}
            >
              {t('labelsPage.game.text')}
            </SectionHeading>
            <SortingGame />
          </div>
        </section>

        <div className="pt-20 sm:pt-24">
          <UniversalLabelSection eyebrow={t('labelsPage.everyday')} />
        </div>
      </main>

      <LandingCTA
        isAuthenticated={!!isAuthenticated}
        onOrganizerClick={goToOrganizer}
        onSellerClick={goToSeller}
      />
      <Footer />
    </div>
  );
}

function Marker({ number, className }: { number: number; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-foreground shadow-md ring-4 ring-background ${className}`}
    >
      {number}
    </span>
  );
}
