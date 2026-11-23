import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/functions';
import type { ApiClient } from './api/client';
import { useApiClient, useConnected } from './api/react';
import { createDeviceQueue, useSendWhileWaiting } from './deviceQueue';
import type { FunctionArgs, FunctionReturnType, Id } from './api/types';
import {
  OFFLINE_AFTER_MS,
  OFFLINE_FLAG_KEY,
  isOfflineAvailable,
  useDisconnected,
} from './offlineMode';

/**
 * The cash desk without internet, in the app: before the bazaar it keeps a copy of every
 * item of the event (getCheckoutSnapshot). Offline it sells from that copy and queues the
 * sales on the device; once online the queue is booked (syncOfflineSales). Each sale has
 * its own ID, so sending it twice books it once. An item another desk sold meanwhile
 * becomes a conflict the team settles in the cash reconciliation.
 */

export type CheckoutSnapshot = FunctionReturnType<typeof api.purchases.getCheckoutSnapshot>;
export type SnapshotItem = CheckoutSnapshot['items'][number];
export type OfflineSale = FunctionArgs<typeof api.purchases.syncOfflineSales>['sales'][number];

/** Per seller: the commission a direct sale took from their fee cap (#301) */
export type FeeCapSpent = Record<string, number>;

export type OfflineState = {
  snapshot: CheckoutSnapshot | null;
  /** Sales not booked yet, oldest first */
  queue: OfflineSale[];
  /** Per queued sale (deskSaleId): what it took from the sellers' fee caps */
  feeCapSpent?: Record<string, FeeCapSpent>;
};

/** Sales per sync call; the backend takes at most 50 (MAX_SYNC_SALES) */
const SYNC_BATCH = 50;

const EMPTY: OfflineState = { snapshot: null, queue: [] };

/** Only the app sells offline: the browser cannot load the page without internet. */
export const isOfflineCheckoutAvailable = isOfflineAvailable;
export { OFFLINE_AFTER_MS, OFFLINE_FLAG_KEY };

export type SyncResult = { booked: number; conflicts: number };

// --- state per event on the device, shared by every component that shows it

const store = createDeviceQueue<OfflineState, OfflineSale, SyncResult>({
  file: (eventId) => `offline-checkout/${eventId}`,
  empty: EMPTY,
  parse: (stored) => {
    if (!stored) return EMPTY;
    const parsed = stored as Partial<OfflineState>;
    return {
      snapshot: parsed.snapshot ?? null,
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      feeCapSpent: parsed.feeCapSpent ?? {},
    };
  },
  queueOf: (state) => state.queue,
  // A booked sale is in the backend's rest of the cap; only queued ones still count here
  withQueue: (state, queue) => ({
    ...state,
    queue,
    feeCapSpent: Object.fromEntries(
      queue.flatMap((sale) => {
        const spent = state.feeCapSpent?.[sale.deskSaleId];
        return spent ? [[sale.deskSaleId, spent]] : [];
      })
    ),
  }),
  batch: SYNC_BATCH,
  emptyResult: () => ({ booked: 0, conflicts: 0 }),
  idOf: (sale) => sale.deskSaleId,
  send: async (client, eventId, sales, result) => {
    const synced = await client.mutation(api.purchases.syncOfflineSales, {
      eventId: eventId as Id<'events'>,
      sales,
    });
    for (const sale of synced) {
      if (!sale.bookedNow) continue;
      result.booked += 1;
      result.conflicts += sale.conflicts.length;
    }
    return new Set(synced.map((sale) => sale.deskSaleId));
  },
});

export const loadOfflineState = store.load;
const update = store.update;

/** Forgets the copies in memory; for tests. */
export const resetOfflineCheckout = store.reset;

// --- the copy of the items

/** The item of a scanned product in the copy; null when it is not at this event. */
export function lookupOffline(
  snapshot: CheckoutSnapshot | null,
  productId: string
): SnapshotItem | null {
  return snapshot?.items.find((item) => item.productId === productId) ?? null;
}

/** Loads the current items for offline use; keeps what this desk sold but did not book yet. */
export async function downloadSnapshot(client: ApiClient, eventId: string): Promise<void> {
  const snapshot = await client.query(api.purchases.getCheckoutSnapshot, {
    eventId: eventId as Id<'events'>,
  });
  await update(eventId, (state) => ({
    ...state,
    snapshot: markSold(
      snapshot,
      state.queue,
      state.queue.map((sale) => state.feeCapSpent?.[sale.deskSaleId])
    ),
  }));
}

