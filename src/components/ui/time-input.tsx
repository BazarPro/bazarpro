import * as React from 'react';
import { Input } from './input';

/** "9" → 09:00, "930" → 09:30, "1745" → 17:45, "17:5" → 17:05; null when not a time */
function parseTime(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let hours: string;
  let minutes: string;
  const parts = trimmed.split(/[:.,\s]/);
  if (parts.length === 2) {
    [hours, minutes] = parts;
  } else if (parts.length === 1 && /^\d{1,4}$/.test(trimmed)) {
    hours = trimmed.length <= 2 ? trimmed : trimmed.slice(0, trimmed.length - 2);
    minutes = trimmed.length <= 2 ? '0' : trimmed.slice(-2);
  } else {
    return null;
  }
  if (!/^\d{1,2}$/.test(hours) || !/^\d{0,2}$/.test(minutes)) return null;
  const h = Number(hours);
  const m = Number(minutes || '0');
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type TimeInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** HH:MM (24 hours) or '' */
  value: string;
  onChange: (value: string) => void;
};

/**
 * A time in 24 hours, independent of the browser's language: the native time field shows
 * AM/PM in English browsers, though the app writes times as "17:30 Uhr".
 * Accepts "17:30", "1730", "17.30" or "9"; complete entries count right away, the rest on blur.
 */
export function TimeInput({ value, onChange, onBlur, ...props }: TimeInputProps) {
  const [text, setText] = React.useState(value);

  // A value from outside (the day moved the times) replaces what is typed here
  React.useEffect(() => {
    setText((current) => (parseTime(current) === value ? current : value));
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? 'hh:mm'}
      maxLength={5}
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d:.,]/g, '');
        setText(next);
        if (!next) onChange('');
        else if (/^\d{1,2}[:.,]\d{2}$/.test(next) || /^\d{4}$/.test(next)) {
          const parsed = parseTime(next);
          if (parsed && parsed !== value) onChange(parsed);
        }
      }}
      onBlur={(e) => {
        const parsed = parseTime(text);
        if (parsed) {
          setText(parsed);
          if (parsed !== value) onChange(parsed);
        } else if (text.trim()) {
          setText(value);
        }
        onBlur?.(e);
      }}
    />
  );
}
