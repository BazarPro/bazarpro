/**
 * Where a bazaar stands in time, derived from its start and end (#299). One rule for
 * every page, so a bazaar that is over never reads as "running". Both bounds count as
 * running: a bazaar from 10:00 to 14:00 runs at 10:00 and at 14:00, and is over at 14:00:00.001.
 * Timestamps are absolute (UTC milliseconds), so the time zone of the viewer plays no part.
 */
export type EventPhase = 'upcoming' | 'running' | 'ended';

export interface EventPeriod {
  startDate: number;
  endDate: number;
}

export function eventPhase(event: EventPeriod, now: number = Date.now()): EventPhase {
  if (now < event.startDate) return 'upcoming';
  if (now > event.endDate) return 'ended';
  return 'running';
}

export const isEventRunning = (event: EventPeriod, now?: number) =>
  eventPhase(event, now) === 'running';

export const isEventOver = (event: EventPeriod, now?: number) => eventPhase(event, now) === 'ended';
