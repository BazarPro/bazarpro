import { useAuthState } from '../../../../lib/api/react';
import { useNavigate } from 'react-router-dom';
import { useRegistrationOpen } from '../../../../hooks/useFeatureFlags';
import { loginPath } from '../../../../lib/loginRedirect';

/** Targets of the "Basar organisieren" / "Als Verkäufer mitmachen" buttons. */
export function useStartActions() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthState();
  const registrationOpen = useRegistrationOpen();
  return {
    isAuthenticated,
    registrationOpen,
    // Visitors set up a bazaar first and sign up only to create it; without registration
    // the wizard would end in a locked form, so they log in first
    goToOrganizer: () =>
      navigate(
        isAuthenticated ? '/my-events' : registrationOpen ? '/events/new' : loginPath('/events/new')
      ),
    goToSeller: () =>
      navigate(
        isAuthenticated
          ? '/my-products'
          : registrationOpen
            ? '/register?role=participant'
            : loginPath('/my-products')
      ),
  };
}
