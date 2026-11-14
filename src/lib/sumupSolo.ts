import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/functions';
import { useApiClient, useOptionalQuery } from './api/react';
import type { Id, SumUpReader, SumUpReaderPayment } from './api/types';
import { isNetworkError } from './offlineMode';
import { useSumUpConnect, type SumUpOutcome } from '../native/sumup';

/**
 * Card payments on a SumUp Solo over SumUp's Cloud API, for a desk without the SumUp SDK:
 * in the browser, e.g. on a PC at the cash desk. The Solo is online itself; the organizer
 * pairs it with the SumUp account they connected (backend/src/modules/sumup_solo.rs), and
 * the desk sends the total to it through the backend, then asks until it is paid.
 */

/** The Solo this device charges, if the account has more than one */
const READER_KEY = 'bazarpro.sumup.solo';
/** How often the desk asks whether the payment is done */
const POLL_MS = 2000;
/**
 * How long the desk waits for the outcome: SumUp starts the payment on the Solo within a
 * minute, then the buyer needs time for the card and the PIN. Longer is unclear.
 */
const PAYMENT_WAIT_MS = 4 * 60 * 1000;
/** A paid payment's transaction may come a little later; it has the code for SumUp */
const CODE_TRIES = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function storedReader(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(READER_KEY);
}

export type SumUpSoloState = ReturnType<typeof useSumUpSolo>;

/**
 * The organizer's Solos and payments on them. `enabled` is false while the event takes no
 * cards, or where the app's SDK takes them instead.
 */
export function useSumUpSolo(enabled: boolean, eventId: Id<'events'> | undefined) {
  const client = useApiClient();
  const connection = useOptionalQuery(
    api.sumup.getConnection,
    enabled && eventId ? { eventId } : 'skip'
  );
  /** The server connects SumUp with OAuth, which the Solo needs */
  const oauth = enabled && !!eventId && connection?.oauth === true;
  const connected = oauth && connection?.connected === true;
  const [readers, setReaders] = useState<SumUpReader[] | null>(null);
  const [mayPair, setMayPair] = useState(false);
  /** Why the readers could not be listed, e.g. a connection without the readers scopes */
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<string | null>(storedReader);
  /** The Solo a payment is running on, so the desk can stop it */
  const [paying, setPaying] = useState<string | null>(null);
  const connect = useSumUpConnect();

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const result = await client.sumUpSolo('readers', { eventId });
      setReaders(result.readers);
      setMayPair(result.mayPair);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [client, eventId]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!connected) {
      setReaders(null);
      setError(null);
      return;
    }
    void run(load);
  }, [connected, load, run]);

  // A Solo confirms its pairing a moment after the code went to SumUp
  const processing = readers?.some((reader) => reader.status === 'processing') ?? false;
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [processing, load]);

  const paired = readers?.filter((reader) => reader.status === 'paired') ?? [];
  const reader =
    paired.find((candidate) => candidate.id === chosen) ??
    (paired.length === 1 ? paired[0] : undefined);
  const latest = useRef({ reader, eventId });
  latest.current = { reader, eventId };

  return {
    /** The server can run a Solo: SumUp with OAuth, and the event takes cards here */
    oauth,
    connected,
    /** The signed-in user is the organizer, who connects SumUp */
    mayConnect: oauth && connection?.mine === true,
    /** null while they are asked */
    readers,
    /** The organizer, who pairs and removes Solos */
    mayPair,
    error,
    busy,
    /** The Solo the desk charges */
    reader,
    /** A Solo is chosen: the desk charges the card itself */
    ready: connected && !!reader,
    /** A payment is waiting on the Solo */
    paying: paying !== null,
    connect,
    refresh: () => run(load),
    choose: (id: string) => {
      localStorage.setItem(READER_KEY, id);
      setChosen(id);
    },
    pair: (pairingCode: string, name?: string) =>
      run(async () => {
        if (!eventId) return;
        const added = await client.sumUpSolo('readers/pair', { eventId, pairingCode, name });
        localStorage.setItem(READER_KEY, added.id);
        setChosen(added.id);
        await load();
      }),
    remove: (readerId: string) =>
      run(async () => {
        if (!eventId) return;
        await client.sumUpSolo('readers/remove', { eventId, readerId });
        await load();
      }),
    /** Stops the payment on the Solo while it waits for the card; it then ends as cancelled. */
    cancel: async () => {
      if (!eventId || !paying) return;
      await client.sumUpSolo('checkout/cancel', { eventId, readerId: paying });
    },
    /**
     * Sends the total to the Solo and waits for the buyer's card. `unknown` when the
     * outcome did not come in time, or the desk lost the backend after sending.
     */
    charge: async (options: {
      total: number;
      foreignTransactionId: string;
    }): Promise<SumUpOutcome> => {
      const { reader: target, eventId: event } = latest.current;
      if (!event || !target) return { status: 'failed' };
      const readerId = target.id;
      let started;
      try {
        started = await client.sumUpSolo('checkout', {
          eventId: event,
          readerId,
          amountCents: Math.round(options.total * 100),
          deskSaleId: options.foreignTransactionId,
        });
      } catch (caught) {
        // The request may have reached SumUp: only the Solo can tell
        if (isNetworkError(caught)) return { status: 'unknown' };
        throw caught;
      }
      setPaying(readerId);
      try {
        const ask = () =>
          client.sumUpSolo('checkout/status', {
            eventId: event,
            readerId,
            checkoutId: started.checkoutId,
            clientTransactionId: started.clientTransactionId,
          });
        const deadline = Date.now() + PAYMENT_WAIT_MS;
        while (Date.now() < deadline) {
          await wait(POLL_MS);
          let payment: SumUpReaderPayment;
          try {
            payment = await ask();
          } catch {
            // Asked again; a desk without connection ends as unclear
            continue;
          }
          if (payment.status === 'cancelled') return { status: 'failed', code: 'cancelled' };
          if (payment.status === 'failed') return { status: 'failed' };
          if (payment.status !== 'successful') continue;
          for (let tries = 1; !payment.transactionCode && tries < CODE_TRIES; tries++) {
            await wait(POLL_MS);
            payment = await ask().catch(() => payment);
          }
          return {
            status: 'successful',
            transactionCode: payment.transactionCode,
            cardType: payment.cardType,
            lastFour: payment.lastFour,
          };
        }
        return { status: 'unknown' };
      } finally {
        setPaying(null);
      }
    },
  };
}
