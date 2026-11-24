import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import { AdminFeaturesPage } from './AdminFeaturesPage';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const update = vi.fn(async () => null);
let flags: unknown[] = [];

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  update.mockClear();
  flags = [
    { key: 'is_login_enabled', value: true, isDefault: true },
    {
      key: 'is_registration_enabled',
      value: false,
      isDefault: false,
      updatedAt: Date.UTC(2026, 10, 20, 9),
      updatedBy: 'Ada Admin',
    },
    { key: 'is_demo_mode', value: false, isDefault: true },
    // A flag of a newer backend this page does not know
    { key: 'is_future_thing', value: true, isDefault: true },
  ];
  vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
    getFunctionName(fn) === 'featureFlags.listForAdmin' ? flags : undefined) as never);
  vi.mocked(useMutation).mockImplementation((() => update) as never);
});

describe('AdminFeaturesPage', () => {
  it('shows the known flags with their state and who changed them', () => {
    render(<AdminFeaturesPage />);
    expect(screen.getByRole('checkbox', { name: 'Anmeldung' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Registrierung' })).not.toBeChecked();
    expect(screen.getByText(/Geändert von Ada Admin/)).toBeInTheDocument();
    expect(screen.getAllByText('Standard')).toHaveLength(2);
    expect(screen.queryByText(/is_future_thing/)).not.toBeInTheDocument();
  });

  it('switches a flag at once', async () => {
    render(<AdminFeaturesPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Registrierung' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ key: 'is_registration_enabled', value: true })
    );
  });

  it('asks before switching off sign-in', async () => {
    render(<AdminFeaturesPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Anmeldung' }));
    expect(await screen.findByText('Anmeldung ausschalten?')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ausschalten' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ key: 'is_login_enabled', value: false })
    );
  });

  it('warns while sign-in is off', () => {
    flags[0] = { key: 'is_login_enabled', value: false, isDefault: false };
    render(<AdminFeaturesPage />);
    expect(screen.getByText(/Die Anmeldung ist ausgeschaltet/)).toBeInTheDocument();
  });
});
