import { describe, expect, it } from 'vitest';
import { describeRegistration, spotsLeft } from './registrationText';
import type { Id } from '../../lib/api/types';

const HOUR = 3_600_000;
const now = Date.UTC(2026, 2, 14, 10);

describe('describeRegistration', () => {
  it('names the end of the registration and the places left while it is open', () => {
    const info = describeRegistration(
      { features: { registrationEndsAt: now + HOUR }, vendorLimit: 20, sellerCount: 19 },
      now
    );
    expect(info.blocked).toBeUndefined();
    expect(info.until).toMatch(/^Anmeldung bis /);
    expect(info.spots).toBe('Nur noch ein Platz von 20 frei');
  });

  it('says nothing extra without an end or a limit', () => {
    expect(describeRegistration({}, now)).toEqual({ until: undefined, spots: undefined });
  });

  it('is blocked when all places are taken; an invitation does not make room', () => {
    const info = describeRegistration({ vendorLimit: 20, sellerCount: 21 }, now);
    expect(info).toEqual({ blocked: 'Alle Plätze belegt' });
  });

  it('is blocked while closed; an invitation still lets people in', () => {
    const info = describeRegistration({ features: { registrationOpen: false } }, now);
    expect(info).toEqual({ blocked: 'Anmeldung geschlossen', invitationHelps: true });
  });
});

describe('describeRegistration with an admission', () => {
  const closedAndFull = {
    features: { registrationOpen: false },
    vendorLimit: 20,
    sellerCount: 20,
  };

  it('lets the team and invited helpers past everything', () => {
    expect(describeRegistration(closedAndFull, now, 'team')).toEqual({});
    expect(describeRegistration(closedAndFull, now, 'helperInvitation')).toEqual({});
  });

  it('lets invited sellers past a closed registration, not past the limit', () => {
    expect(describeRegistration(closedAndFull, now, 'invitation')).toEqual({
      blocked: 'Alle Plätze belegt',
    });
    const room = describeRegistration({ ...closedAndFull, sellerCount: 19 }, now, 'invitation');
    expect(room.blocked).toBeUndefined();
    expect(room.spots).toBe('Nur noch ein Platz von 20 frei');
  });
});

describe('describeRegistration of a bazaar for its region (#304)', () => {
  const regional = { features: { allowedPostalCodes: { DE: ['89', '7322'] } } };

  it('names the postal codes, except for invited people', () => {
    expect(describeRegistration(regional, now).region).toBe('Nur aus PLZ 89…, 7322…');
    expect(describeRegistration(regional, now, 'invitation').region).toBeUndefined();
    expect(describeRegistration({ features: {} }, now).region).toBeUndefined();
    const border = { features: { allowedPostalCodes: { DE: ['88'], AT: ['69'] } } };
    expect(describeRegistration(border, now).region).toBe('Nur aus PLZ 88… (DE), 69… (AT)');
  });

  it('keeps it short where a map shows the region, with the codes for its caption', () => {
    const mapped = { ...regional, regionMapImage: 'f1' as Id<'_storage'> };
    expect(describeRegistration(mapped, now)).toMatchObject({
      region: 'Nur aus der Region',
      regionCodes: 'Nur aus PLZ 89…, 7322…',
    });
    expect(describeRegistration(regional, now).regionCodes).toBeUndefined();
  });
});

describe('spotsLeft', () => {
  it('counts only with a limit and the number of sellers', () => {
    expect(spotsLeft({ vendorLimit: 10, sellerCount: 4 })).toBe(6);
    expect(spotsLeft({ vendorLimit: 10 })).toBeUndefined();
    expect(spotsLeft({ sellerCount: 4 })).toBeUndefined();
  });
});
