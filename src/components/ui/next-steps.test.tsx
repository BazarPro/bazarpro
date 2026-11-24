import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Megaphone, ShoppingCart, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { NextSteps, type NextStep } from './next-steps';

const steps: NextStep[] = [
  {
    id: 'done',
    icon: Megaphone,
    title: 'Werbung machen',
    text: 'erledigt',
    to: '/promo',
    done: true,
  },
  {
    id: 'now',
    icon: Users,
    title: 'Verkäufer anmelden',
    to: '/sellers',
    state: { a: 1 },
    current: true,
  },
  { id: 'later', icon: ShoppingCart, title: 'Verkaufen' },
];

describe('NextSteps', () => {
  it('lists the steps, links those with a page and marks the one due now', () => {
    render(
      <MemoryRouter>
        <NextSteps title="So läuft dein Basar" steps={steps} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'So läuft dein Basar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Werbung machen/ })).toHaveAttribute('href', '/promo');
    expect(screen.getByText('erledigt')).toBeInTheDocument();
    // A step without a page is no link
    expect(screen.queryByRole('link', { name: /Verkaufen/ })).toBeNull();
    expect(screen.getByText('Verkaufen')).toBeInTheDocument();
    const current = screen.getByText('Verkäufer anmelden').closest('li');
    expect(current).toHaveAttribute('aria-current', 'step');
  });
});
