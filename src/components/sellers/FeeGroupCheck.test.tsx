import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useMutation } from '../../lib/api/react';
import { getFunctionName } from '../../lib/api/functions';
import type { Id, VendorWithCalculations } from '../../lib/api/types';
import type { FeeGroup } from '../../shared/feeGroups';
import { FeeGroupCheck } from './FeeGroupCheck';
import { FeeGroupBadge, FeeGroupMenu } from './FeeGroupBadge';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const EVENT = 'evt1' as Id<'events'>;
const groups: FeeGroup[] = [
  {
    id: 'members',
    label: 'Vereinsmitglieder',
    commission: 5,
    assignment: 'selfDeclared',
    proofHint: 'Ausweis zeigen',
  },
  { id: 'helpers', label: 'Helfer', commission: 0, assignment: 'helpers' },
];
const vendor = (feeGroup?: VendorWithCalculations['feeGroup'], paid = false) =>
  ({ _id: 'u1', name: 'Anna', paid, feeGroup }) as unknown as VendorWithCalculations;
const calls: Record<string, ReturnType<typeof vi.fn>> = {};

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  vi.mocked(useMutation).mockImplementation(((fn: unknown) => {
    const name = getFunctionName(fn);
    calls[name] ??= vi.fn().mockResolvedValue(null);
    return calls[name];
  }) as unknown as typeof useMutation);
});

const pending = { id: 'members', label: 'Vereinsmitglieder', pending: true, byRole: false };

describe('FeeGroupCheck', () => {
  it('asks for the proof and confirms the group', async () => {
    render(<FeeGroupCheck eventId={EVENT} seller={vendor(pending)} groups={groups} />);
    expect(screen.getByText('Ermäßigt: Vereinsmitglieder – Nachweis prüfen')).toBeInTheDocument();
    expect(screen.getByText(/Nachweis: Ausweis zeigen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    await waitFor(() =>
      expect(calls['feeGroups.confirmFeeGroup']).toHaveBeenCalledWith({
        eventId: EVENT,
        sellerId: 'u1',
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Vereinsmitglieder bestätigt');
  });

  it('removes the group without proof', async () => {
    const noHint = { ...pending, id: 'other' };
    calls['feeGroups.removeFeeGroup'] = vi.fn().mockRejectedValue(new Error('x'));
    render(<FeeGroupCheck eventId={EVENT} seller={vendor(noHint)} groups={groups} />);
    expect(screen.getByText(/Der Verkäufer hat angegeben/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('is not there for a checked group', () => {
    const { container } = render(
      <FeeGroupCheck
        eventId={EVENT}
        seller={vendor({ ...pending, pending: false })}
        groups={groups}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FeeGroupBadge', () => {
  it('names the group and whether it is still to be checked', () => {
    const { rerender } = render(<FeeGroupBadge group={pending} />);
    expect(screen.getByText('Vereinsmitglieder')).toBeInTheDocument();
    expect(screen.getByText('· prüfen')).toBeInTheDocument();
    rerender(<FeeGroupBadge group={{ ...pending, pending: false }} />);
    expect(screen.queryByText('· prüfen')).not.toBeInTheDocument();
    rerender(<FeeGroupBadge group={undefined} />);
    expect(screen.queryByText('Vereinsmitglieder')).not.toBeInTheDocument();
  });
});

describe('FeeGroupMenu', () => {
  it('puts a seller in a group and takes them out', async () => {
    render(<FeeGroupMenu eventId={EVENT} vendor={vendor()} groups={groups} />);
    const open = () =>
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Gebührengruppe zuordnen' }), {
        button: 0,
        ctrlKey: false,
      });
    open();
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Helfer' }));
    await waitFor(() =>
      expect(calls['feeGroups.assignFeeGroup']).toHaveBeenCalledWith({
        eventId: EVENT,
        sellerId: 'u1',
        groupId: 'helpers',
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Anna: Helfer');
  });

  it('explains a group by role and takes the chosen one out', async () => {
    render(
      <FeeGroupMenu
        eventId={EVENT}
        vendor={vendor({
          id: 'helpers',
          label: 'Helfer',
          pending: false,
          byRole: true,
          chosen: 'members',
        })}
        groups={groups}
        iconOnly
      />
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Gebührengruppe zuordnen' }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByText(/gilt durch die Helferrolle/)).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Vereinsmitglieder' })).toBeChecked();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Keine Gruppe' }));
    await waitFor(() =>
      expect(calls['feeGroups.assignFeeGroup']).toHaveBeenCalledWith({
        eventId: EVENT,
        sellerId: 'u1',
        groupId: null,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Anna: keine Gruppe');
  });

  it('is not offered for paid-out sellers or without groups', () => {
    const { container, rerender } = render(
      <FeeGroupMenu eventId={EVENT} vendor={vendor(undefined, true)} groups={groups} />
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<FeeGroupMenu eventId={EVENT} vendor={vendor()} groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
