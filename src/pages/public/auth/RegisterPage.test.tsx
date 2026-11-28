import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../../../lib/api/functions';
import type { FunctionReference } from '../../../lib/api/types';
import { RegisterPage } from './RegisterPage';

const signIn = vi.hoisted(() => vi.fn());
const flags = vi.hoisted(() => ({ current: {} as Record<string, boolean> }));
vi.mock('../../../lib/api/react', () => ({
  useAuthState: () => ({ isLoading: false, isAuthenticated: false }),
  useAuthActions: () => ({ signIn }),
  useQuery: (ref: FunctionReference<'query'>) =>
    ({
      'featureFlags.get': flags.current,
      'authProviders.configured': { google: true, github: true },
    })[getFunctionName(ref)],
}));
vi.mock('../../../components/navigation/BackButton', () => ({ BackButton: () => null }));
vi.mock('../../../hooks/useRedirectAfterLogin', () => ({
  useRedirectAfterLogin: () => false,
  BROWSE_EVENTS_PATH: '/browse-events',
}));

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <RegisterPage />
    </MemoryRouter>
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    signIn.mockReset();
    flags.current = {};
    signIn.mockResolvedValue({ signingIn: false });
  });

  it('offers Google and GitHub, which come back to where the user wanted to go', () => {
    renderAt('/register?redirect=%2Fevents%2Fnew%3Fdraft%3D1');
    fireEvent.click(screen.getByRole('button', { name: 'Weiter mit Google' }));
    expect(signIn).toHaveBeenCalledWith('google', {
      redirectTo: '/login?oauth=1&redirect=%2Fevents%2Fnew%3Fdraft%3D1',
    });
    expect(screen.getByRole('button', { name: 'Weiter mit GitHub' })).toBeInTheDocument();
  });

  it('signs up with email and one password, the terms as a notice', async () => {
    renderAt('/register');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByTestId('register-terms')).toHaveTextContent('Nutzungsbedingungen');

    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'erika@example.de' },
    });
    fireEvent.change(screen.getByTestId('register-password'), { target: { value: 'kurz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Konto erstellen' }));
    expect(await screen.findByText('Mindestens 10 Zeichen')).toHaveClass('text-destructive');
    expect(signIn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Passwort anzeigen' }));
    expect(screen.getByTestId('register-password')).toHaveAttribute('type', 'text');
    fireEvent.change(screen.getByTestId('register-password'), {
      target: { value: 'kinderbasar' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Konto erstellen' }));
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        'password',
        expect.objectContaining({
          email: 'erika@example.de',
          password: 'kinderbasar',
          flow: 'signUp',
        })
      )
    );
    expect(await screen.findByTestId('form-email-verification')).toBeInTheDocument();
  });
});

describe('RegisterPage with registration switched off (#334)', () => {
  beforeEach(() => {
    flags.current = { is_registration_enabled: false };
  });

  it('shows no locked form, but the way to the login and the demo', () => {
    render(
      <MemoryRouter initialEntries={['/register?joinEventId=e1']}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginTarget />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('register-closed')).toBeInTheDocument();
    expect(screen.queryByLabelText('E-Mail-Adresse')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Weiter mit Google' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Demo ansehen' })).toHaveAttribute(
      'href',
      'https://demo.bazarpro.de'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zur Anmeldung' }));
    // Back to the bazaar afterwards, with its join dialog
    expect(screen.getByTestId('login-target')).toHaveTextContent(
      '?redirect=%2Fpublic-events%2Fe1%3FopenJoinDialog%3D1'
    );
  });
});

function LoginTarget() {
  const { search } = useLocation();
  return <p data-testid="login-target">{search}</p>;
}
