import { CalendarX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';

/** A bazaar of the organizer's pages that does not exist (any more): the way back to all bazaars. */
export function EventNotFound() {
  const { t } = useTranslation('organizer');
  return (
    <div className="page-narrow py-10">
      <h1 className="sr-only">{t('dashboard.notFound')}</h1>
      <EmptyState icon={CalendarX} title={t('dashboard.notFound')}>
        <Button asChild>
          <Link to="/my-events">{t('menu.allBazaars', { ns: 'common' })}</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
