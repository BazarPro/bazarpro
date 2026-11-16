import { useEffect, useState, type ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { InfoTip } from '../../../../components/ui/info-tip';
import { joinLocal, splitLocal } from '../../../../lib/eventDates';

interface RangeDraft {
  day: string;
  from: string;
  to: string;
  /** Only when the window ends on another day than it starts */
  toDay: string;
}

function fromValues(start: string, end: string): RangeDraft {
  const from = splitLocal(start);
  const to = splitLocal(end);
  return {
    day: from.date || to.date,
    from: from.time,
    to: to.time,
    toDay: to.date && to.date !== (from.date || to.date) ? to.date : '',
  };
}

function toValues(draft: RangeDraft) {
  return {
    start: joinLocal(draft.day, draft.from),
    end: joinLocal(draft.toDay || draft.day, draft.to),
  };
}

/**
 * A time window such as the drop-off: one day, from and until. The form keeps two
 * datetime-local values; a time typed before the day takes `defaultDay` (the event's).
 */
export function TimeRangeFields({
  id,
  label,
  icon,
  info,
  startName,
  endName,
  defaultDay,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  info?: ReactNode;
  startName: string;
  endName: string;
  defaultDay?: string;
}) {
  const { t } = useTranslation('organizer');
  const { watch, setValue } = useFormContext();
  const start = (watch(startName) as string | undefined) ?? '';
  const end = (watch(endName) as string | undefined) ?? '';
  const [draft, setDraft] = useState(() => fromValues(start, end));

  // Values from outside (the event's date moved, a draft) win over what waits here
  useEffect(() => {
    setDraft((current) => {
      const composed = toValues(current);
      if (composed.start === start && composed.end === end) return current;
      const next = fromValues(start, end);
      // Half-filled rows stay as they are while the form has nothing yet
      if (!start && !end) return { ...next, day: current.day, from: current.from, to: current.to };
      return next;
    });
  }, [start, end]);

  const commit = (next: RangeDraft) => {
    const withDay =
      !next.day && (next.from || next.to) && defaultDay ? { ...next, day: defaultDay } : next;
    setDraft(withDay);
    const values = toValues(withDay);
    if (values.start !== start) setValue(startName, values.start, { shouldDirty: true });
    if (values.end !== end) setValue(endName, values.end, { shouldDirty: true });
  };
  const empty = !draft.day && !draft.from && !draft.to;

  return (
    <fieldset className="space-y-2">
      <legend className="flex w-full items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
        {info && <InfoTip>{info}</InfoTip>}
        {!empty && (
          <button
            type="button"
            onClick={() => commit({ day: '', from: '', to: '', toDay: '' })}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            {t('logistics.clear')}
          </button>
        )}
      </legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="col-span-2 space-y-1.5 sm:col-span-1">
          <Label htmlFor={`${id}Day`} className="text-xs text-muted-foreground">
            {t('logistics.day')}
          </Label>
          <Input
            id={`${id}Day`}
            type="date"
            value={draft.day}
            onChange={(e) => commit({ ...draft, day: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}From`} className="text-xs text-muted-foreground">
            {t('logistics.from')}
          </Label>
          <Input
            id={`${id}From`}
            type="time"
            value={draft.from}
            onChange={(e) => commit({ ...draft, from: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}To`} className="text-xs text-muted-foreground">
            {t('logistics.until')}
          </Label>
          <Input
            id={`${id}To`}
            type="time"
            value={draft.to}
            onChange={(e) => commit({ ...draft, to: e.target.value })}
          />
        </div>
        {draft.toDay && (
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor={`${id}ToDay`} className="text-xs text-muted-foreground">
              {t('logistics.untilDay')}
            </Label>
            <Input
              id={`${id}ToDay`}
              type="date"
              value={draft.toDay}
              onChange={(e) => commit({ ...draft, toDay: e.target.value })}
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}
