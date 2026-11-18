/*
 * Dates of the event form as the inputs hold them: local "YYYY-MM-DDTHH:mm" strings
 * (datetime-local), or a date and a time apart. Empty strings stand for "not set".
 */

const MINUTE = 60_000;

/** The event's times when only its day is picked. */
export const DEFAULT_START_TIME = '10:00';
export const DEFAULT_DURATION_MINUTES = 4 * 60;

/** A timestamp as datetime-local value in the browser's time zone. */
export function toLocalValue(timestamp: number): string {
  const date = new Date(timestamp);
  const local = new Date(timestamp - date.getTimezoneOffset() * MINUTE);
  return local.toISOString().slice(0, 16);
}

/** The timestamp of a datetime-local value; NaN when empty or invalid. */
export function localTime(value: string | undefined): number {
  return value ? new Date(value).getTime() : NaN;
}

export function splitLocal(value: string | undefined): { date: string; time: string } {
  if (!value || Number.isNaN(localTime(value))) return { date: '', time: '' };
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}

/** Day and time as one value; empty while one of them is missing. */
export function joinLocal(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

/** A time of day moved by minutes, held within the day ("23:30" + 60 → "23:59"). */
export function addToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.min(Math.max(hours * 60 + mins + minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function shifted(value: string, delta: number): string {
  const time = localTime(value);
  return Number.isNaN(time) ? value : toLocalValue(time + delta);
}

export interface EventTimes {
  startDate: string;
  endDate: string;
}

/** The dates around the event that move along with it. */
export interface FollowingDates {
  dropoffStart: string;
  dropoffEnd: string;
  pickupStart: string;
  pickupEnd: string;
  registrationEndsAt: string;
  discountStartsAt: string;
}

/**
 * When the event's time changes, the dates that depend on it follow: set ones keep their
 * distance to the start (drop-off, end of registration) or the end (pickup, discounts); empty
 * drop-off and pickup times get a suggestion on the same day, so only the hours are left
 * to adjust. Registration and discount start stay empty: empty means "the whole time".
 * Returns only the values that change; undefined while the event's time is incomplete, so
 * the caller keeps comparing with the last complete one.
 */
export function followEventDates(
  previous: EventTimes,
  next: EventTimes,
  dates: FollowingDates
): Partial<FollowingDates> | undefined {
  const start = localTime(next.startDate);
  const end = localTime(next.endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return undefined;
  const previousStart = localTime(previous.startDate);
  const previousEnd = localTime(previous.endDate);
  const startDelta = Number.isNaN(previousStart) ? undefined : start - previousStart;
  const endDelta = Number.isNaN(previousEnd) ? undefined : end - previousEnd;

  const changes: Partial<FollowingDates> = {};
  const follow = (key: keyof FollowingDates, delta: number | undefined, suggestion?: number) => {
    const current = dates[key];
    let value: string | undefined;
    if (!current) {
      value = suggestion === undefined ? undefined : toLocalValue(suggestion);
    } else if (delta) {
      value = shifted(current, delta);
    }
    if (value !== undefined && value !== current) changes[key] = value;
  };

  // Drop-off shortly before the start, pickup after the end, the same day
  const dayStart = new Date(start).setHours(0, 0, 0, 0);
  const dayEnd = new Date(end).setHours(23, 59, 0, 0);
  follow('dropoffStart', startDelta, Math.max(start - 120 * MINUTE, dayStart));
  follow('dropoffEnd', startDelta, Math.max(start - 30 * MINUTE, dayStart));
  follow('pickupStart', endDelta, Math.min(end + 60 * MINUTE, dayEnd));
  follow('pickupEnd', endDelta, Math.min(end + 120 * MINUTE, dayEnd));
  follow('registrationEndsAt', startDelta);
  follow('discountStartsAt', endDelta);
  return changes;
}
