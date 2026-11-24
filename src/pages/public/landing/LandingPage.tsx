import { usePublicQuery } from '../../../hooks/usePublicQuery';
import { useMemo, useState } from 'react';
import { api } from '../../../lib/api/functions';
import { Footer } from '../../../components/layout/Footer';
import { Seo } from '../../../components/seo/Seo';
import { organization, softwareApplication } from '../../../lib/structuredData';
import { useStartActions } from '../company/components/useStartActions';
import { LandingCTA } from './components/LandingCTA';
import { LandingEventsSection } from './components/LandingEventsSection';
import { LandingFeatures } from './components/LandingFeatures';
import { LandingHero } from './components/LandingHero';
import { LandingKinds } from './components/LandingKinds';
import { LandingProcess } from './components/LandingProcess';
import './landing.css';
import { useTranslation } from 'react-i18next';

export function LandingPage() {
  const [includePast, setIncludePast] = useState(false);
  const publicEvents = usePublicQuery(api.events.get, { includePast });
  const { t } = useTranslation('landing');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the texts follow the language, and t changes with it
  const jsonLd = useMemo(() => [softwareApplication(), organization()], [t]);

  const { isAuthenticated, goToOrganizer, goToSeller } = useStartActions();

  return (
    <div className="min-h-screen overflow-x-clip bg-background selection:bg-primary selection:text-primary-foreground">
      <Seo
        title={t('seo.title')}
        description={t('seo.description')}
        canonical="/"
        jsonLd={jsonLd}
      />

      <LandingHero
        isAuthenticated={!!isAuthenticated}
        onOrganizerClick={goToOrganizer}
        onSellerClick={goToSeller}
        onFindClick={() => {
          // The focus moves along, so keyboard and screen reader users land there too
          const section = document.getElementById('events-section');
          const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          section?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
          section?.focus({ preventScroll: true });
        }}
      />

      <LandingProcess />

      <LandingKinds />

      <div id="events-section" tabIndex={-1} className="scroll-mt-16 outline-none">
        <LandingEventsSection
          events={publicEvents}
          includePast={includePast}
          onIncludePastChange={setIncludePast}
          onCreateEventClick={goToOrganizer}
        />
      </div>

      <LandingFeatures />

      <LandingCTA
        isAuthenticated={!!isAuthenticated}
        onOrganizerClick={goToOrganizer}
        onSellerClick={goToSeller}
      />

      <Footer />
    </div>
  );
}
