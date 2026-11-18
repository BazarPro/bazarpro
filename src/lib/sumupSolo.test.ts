import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id, SumUpReader, SumUpReaderPayment } from './api/types';
import { useSumUpSolo } from './sumupSolo';

/** The backend in front of SumUp: the organizer's Solos and the payments on them */
const server = vi.hoisted(() => ({
  connection: { oauth: true, connected: true, mine: true } as Record<string, unknown>,
  readers: [] as SumUpReader[],
  /** Answers of `checkout/status`, one per question; the last one repeats */
  statuses: [] as (SumUpReaderPayment | Error)[],
  checkoutError: null as Error | null,
  calls: [] as [string, Record<string, unknown>][],
}));
const client = vi.hoisted(() => ({
  sumUpSolo: vi.fn(async (path: string, body: Record<string, unknown>) => {
    server.calls.push([path, body]);
    switch (path) {
      case 'readers':
        return { readers: server.readers, mayPair: true };
      case 'readers/pair': {
        const reader: SumUpReader = {
          id: 'rdr_new',
          name: String(body.name ?? 'Solo'),
          status: 'paired',
        };
        server.readers = [...server.readers, reader];
        return reader;
      }
      case 'checkout':
        if (server.checkoutError) throw server.checkoutError;
        return { checkoutId: 'co_1', clientTransactionId: 'ctx-1' };
      case 'checkout/status': {
        const next = server.statuses.length > 1 ? server.statuses.shift()! : server.statuses[0];
        if (next instanceof Error) throw next;
        return next;
      }
      default:
        return { success: true };
    }
  }),
}));
vi.mock('./api/react', () => ({
  useApiClient: () => client,
  useOptionalQuery: (_query: unknown, args: unknown) =>
    args === 'skip' ? undefined : server.connection,
  useMutation: () => vi.fn(),
}));

const EVENT = 'event1' as Id<'events'>;
const SOLO: SumUpReader = { id: 'rdr_1', name: 'Kasse 1', status: 'paired', online: true };

describe('useSumUpSolo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    server.connection = { oauth: true, connected: true, mine: true };
    server.readers = [SOLO];
    server.statuses = [{ status: 'pending' }];
    server.checkoutError = null;
    server.calls = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks nothing while the event takes no cards or SumUp is not connected', () => {
    const { result } = renderHook(() => useSumUpSolo(false, EVENT));
    expect(result.current.oauth).toBe(false);
    server.connection = { oauth: true, connected: false, mine: true };
    const { result: unconnected } = renderHook(() => useSumUpSolo(true, EVENT));
    expect(unconnected.current.oauth).toBe(true);
    expect(unconnected.current.mayConnect).toBe(true);
    expect(unconnected.current.ready).toBe(false);
    expect(client.sumUpSolo).not.toHaveBeenCalled();
  });

  it('charges the only Solo without asking, and the chosen one of several', async () => {
    const { result, unmount } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.reader?.id).toBe('rdr_1');
    unmount();

    server.readers = [SOLO, { id: 'rdr_2', name: 'Kasse 2', status: 'paired' }];
    const { result: several } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(several.current.readers).toHaveLength(2));
    expect(several.current.ready).toBe(false);
    act(() => several.current.choose('rdr_2'));
    expect(several.current.reader?.id).toBe('rdr_2');
    // Kept on the device for the next buyer
    const { result: again } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(again.current.reader?.id).toBe('rdr_2'));
  });

  it('sends the total in cents and waits until the Solo has the money', async () => {
    const { result } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    server.statuses = [
      { status: 'pending' },
      new TypeError('Failed to fetch'),
      { status: 'successful' },
      { status: 'successful', transactionCode: 'TCODE77', lastFour: '4242' },
    ];
    let outcome;
    await act(async () => {
      const charging = result.current.charge({ total: 12.5, foreignTransactionId: 'sale-1' });
      await vi.advanceTimersByTimeAsync(10_000);
      outcome = await charging;
    });
    expect(outcome).toEqual({
      status: 'successful',
      transactionCode: 'TCODE77',
      cardType: undefined,
      lastFour: '4242',
    });
    expect(server.calls.find(([path]) => path === 'checkout')?.[1]).toEqual({
      eventId: EVENT,
      readerId: 'rdr_1',
      amountCents: 1250,
      deskSaleId: 'sale-1',
    });
    expect(server.calls.filter(([path]) => path === 'checkout/status')[0][1]).toEqual({
      eventId: EVENT,
      readerId: 'rdr_1',
      checkoutId: 'co_1',
      clientTransactionId: 'ctx-1',
    });
  });

  it('stops a payment on the Solo, which then ends as cancelled', async () => {
    const { result } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    let charging!: Promise<unknown>;
    act(() => {
      charging = result.current.charge({ total: 9, foreignTransactionId: 'sale-2' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.paying).toBe(true);
    await act(async () => {
      await result.current.cancel();
    });
    expect(server.calls.at(-1)).toEqual(['checkout/cancel', { eventId: EVENT, readerId: 'rdr_1' }]);
    server.statuses = [{ status: 'cancelled' }];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await charging).toEqual({ status: 'failed', code: 'cancelled' });
    expect(result.current.paying).toBe(false);
  });

  it('is unclear when no outcome comes in time, or the request may have reached SumUp', async () => {
    const { result } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.useFakeTimers();
    let outcome;
    await act(async () => {
      const charging = result.current.charge({ total: 9, foreignTransactionId: 'sale-3' });
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      outcome = await charging;
    });
    expect(outcome).toEqual({ status: 'unknown' });

    server.checkoutError = new TypeError('Failed to fetch');
    await act(async () => {
      outcome = await result.current.charge({ total: 9, foreignTransactionId: 'sale-4' });
    });
    expect(outcome).toEqual({ status: 'unknown' });
  });

  it('pairs a Solo and charges it from then on', async () => {
    server.readers = [];
    const { result } = renderHook(() => useSumUpSolo(true, EVENT));
    await waitFor(() => expect(result.current.readers).toEqual([]));
    await act(async () => {
      await result.current.pair('ABCD1234', 'Kasse 3');
    });
    expect(server.calls.find(([path]) => path === 'readers/pair')?.[1]).toEqual({
      eventId: EVENT,
      pairingCode: 'ABCD1234',
      name: 'Kasse 3',
    });
    expect(result.current.reader?.id).toBe('rdr_new');
    expect(result.current.ready).toBe(true);
  });
});
