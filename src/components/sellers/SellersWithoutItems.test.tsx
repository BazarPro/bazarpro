import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useMutation } from '../../lib/api/react';
import type { Id } from '../../lib/api/types';
import { SellersWithoutItems } from './SellersWithoutItems';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const EVENT = 'evt1' as Id<'events'>;
const unregister = vi.fn();

beforeEach(() => {
  unregister.mockReset().mockResolvedValue(2);
  vi.mocked(useMutation).mockReturnValue(unregister as unknown as ReturnType<typeof useMutation>);
});

describe('SellersWithoutItems (#304)', () => {
  it('reminds or unregisters them with a message', async () => {
    const remind = vi.fn();
    render(<SellersWithoutItems eventId={EVENT} count={2} canAct over={false} onRemind={remind} />);
    expect(
      screen.getByText('2 Verkäufer haben noch keine Artikel angemeldet.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Erinnern' }));
    expect(remind).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Alle abmelden' }));
    expect(screen.getByText('2 Verkäufer ohne Artikel abmelden?')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nachricht an sie (optional)'), {
      target: { value: ' Gern beim nächsten Mal ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '2 Verkäufer abmelden' }));
    await waitFor(() =>
      expect(unregister).toHaveBeenCalledWith({ eventId: EVENT, message: 'Gern beim nächsten Mal' })
    );
    expect(toast.success).toHaveBeenCalledWith('2 Verkäufer abgemeldet');
  });

  it('only shows the count to helpers, and nothing to do without such sellers', () => {
    const { rerender } = render(
      <SellersWithoutItems
        eventId={EVENT}
        count={1}
        canAct={false}
        over={false}
        onRemind={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Alle abmelden' })).not.toBeInTheDocument();
    rerender(
      <SellersWithoutItems eventId={EVENT} count={0} canAct over={false} onRemind={vi.fn()} />
    );
    expect(screen.getByText('Alle Verkäufer haben Artikel angemeldet.')).toBeInTheDocument();
  });
});
