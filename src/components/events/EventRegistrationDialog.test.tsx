import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '../../lib/api/types';
import { EventRegistrationDialog } from './EventRegistrationDialog';

/** Answers of the queries by function name */
const answers = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../lib/api/react', async () => {
  const { getFunctionName } = await import('../../lib/api/functions');
  return {
    useQuery: (fn: unknown, args: unknown) =>
      args === 'skip' ? undefined : answers.current[getFunctionName(fn)],
    useMutation: () => vi.fn(),
  };
});

const eventId = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e' as Id<'events'>;

function renderDialog(
  features: Record<string, unknown>,
  invitation?: string,
  places: { vendorLimit?: number; sellerCount?: number } = {},
  invitedAsHelper?: boolean
) {
  render(
    <EventRegistrationDialog
      open
      onOpenChange={() => {}}
      eventId={eventId}
      eventTitle="Kinderbasar"
      hasAccessCode={false}
      invitation={invitation}
      invitedAsHelper={invitedAsHelper}
      conditions={{ commission: 10, features, ...places }}
      onSuccess={() => {}}
    />
  );
}

describe('EventRegistrationDialog', () => {
  beforeEach(() => {
    answers.current = {
      'users.viewer': { _id: 'u1' },
      'users.getMissinfProfileData': [],
      'eventExclusions.getMine': null,
    };
  });

  it('says that the registration is closed instead of offering to join', () => {
    renderDialog({ registrationOpen: false });
    expect(screen.getByText('Anmeldung geschlossen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });

  it('names the time the registration opens', () => {
    const opensAt = Date.now() + 86_400_000;
    renderDialog({ registrationStartsAt: opensAt });
    expect(screen.getByText(/^Anmeldung ab /)).toBeVisible();
  });

  it('lets invited people join although the registration is closed', () => {
    renderDialog({ registrationOpen: false }, 'token');
    expect(screen.queryByText('Anmeldung geschlossen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Anmelden bestätigen' })).toBeEnabled();
  });

  it('keeps sellers from elsewhere out of a bazaar for its region (#304)', () => {
    answers.current['users.viewer'] = { _id: 'u1', zipCode: '10115', country: 'DE' };
    renderDialog({ allowedPostalCodes: ['89', '7322'], postalCodeCountry: 'DE' });
    expect(
      screen.getByText(
        'Dieser Basar ist nur für Verkäufer aus seiner Region: Postleitzahl 89…, 7322… (Deutschland).'
      )
    ).toBeVisible();
    expect(screen.getByText('Laut deinem Profil kommst du aus 10115 (Deutschland).')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });

  it('lets sellers from the region and invited people in (#304)', () => {
    answers.current['users.viewer'] = { _id: 'u1', zipCode: '89073', country: 'DE' };
    renderDialog({ allowedPostalCodes: ['89'] });
    expect(screen.getByText('Nur aus PLZ 89…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anmelden bestätigen' })).toBeEnabled();
  });

  it('tells excluded sellers why they cannot join, also with an invitation', () => {
    answers.current['eventExclusions.getMine'] = { excludedAt: 1, reason: 'Nicht abgeholt' };
    renderDialog({}, 'token');
    expect(
      screen.getByText('Der Veranstalter hat dich von diesem Basar ausgeschlossen.')
    ).toBeVisible();
    expect(screen.getByText('Begründung: Nicht abgeholt')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });

  it('shows until when and how many places are left before joining', () => {
    renderDialog({ registrationEndsAt: Date.now() + 86_400_000 }, undefined, {
      vendorLimit: 50,
      sellerCount: 38,
    });
    expect(screen.getByText(/^Anmeldung bis /)).toBeVisible();
    expect(screen.getByText('Noch 12 von 50 Plätzen frei')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anmelden bestätigen' })).toBeEnabled();
  });

  it('says when all places are taken also to people invited as sellers', () => {
    renderDialog({ registrationOpen: false }, 'token', { vendorLimit: 50, sellerCount: 50 });
    expect(screen.getByText('Alle Plätze belegt')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });

  it('lets invited helpers join although all places are taken', () => {
    renderDialog({}, 'token', { vendorLimit: 50, sellerCount: 50 }, true);
    expect(screen.queryByText('Alle Plätze belegt')).toBeNull();
    expect(screen.getByRole('button', { name: 'Anmelden bestätigen' })).toBeEnabled();
  });

  it('lets the team join while the registration is closed and full', () => {
    answers.current['eventRoles.getMyRolesForEvent'] = ['coorganizer'];
    renderDialog({ registrationOpen: false }, undefined, { vendorLimit: 50, sellerCount: 50 });
    expect(screen.queryByText('Anmeldung geschlossen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Anmelden bestätigen' })).toBeEnabled();
  });

  it('says when all places are taken instead of offering to join', () => {
    renderDialog({}, undefined, { vendorLimit: 50, sellerCount: 50 });
    expect(screen.getByText('Alle Plätze belegt')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Anmelden bestätigen' })).toBeNull();
  });
});
