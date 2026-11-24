import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Megaphone, ShoppingCart, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { BazaarRoadmap, NextStepCard } from './bazaar-roadmap';
import type { NextStep } from './next-steps';

const steps: NextStep[] = [
  { id: 'promote', icon: Megaphone, title: 'Werbung machen', to: '/promo', done: true },
  { id: 'sellers', icon: Users, title: 'Verkäufer anmelden lassen', to: '/sellers', done: true },
  {
    id: 'sale',
    icon: ShoppingCart,
    title: 'An der Kasse verkaufen',
    text: '3 von 10 verkauft',
    to: '/checkout',
    current: true,
  },
];

describe('BazaarRoadmap', () => {
  it('links every stop to its page and marks the one due now', () => {
    render(
      <MemoryRouter>
        <BazaarRoadmap
          steps={steps}
          label="So läuft dein Basar"
          nowLabel="Jetzt dran"
          positionLabel={(position, total) => `Schritt ${position} von ${total}`}
        />
      </MemoryRouter>
    );
    const roadmap = screen.getByRole('navigation', { name: 'So läuft dein Basar' });
    const links = within(roadmap).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/promo',
      '/sellers',
      '/checkout',
    ]);
    // The name stays readable for screen readers on phones, where it is not shown
    expect(within(roadmap).getByRole('link', { name: /An der Kasse verkaufen/ })).toBeVisible();
    const current = roadmap.querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('An der Kasse verkaufen');
    expect(current).toHaveTextContent('Jetzt dran');
    // Phones: the position of the step due now, not the number of steps done
    expect(screen.getByText(/Schritt 3 von 3/)).toBeInTheDocument();
  });
});

describe('NextStepCard', () => {
  it('shows the step due now with its one button', () => {
    render(
      <MemoryRouter>
        <NextStepCard
          step={steps[2]}
          eyebrow="Dein nächster Schritt"
          action="Kasse öffnen"
          doneText="Alles erledigt"
        />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'An der Kasse verkaufen' })).toBeInTheDocument();
    expect(screen.getByText('3 von 10 verkauft')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kasse öffnen/ })).toHaveAttribute('href', '/checkout');
  });

  it('says all is done without a step due', () => {
    render(
      <MemoryRouter>
        <NextStepCard
          step={undefined}
          eyebrow="Dein nächster Schritt"
          action={null}
          doneText="Alles erledigt"
        />
      </MemoryRouter>
    );
    expect(screen.getByText('Alles erledigt')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
