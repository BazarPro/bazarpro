import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useMutation, useQuery } from '../../lib/api/react';
import type { Id, MyFeeGroup as MyGroup } from '../../lib/api/types';
import { describeFeeGroups, type SellerConditionsEvent } from '../../lib/sellerFees';
import { FeeGroupChoice, FeeGroupList, MyFeeGroup } from './FeeGroups';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const EVENT = 'evt1' as Id<'events'>;
const event: SellerConditionsEvent = {
  commission: 10,
  features: {
    intakeFee: 1,
    feeGroups: [
      {
        id: 'members',
        label: 'Vereinsmitglieder',
        commission: 5,
        assignment: 'selfDeclared',
        proofHint: 'Ausweis zeigen',
      },
      { id: 'helpers', label: 'Helfer', commission: 0, assignment: 'helpers' },
    ],
  },
};
const choose = vi.fn();
let mine: MyGroup | null | undefined;

beforeEach(() => {
  choose.mockReset().mockResolvedValue(null);
  vi.mocked(useMutation).mockReturnValue(choose as unknown as ReturnType<typeof useMutation>);
  vi.mocked(useQuery).mockImplementation((() => mine) as unknown as typeof useQuery);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe('FeeGroupList', () => {
  it('lists every group with its fees and how to get in', () => {
    render(<FeeGroupList groups={describeFeeGroups(event)} />);
    expect(screen.getByText('Eigene Gebühren für')).toBeInTheDocument();
    expect(screen.getByText('Nachweis bei der Abgabe: Ausweis zeigen')).toBeInTheDocument();
    expect(screen.getByText('Gilt für Helfer des Basars')).toBeInTheDocument();
  });

  it('shows nothing without groups', () => {
    const { container } = render(<FeeGroupList groups={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FeeGroupChoice', () => {
  it('offers only the self-declared groups and no group', () => {
    const onChange = vi.fn();
    render(<FeeGroupChoice event={event} value={null} onChange={onChange} />);
    expect(screen.getByLabelText(/Nein, ich zahle die normalen Gebühren/)).toBeChecked();
    expect(screen.queryByLabelText(/Helfer/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Vereinsmitglieder/));
    expect(onChange).toHaveBeenCalledWith('members');
  });

  it('goes back to no group', () => {
    const onChange = vi.fn();
    render(<FeeGroupChoice event={event} value="members" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Nein, ich zahle/));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('is not there without self-declared groups', () => {
    const helpersOnly = {
      ...event,
      features: { feeGroups: [event.features!.feeGroups![1]] },
    };
    const { container } = render(
      <FeeGroupChoice event={helpersOnly} value={null} onChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MyFeeGroup', () => {
  it('shows a group still to be checked and changes it', async () => {
    mine = { chosen: 'members', applied: 'members', pending: true, locked: false };
    render(<MyFeeGroup eventId={EVENT} event={event} />);
    expect(screen.getByText('Deine Gruppe: Vereinsmitglieder')).toBeInTheDocument();
    expect(screen.getByText('Das Team prüft deine Angabe bei der Abgabe.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ändern' }));
    fireEvent.click(screen.getByLabelText(/Nein, ich zahle/));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(choose).toHaveBeenCalledWith({ eventId: EVENT, groupId: null }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Gespeichert'));
  });

  it('reports when the choice is refused', async () => {
    mine = { pending: false, locked: false };
    choose.mockRejectedValue(new Error('nope'));
    render(<MyFeeGroup eventId={EVENT} event={event} />);
    expect(screen.getByText('Du zahlst die normalen Gebühren.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gruppe angeben' }));
    fireEvent.click(screen.getByLabelText(/Vereinsmitglieder/));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('only names the team once the group is fixed', () => {
    mine = { chosen: 'members', applied: 'members', pending: false, locked: true, decidedAt: 1 };
    render(<MyFeeGroup eventId={EVENT} event={event} />);
    expect(screen.getByText('Vom Team bestätigt.')).toBeInTheDocument();
    expect(screen.getByText('Für eine Änderung sprich bitte das Team an.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows nothing to sellers outside the bazaar', () => {
    mine = null;
    const { container } = render(<MyFeeGroup eventId={EVENT} event={event} />);
    expect(container).toBeEmptyDOMElement();
  });
});
