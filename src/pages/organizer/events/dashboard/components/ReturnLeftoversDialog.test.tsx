import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useMutation } from '../../../../../lib/api/react';
import type { Id } from '../../../../../lib/api/types';
import type { ProductWithStatus } from './inventoryTypes';
import { ReturnLeftoversDialog } from './ReturnLeftoversDialog';
import { leftoversOf } from './leftovers';

vi.mock('../../../../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const EVENT = 'evt1' as Id<'events'>;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2027, 3, 10, 18);
const returnLeftovers = vi.fn();

const item = (id: string, vendor: string, status: string) =>
  ({ _id: id, vendorId: vendor, status, title: id }) as unknown as ProductWithStatus;

const PRODUCTS = [
  item('rad', 'anna', 'available'),
  item('helm', 'anna', 'available'),
  item('schloss', 'ben', 'available'),
  item('ski', 'ben', 'sold'),
  item('mütze', 'cleo', 'announced'),
  // Cleo is paid out: her settlement is done
  item('jacke', 'cleo', 'available'),
];
const isPaid = (id: Id<'users'>) => id === 'cleo';

beforeEach(() => {
  returnLeftovers.mockReset().mockResolvedValue({ returnedCount: 3, sellerCount: 2 });
  vi.mocked(useMutation).mockReturnValue(
    returnLeftovers as unknown as ReturnType<typeof useMutation>
  );
});

describe('leftoversOf (#305)', () => {
  it('takes what is still available of sellers not paid out, once the bazaar is over', () => {
    const ids = leftoversOf(PRODUCTS, isPaid, NOW - HOUR, NOW).map((p) => p._id);
    expect(ids).toEqual(['rad', 'helm', 'schloss']);
  });

  it('has nothing before the end, after the settlement or without data', () => {
    expect(leftoversOf(PRODUCTS, isPaid, NOW + HOUR, NOW)).toEqual([]);
    expect(leftoversOf(PRODUCTS, isPaid, NOW - 91 * DAY, NOW)).toEqual([]);
    expect(leftoversOf(undefined, isPaid, NOW - HOUR, NOW)).toEqual([]);
    expect(leftoversOf(PRODUCTS, isPaid, undefined, NOW)).toEqual([]);
  });
});

describe('ReturnLeftoversDialog (#305)', () => {
  const leftovers = leftoversOf(PRODUCTS, isPaid, NOW - HOUR, NOW);

  it('asks and returns exactly the items shown', async () => {
    const onOpenChange = vi.fn();
    render(
      <ReturnLeftoversDialog
        eventId={EVENT}
        leftovers={leftovers}
        undoEnabled
        open
        onOpenChange={onOpenChange}
      />
    );
    expect(screen.getByText('3 übrige Artikel als zurückgegeben markieren?')).toBeInTheDocument();
    expect(screen.getByText(/geht zurück an 2 Verkäufern/)).toBeInTheDocument();
    expect(screen.getByText(/rückgängig machen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zurückgeben' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(returnLeftovers).toHaveBeenCalledWith({
      eventId: EVENT,
      productIds: ['rad', 'helm', 'schloss'],
    });
    expect(toast.success).toHaveBeenCalledWith('3 Artikel zurückgegeben');
  });

  it('stays open and shows the error when it fails', async () => {
    returnLeftovers.mockRejectedValue(new Error('leftovers.notOver'));
    const onOpenChange = vi.fn();
    render(
      <ReturnLeftoversDialog
        eventId={EVENT}
        leftovers={leftovers}
        undoEnabled={false}
        open
        onOpenChange={onOpenChange}
      />
    );
    expect(screen.queryByText(/rückgängig machen/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zurückgeben' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
