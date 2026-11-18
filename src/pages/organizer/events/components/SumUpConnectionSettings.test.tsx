import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutation, useOptionalQuery } from '../../../../lib/api/react';
import type { Id } from '../../../../lib/api/types';
import { SumUpConnectionSettings } from './SumUpConnectionSettings';

vi.mock('../../../../lib/api/react', () => ({
  useOptionalQuery: vi.fn(),
  useMutation: vi.fn(),
}));
const connect = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../../../native/sumup', () => ({
  useSumUpConnect: () => connect,
  useSumUpReturn: () => {},
}));
vi.mock('./useSumUpReturnToast', () => ({ useSumUpReturnToast: () => () => {} }));
// The Solos of the account (lib/sumupSolo.test.ts tests the hook)
const solo = vi.hoisted(() => ({
  readers: null as { id: string; name: string; status: 'paired'; online?: boolean }[] | null,
  mayPair: true,
  error: null as unknown,
  busy: false,
  refresh: vi.fn(async () => {}),
  pair: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
}));
vi.mock('../../../../lib/sumupSolo', () => ({ useSumUpSolo: () => solo }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const eventId = 'event-1' as Id<'events'>;
const disconnect = vi.fn(async () => null);

type Connection = {
  oauth: boolean;
  connected: boolean;
  mine: boolean;
  merchantCode?: string;
};

function Settings({ dirty = false }: { dirty?: boolean }) {
  const methods = useForm({ defaultValues: { title: 'Basar' } });
  if (dirty && !methods.formState.isDirty) {
    methods.setValue('title', 'Neuer Basar', { shouldDirty: true });
  }
  return (
    <FormProvider {...methods}>
      <SumUpConnectionSettings eventId={eventId} />
    </FormProvider>
  );
}

const show = (connection: Connection | undefined, dirty = false) => {
  vi.mocked(useOptionalQuery).mockReturnValue(connection as never);
  return render(<Settings dirty={dirty} />);
};

describe('SumUpConnectionSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue(disconnect as never);
    solo.readers = [];
    solo.error = null;
  });

  it('shows nothing on a server without SumUp OAuth', () => {
    const { container } = show({ oauth: false, connected: false, mine: true });
    expect(container).toBeEmptyDOMElement();
    show(undefined);
  });

  it('lets the organizer connect the account', async () => {
    show({ oauth: true, connected: false, mine: true });
    expect(screen.getByText('SumUp-Konto')).toBeInTheDocument();
    // The app and the Solo come once the account is there
    expect(screen.queryByText('SumUp Solo im Browser')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mit SumUp verbinden' }));
    await waitFor(() => expect(connect).toHaveBeenCalled());
  });

  it('asks to save first, since SumUp opens on this page', () => {
    show({ oauth: true, connected: false, mine: true }, true);
    expect(screen.getByRole('button', { name: 'Mit SumUp verbinden' })).toBeDisabled();
    expect(screen.getByText('Bitte speichere zuerst deine Änderungen.')).toBeInTheDocument();
  });

  it('shows an error when connecting fails', async () => {
    connect.mockRejectedValueOnce(new Error('SumUp ist nicht erreichbar'));
    show({ oauth: true, connected: false, mine: true });
    fireEvent.click(screen.getByRole('button', { name: 'Mit SumUp verbinden' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('tells a helper that the organizer connects it', () => {
    show({ oauth: true, connected: false, mine: false });
    expect(screen.getByText('Nicht verbunden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mit SumUp verbinden' })).toBeNull();
  });

  it('shows the connected account with the app and the Solos', () => {
    solo.readers = [{ id: 'r1', name: 'Kasse 1', status: 'paired', online: true }];
    show({ oauth: true, connected: true, mine: true, merchantCode: 'MC123' });
    expect(screen.getByText('Verbunden')).toBeInTheDocument();
    expect(screen.getByText('· MC123')).toBeInTheDocument();
    expect(screen.getByText('In der BazarPro-App')).toBeInTheDocument();
    expect(screen.getByText('1 Solo gekoppelt')).toBeInTheDocument();
    expect(screen.getByText('Kasse 1')).toBeInTheDocument();
  });

  it('pairs the first Solo with the code it shows', async () => {
    show({ oauth: true, connected: true, mine: true });
    expect(screen.getByText('0 Solos gekoppelt')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Code vom Solo' }), {
      target: { value: 'abcd1234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Koppeln' }));
    await waitFor(() => expect(solo.pair).toHaveBeenCalledWith('ABCD1234', undefined));
  });

  it('says why the Solos cannot be listed', () => {
    solo.error = new Error('Bitte verbinde SumUp neu.');
    show({ oauth: true, connected: true, mine: true });
    expect(screen.getByText('Bitte verbinde SumUp neu.')).toBeInTheDocument();
    expect(screen.queryByText(/gekoppelt/)).toBeNull();
  });

  it('waits for the Solos', () => {
    solo.readers = null;
    show({ oauth: true, connected: true, mine: true });
    expect(screen.getByText('SumUp wird geprüft…')).toBeInTheDocument();
  });

  it('disconnects after asking', async () => {
    show({ oauth: true, connected: true, mine: true });
    fireEvent.click(screen.getByRole('button', { name: 'Trennen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trennen' }));
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith({}));
  });

  it('shows a helper the connection without disconnect or Solos', () => {
    show({ oauth: true, connected: true, mine: false });
    expect(screen.getByText('Verbunden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trennen' })).toBeNull();
    expect(screen.queryByText('SumUp Solo im Browser')).toBeNull();
  });
});
