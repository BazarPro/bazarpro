import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useApiClient } from '../../lib/api/react';
import { cn } from '../../lib/utils';

/**
 * "Neu verbinden" while offline: connects at once instead of after the backoff (up to
 * 30 s). Once connected, the waiting queues of intake and cash desk are sent on their own.
 * On phones only its icon shows.
 */
export function ReconnectButton({
  className,
  tabIndex,
}: {
  className?: string;
  tabIndex?: number;
}) {
  const { t } = useTranslation();
  const client = useApiClient();
  const [connecting, setConnecting] = useState(false);

  const reconnect = async () => {
    setConnecting(true);
    try {
      if (!(await client.reconnectNow())) toast.error(t('reconnectFailed'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <button
      type="button"
      tabIndex={tabIndex}
      disabled={connecting}
      onClick={() => void reconnect()}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        className
      )}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', connecting && 'animate-spin')} />
      <span className="sr-only sm:not-sr-only">{t('reconnect')}</span>
    </button>
  );
}
