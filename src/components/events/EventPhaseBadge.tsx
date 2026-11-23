import { useTranslation } from 'react-i18next';
import { useNowPassing } from '../../hooks/useNowPassing';
import { eventPhase, type EventPeriod } from '../../shared/eventPhase';
import { Badge } from '../ui/badge';

/**
 * "Demnächst", "Läuft gerade" or "Beendet" (#299). Switches at the start and the end
 * without a reload.
 */
export function EventPhaseBadge({ event }: { event: EventPeriod }) {
  const { t } = useTranslation('events');
  const now = useNowPassing([event.startDate, event.endDate + 1]);
  const phase = eventPhase(event, now);
  return (
    <Badge
      variant={phase === 'running' ? 'default' : phase === 'ended' ? 'secondary' : 'outline'}
      data-testid="event-phase"
      data-phase={phase}
    >
      {t(`phase.${phase}`)}
    </Badge>
  );
}