/**
 * The copy after sales of this desk that are not booked yet: their items are sold, and
 * the fee cap of their sellers is lower by what they took, so the next offline cart does
 * not charge the same rest again.
 */
function markSold(
  snapshot: CheckoutSnapshot,
  sales: OfflineSale[],
  spent: (FeeCapSpent | undefined)[] = []
): CheckoutSnapshot {
  const sold = new Set(sales.flatMap((sale) => sale.items.map((item) => item.eventProductId)));
  const used = new Map<string, number>();
  for (const perSeller of spent) {
    for (const [seller, amount] of Object.entries(perSeller ?? {})) {
      used.set(seller, (used.get(seller) ?? 0) + amount);
    }
  }
  if (sold.size === 0 && used.size === 0) return snapshot;
  return {
    ...snapshot,
    items: snapshot.items.map((item) => {
      const taken = used.get(item.sellerId);
      const feeCapLeft =
        item.feeCapLeft === undefined || taken === undefined
          ? item.feeCapLeft
          : Math.max(Math.round((item.feeCapLeft - taken) * 100), 0) / 100;
      const status = sold.has(item.eventProductId) ? ('sold' as const) : item.status;
      return status === item.status && feeCapLeft === item.feeCapLeft
        ? item
        : { ...item, status, feeCapLeft };
    }),
  };
}

// --- the queue

/**
 * Keeps a sale on the device; its items count as sold for this desk right away, and a
 * direct sale lowers the fee cap of its sellers by `feeCapSpent`.
 */
export async function enqueueSale(
  eventId: string,
  sale: OfflineSale,
  feeCapSpent?: FeeCapSpent
): Promise<void> {
  await update(eventId, (state) => {
    if (state.queue.some((queued) => queued.deskSaleId === sale.deskSaleId)) return state;
    return {
      snapshot: state.snapshot && markSold(state.snapshot, [sale], [feeCapSpent]),
      queue: [...state.queue, sale],
      feeCapSpent: feeCapSpent
        ? { ...state.feeCapSpent, [sale.deskSaleId]: feeCapSpent }
        : state.feeCapSpent,
    };
  });
}

/**
 * Books the queue in batches. A sale leaves the queue once the backend answered for it;
 * on a network error the rest stays for the next try. One run per event at a time.
 */
export const flushQueue = store.flush;

/**
 * The offline state of the cash desk of an event. Online it refreshes the copy of the
 * items and books the queue; `onSynced` reports what a sync booked.
 */
export function useOfflineCheckout(
  eventId: string | undefined,
  onSynced?: (result: SyncResult) => void
) {
  const client = useApiClient();
  const connected = useConnected();
  const available = isOfflineCheckoutAvailable();
  const disconnected = useDisconnected();
  const { state, refusedWith } = store.useQueueState(eventId);
  const [refreshing, setRefreshing] = useState(false);
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  useEffect(() => {
    if (available && eventId) void loadOfflineState(eventId);
  }, [available, eventId]);

  const sync = useCallback(async () => {
    if (!eventId) return;
    try {
      const result = await flushQueue(client, eventId);
      if (result.booked > 0) onSyncedRef.current?.(result);
    } catch {
      // Still no connection; the queue stays for the next try
    }
  }, [client, eventId]);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setRefreshing(true);
    try {
      await sync();
      await downloadSnapshot(client, eventId);
    } catch {
      // Keeps the copy it has
    } finally {
      setRefreshing(false);
    }
  }, [client, eventId, sync]);

  // Back online (or opened online): book the queue, then take a fresh copy
  useEffect(() => {
    if (available && connected) void refresh();
  }, [available, connected, refresh]);

  // A sale queued while the socket was up (a request without reply) is booked at once,
  // like the intake queue, and retried while it waits
  const pending = state.queue.length;
  const clearRefusal = useCallback(() => {
    if (eventId) store.clearRefusal(eventId);
  }, [eventId]);
  /** After a refusal of the whole sync: once more, e.g. after being added to the team again */
  const retry = useSendWhileWaiting({
    waiting: available && connected && pending > 0 && !refusedWith,
    pending,
    send: sync,
    clearRefusal,
  });

  return {
    available,
    /** Without connection; in the browser the desk cannot sell then */
    disconnected,
    /** Sells from the copy and queues the sales */
    offline: available && disconnected,
    snapshot: state.snapshot,
    pending,
    refusedWith,
    retry,
    refreshing,
    refresh,
    sync,
  };
}
