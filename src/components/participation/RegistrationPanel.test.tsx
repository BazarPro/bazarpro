import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, Id } from '../../lib/api/types';
import { RegistrationPanel } from './RegistrationPanel';

const setRegistrationOpen = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api/react', () => ({ useMutation: () => setRegistrationOpen }));

const HOUR = 3_600_000;
const eventId = '0199f2a4-7c1e-7b3a-9d2e-5f6a7b8c9d0e' as Id<'events'>;

function renderPanel(event: Partial<Doc<'events'>> = {}, canSwitch = true) {
  render(
    <MemoryRouter>
      <RegistrationPanel
        canSwitch={canSwitch}
        event={{ _id: eventId, visibility: 'public', endDate: Date.now() + 24 * HOUR, ...event }}
      />
    </MemoryRouter>
  );
}

describe('registration on the sellers page', () => {
  beforeEach(() => setRegistrationOpen.mockReset().mockResolvedValue(null));

  it('shows the places taken out of the limit', () => {
    renderPanel({ vendorLimit: 50, sellerCount: 30 });
    expect(screen.getByText('30')).toBeVisible();
    expect(screen.getByText('/ 50')).toBeVisible();
    expect(screen.getByText('Noch 20 Plätze frei')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  });

  it('says when all places are taken', () => {
    renderPanel({ vendorLimit: 50, sellerCount: 50 });
    expect(screen.getByText('Voll belegt')).toBeVisible();
    expect(screen.getByText('Alle Plätze belegt')).toBeVisible();
  });

  it('shows the access code sellers need', () => {
    renderPanel({ accessCode: 'SKI2026', visibility: 'approved' });
    expect(screen.getByText('SKI2026')).toBeVisible();
    expect(screen.getByText('Verkäufer brauchen diesen Code zum Anmelden')).toBeVisible();
    expect(screen.getByText('Nur mit Link und Zugangscode')).toBeVisible();
  });

  it('lets the organizer close and open the registration', async () => {
    renderPanel({ features: { registrationEndsAt: Date.now() + HOUR } });
    expect(screen.getByText('Offen')).toBeVisible();
    expect(screen.getByText(/^Bis /)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Anmeldung schließen' }));
    await waitFor(() => expect(setRegistrationOpen).toHaveBeenCalledWith({ eventId, open: false }));
  });

  it('offers to open a closed registration, not to helpers', () => {
    renderPanel({ features: { registrationOpen: false } });
    expect(screen.getByText('Geschlossen')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anmeldung öffnen' })).toBeVisible();

    renderPanel({ features: { registrationOpen: false } }, false);
    expect(screen.getAllByRole('button', { name: 'Anmeldung öffnen' })).toHaveLength(1);
  });

  it('is gone once the bazaar is over', () => {
    renderPanel({ endDate: Date.now() - HOUR });
    expect(screen.queryByTestId('registration-panel')).toBeNull();
  });
});
