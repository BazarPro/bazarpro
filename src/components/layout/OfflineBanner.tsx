import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { isOfflineAvailable, useDisconnected } from '../../lib/offlineMode';
import { OfflineNotice } from './OfflineNotice';

/**
 * Says that the app shows the last loaded state while the connection is gone. The cash
 * desk shows its own, more detailed note.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const disconnected = useDisconnected();
  const { pathname } = useLocation();
  if (!disconnected || !isOfflineAvailable() || pathname.endsWith('/checkout')) return null;
  return <OfflineNotice title={t('offlineBanner')} details={t('offlineBannerDetails')} />;
}
