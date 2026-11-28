import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStartActions } from './useStartActions';

const state = vi.hoisted(() => ({ flags: {} as Record<string, boolean>, authenticated: false }));
vi.mock('../../../../lib/api/react', () => ({
  useAuthState: () => ({ isLoading: false, isAuthenticated: state.authenticated }),
  useQuery: () => state.flags,
}));

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      const actions = useStartActions();
      const location = useLocation();
      return { actions, path: location.pathname + location.search };
    },
    { wrapper }
  );
}

describe('useStartActions', () => {
  beforeEach(() => {
    state.flags = {};
    state.authenticated = false;
  });

  it('sends visitors to the registration and the wizard while registration is open', () => {
    const { result } = setup();
    act(() => result.current.actions.goToSeller());
    expect(result.current.path).toBe('/register?role=participant');
    act(() => result.current.actions.goToOrganizer());
    expect(result.current.path).toBe('/events/new');
  });

  it('sends visitors to the login while registration is switched off (#334)', () => {
    state.flags = { is_registration_enabled: false };
    const { result } = setup();
    expect(result.current.actions.registrationOpen).toBe(false);
    act(() => result.current.actions.goToSeller());
    expect(result.current.path).toBe('/login?redirect=%2Fmy-products');
    act(() => result.current.actions.goToOrganizer());
    expect(result.current.path).toBe('/login?redirect=%2Fevents%2Fnew');
  });
});
