import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';
import { EditEventRegion } from './EditEventRegion';
import type { PostalCodesByCountry } from '../../../../shared/postalCodes';

const german = () => current.allowedPostalCodes.DE ?? [];

let current: { regionOnly: boolean; allowedPostalCodes: PostalCodesByCountry };

function Form({ postalCode = '89231', region = {} as PostalCodesByCountry }) {
  const methods = useForm({
    defaultValues: {
      location: 'Stadthalle',
      address: { postalCode, country: 'DE' },
      features: {
        regionOnly: Object.keys(region).length > 0,
        allowedPostalCodes: region,
      },
    },
  });
  current = methods.watch('features');
  return (
    <FormProvider {...methods}>
      <EditEventRegion />
    </FormProvider>
  );
}

describe('EditEventRegion (#304)', () => {
  it('starts with a circle around the bazaar once switched on', async () => {
    render(<Form />);
    expect(screen.queryByText('Umkreis')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nur Verkäufer aus der Region' }));
    expect(screen.getByRole('slider')).toBeInTheDocument();
    await waitFor(() => expect(german()).toContain('892'));
    expect(german()).toContain('890');
    expect(Object.keys(current.allowedPostalCodes)).toEqual(['DE']);
    expect(screen.getByRole('slider')).toHaveValue('20');
    expect(screen.getByTestId('region-summary')).toHaveTextContent(/Gebiete ausgewählt/);
    expect(screen.getByText('892…')).toBeInTheDocument();

    // The radius grows: more areas, none of the old ones lost. They are stored once the
    // slider rests, not on every step
    const stored = current.allowedPostalCodes;
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(screen.getByRole('slider')).toHaveValue('60');
    expect(current.allowedPostalCodes).toBe(stored);
    await waitFor(() => expect(german().length).toBeGreaterThan(3));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    // Let go: stored at once
    fireEvent.pointerUp(screen.getByRole('slider'));
    expect(current.allowedPostalCodes).toEqual({});
    expect(screen.getByTestId('region-summary')).toHaveTextContent('Noch kein Gebiet');
  });

  it('takes postal codes typed in and removes them again', async () => {
    render(<Form region={{ DE: ['89'] }} />);
    await screen.findByText('89…');
    const input = screen.getByLabelText('Postleitzahl oder ihren Anfang hinzufügen');
    for (const wrong of ['12a', '123456', 'FR-75001']) {
      fireEvent.change(input, { target: { value: wrong } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByText(/Bitte eine Postleitzahl oder ihren Anfang/)).toBeInTheDocument();
    }
    fireEvent.change(input, { target: { value: '7322' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(current.allowedPostalCodes).toEqual({ DE: ['7322', '89'] }));
    // Covered by a shorter one: nothing new
    fireEvent.change(input, { target: { value: '89073' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(current.allowedPostalCodes).toEqual({ DE: ['7322', '89'] });
    fireEvent.click(screen.getByRole('button', { name: '89… entfernen' }));
    expect(current.allowedPostalCodes).toEqual({ DE: ['7322'] });
    // Across the border with the country in front; then the chips name their country
    fireEvent.change(input, { target: { value: 'A-6900' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(current.allowedPostalCodes).toEqual({ DE: ['7322'], AT: ['6900'] }));
    expect(screen.getByText('DE 7322…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'AT 6900… entfernen' }));
    expect(current.allowedPostalCodes).toEqual({ DE: ['7322'] });
  });

  it('reaches across the border with the radius', async () => {
    // Lindau at Lake Constance: Bregenz in Austria is a few km away
    render(<Form postalCode="88131" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nur Verkäufer aus der Region' }));
    await waitFor(() => expect(german()).toContain('881'));
    expect(current.allowedPostalCodes.AT?.some((prefix) => prefix.startsWith('69'))).toBe(true);
    expect(screen.queryByLabelText('Postleitzahlen aus')).not.toBeInTheDocument();
  });

  it('explains a missing place', async () => {
    render(<Form postalCode="" region={{ DE: ['89'] }} />);
    await screen.findByText(/Noch kein Ort auf der Karte/);
    expect(screen.getByRole('slider')).toBeDisabled();
  });

  describe('with the current location', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('moves the circle to where the organizer is', async () => {
      const getCurrentPosition = vi.fn((success: PositionCallback) =>
        success({ coords: { latitude: 48.7758, longitude: 9.1829 } } as GeolocationPosition)
      );
      vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
      render(<Form />);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Nur Verkäufer aus der Region' }));
      await waitFor(() => expect(german()).toContain('892'));
      fireEvent.click(screen.getByRole('radio', { name: 'Mein Standort' }));
      // Stuttgart instead of Neu-Ulm
      await waitFor(() => expect(german()).toContain('70'));
      expect(german()).not.toContain('892');
      expect(screen.getByRole('radio', { name: 'Mein Standort' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      fireEvent.click(screen.getByRole('radio', { name: 'Basar' }));
      await waitFor(() => expect(german()).toContain('892'));
    });

    it('explains when the location is not available', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: {
          getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) =>
            failure({ code: 1 } as GeolocationPositionError),
        },
      });
      render(<Form region={{ DE: ['89'] }} />);
      await screen.findByText('89…');
      fireEvent.click(screen.getByRole('radio', { name: 'Mein Standort' }));
      expect(await screen.findByText(/Standort nicht verfügbar/)).toBeInTheDocument();
      vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
      fireEvent.click(screen.getByRole('radio', { name: 'Mein Standort' }));
      expect(
        await screen.findByText('Dein Gerät kann den Standort nicht bestimmen.')
      ).toBeInTheDocument();
    });

    it('shows many postal codes folded', async () => {
      const many = Array.from({ length: 14 }, (_, index) => `${10 + index}`);
      render(<Form region={{ DE: many }} />);
      await screen.findByText('+4 weitere');
      fireEvent.click(screen.getByText('+4 weitere'));
      expect(screen.getByText('23…')).toBeInTheDocument();
      fireEvent.click(screen.getByText('weniger zeigen'));
      fireEvent.click(screen.getByRole('button', { name: 'Alle abwählen' }));
      expect(current.allowedPostalCodes).toEqual({});
    });
  });
});
