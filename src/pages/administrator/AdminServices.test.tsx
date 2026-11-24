import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import { AdminServices } from './AdminServices';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const calls: { name: string; args: unknown }[] = [];
const services = [
  { name: 'Parkplatz', nameEn: 'Parking', activeEvents: 2, pastEvents: 1 },
  { name: 'Getränke', nameEn: 'Drinks', activeEvents: 0, pastEvents: 3 },
  { name: 'Hüpfburg', activeEvents: 0, pastEvents: 0 },
];

beforeEach(() => {
  calls.length = 0;
  vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
    getFunctionName(fn) === 'services.listForAdmin' ? services : undefined) as never);
  vi.mocked(useMutation).mockImplementation(((fn: unknown) => async (args: unknown) => {
    calls.push({ name: getFunctionName(fn as never), args });
    return null;
  }) as never);
});

describe('AdminServices', () => {
  it('lists the services with the bazaars that offer them', () => {
    render(<AdminServices />);
    const parking = screen.getByTestId('service-Parkplatz');
    expect(parking).toHaveTextContent('Parking');
    expect(parking).toHaveTextContent('2 kommende Basare · 1 vergangener');
    expect(screen.getByTestId('service-Hüpfburg')).toHaveTextContent('Nicht verwendet');
    // Offered by upcoming bazaars: cannot be deleted
    expect(screen.getByRole('button', { name: 'Löschen: Parkplatz' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Löschen: Hüpfburg' })).toBeEnabled();
    // The first cannot go up, the last not down
    expect(screen.getByRole('button', { name: 'Nach oben: Parkplatz' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nach unten: Hüpfburg' })).toBeDisabled();
  });

  it('moves a service', () => {
    render(<AdminServices />);
    fireEvent.click(screen.getByRole('button', { name: 'Nach oben: Getränke' }));
    expect(calls).toEqual([{ name: 'services.move', args: { name: 'Getränke', up: true } }]);
  });

  it('renames a service and says its bazaars get the new name', async () => {
    render(<AdminServices />);
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten: Getränke' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Getränke & Kuchen' } });
    expect(
      screen.getByText('3 Basare bieten diesen Service an und bekommen den neuen Namen.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(calls).toEqual([
        {
          name: 'services.save',
          args: { original: 'Getränke', name: 'Getränke & Kuchen', nameEn: 'Drinks' },
        },
      ])
    );
  });

  it('warns that past bazaars lose a deleted service', async () => {
    render(<AdminServices />);
    fireEvent.click(screen.getByRole('button', { name: 'Löschen: Getränke' }));
    expect(screen.getByText(/3 vergangene Basare verlieren ihn/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(calls).toEqual([{ name: 'services.delete', args: { name: 'Getränke' } }])
    );
  });
});
