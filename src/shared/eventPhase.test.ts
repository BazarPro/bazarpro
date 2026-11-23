import { describe, expect, it } from 'vitest';
import { eventPhase, isEventOver, isEventRunning } from './eventPhase';

// Saturday, 18 April 2099, 10:00 to 14:00 Berlin time (summer time, UTC+2)
const event = {
  startDate: Date.UTC(2099, 3, 18, 8, 0),
  endDate: Date.UTC(2099, 3, 18, 12, 0),
};

describe('eventPhase', () => {
  it('is upcoming before the start', () => {
    expect(eventPhase(event, event.startDate - 1)).toBe('upcoming');
    expect(isEventRunning(event, event.startDate - 1)).toBe(false);
  });

  it('runs from the start to the end, both included', () => {
    expect(eventPhase(event, event.startDate)).toBe('running');
    expect(eventPhase(event, event.startDate + 60_000)).toBe('running');
    expect(eventPhase(event, event.endDate)).toBe('running');
    expect(isEventRunning(event, event.endDate)).toBe(true);
  });

  it('is over right after the end and stays so', () => {
    expect(eventPhase(event, event.endDate + 1)).toBe('ended');
    expect(eventPhase(event, event.endDate + 365 * 24 * 3600_000)).toBe('ended');
    expect(isEventOver(event, event.endDate + 1)).toBe(true);
  });

  it('does not depend on the time zone: midnight in Berlin is still the evening in UTC', () => {
    // 23:00 to 00:30 Berlin time crosses the day in Berlin, not in UTC
    const late = {
      startDate: Date.UTC(2099, 3, 18, 21, 0),
      endDate: Date.UTC(2099, 3, 18, 22, 30),
    };
    const berlinMidnight = Date.UTC(2099, 3, 18, 22, 0);
    expect(eventPhase(late, berlinMidnight)).toBe('running');
    expect(eventPhase(late, Date.UTC(2099, 3, 18, 22, 31))).toBe('ended');
  });
});
