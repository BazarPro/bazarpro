import { describe, expect, it } from 'vitest';
import { addToTime, followEventDates, joinLocal, splitLocal } from './eventDates';

const empty = {
  dropoffStart: '',
  dropoffEnd: '',
  pickupStart: '',
  pickupEnd: '',
  registrationEndsAt: '',
  discountStartsAt: '',
};

describe('event dates', () => {
  it('splits and joins datetime-local values', () => {
    expect(splitLocal('2099-04-18T09:30')).toEqual({ date: '2099-04-18', time: '09:30' });
    expect(splitLocal('')).toEqual({ date: '', time: '' });
    expect(joinLocal('2099-04-18', '')).toBe('');
    expect(joinLocal('2099-04-18', '09:30')).toBe('2099-04-18T09:30');
  });

  it('moves a time within its day', () => {
    expect(addToTime('10:00', 240)).toBe('14:00');
    expect(addToTime('22:30', 240)).toBe('23:59');
    expect(addToTime('00:30', -60)).toBe('00:00');
  });

  it('suggests drop-off and pickup on the day of the bazaar', () => {
    const changes = followEventDates(
      { startDate: '', endDate: '' },
      { startDate: '2099-04-18T10:00', endDate: '2099-04-18T14:00' },
      empty
    );
    expect(changes).toEqual({
      dropoffStart: '2099-04-18T08:00',
      dropoffEnd: '2099-04-18T09:30',
      pickupStart: '2099-04-18T15:00',
      pickupEnd: '2099-04-18T16:00',
    });
  });

  it('moves set dates along and leaves "the whole time" empty', () => {
    const changes = followEventDates(
      { startDate: '2099-04-18T10:00', endDate: '2099-04-18T14:00' },
      { startDate: '2099-04-25T10:00', endDate: '2099-04-25T15:00' },
      {
        ...empty,
        dropoffStart: '2099-04-17T16:00',
        dropoffEnd: '2099-04-17T18:00',
        pickupStart: '2099-04-18T15:00',
        pickupEnd: '2099-04-18T16:00',
        registrationEndsAt: '2099-04-15T20:00',
      }
    );
    expect(changes).toEqual({
      dropoffStart: '2099-04-24T16:00',
      dropoffEnd: '2099-04-24T18:00',
      pickupStart: '2099-04-25T16:00',
      pickupEnd: '2099-04-25T17:00',
      registrationEndsAt: '2099-04-22T20:00',
    });
  });

  it('waits while the bazaar has no valid time', () => {
    expect(
      followEventDates(
        { startDate: '', endDate: '' },
        { startDate: '2099-04-18T10:00', endDate: '2099-04-18T09:00' },
        empty
      )
    ).toBeUndefined();
  });
});
