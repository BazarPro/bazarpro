import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';
import { EditEventRegion } from './EditEventRegion';

let current: { regionOnly: boolean; allowedPostalCodes: string[]; postalCodeCountry: string };

function Form({ postalCode = '89231', prefixes = [] as string[] }) {
  const methods = useForm({
    defaultValues: {
      location: 'Stadthalle',
      address: { postalCode, country: 'DE' },
      features: {
        regionOnly: prefixes.length > 0,
        allowedPostalCodes: prefixes,
        postalCodeCountry: prefixes.length ? 'DE' : '',
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
    expect(screen.getByText('Mit dem Regler den Umkreis ziehen')).toBeInTheDocument();
    await waitFor(() => expect(current.allowedPostalCodes).toContain('892'));
    expect(current.allowedPostalCodes).toContain('890');
    expect(current.postalCodeCountry).toBe('DE');
    expect(screen.getByRole('slider')).toHaveValue('20');
    expect(screen.getByTestId('region-summary')).toHaveTextContent(/Postleitzahl .*892…/);

    // The radius grows: more areas, none of the old ones lost. They are stored once the
    // slider rests, not on every step
    const stored = current.allowedPostalCodes;
    fireEvent.change(screen.getByRole('slider'), { target: { value: '60' } });
    expect(screen.getByRole('slider')).toHaveValue('60');
    expect(current.allowedPostalCodes).toBe(stored);
    await waitFor(() => expect(current.allowedPostalCodes.length).toBeGreaterThan(3));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    // Let go: stored at once
    fireEvent.pointerUp(screen.getByRole('slider'));
    expect(current.allowedPostalCodes).toEqual([]);
    expect(screen.getByTestId('region-summary')).toHaveTextContent('Wähle mindestens ein Gebiet');
  });

  it('takes postal codes typed in and removes them again', async () => {
    render(<Form prefixes={['89']} />);
    await screen.findByText('89…');
    const input = screen.getByLabelText('Postleitzahl oder ihren Anfang hinzufügen');
    fireEvent.change(input, { target: { value: '12a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Bitte nur Ziffern, höchstens 5.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '7322' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(current.allowedPostalCodes).toEqual(['7322', '89']));
    // Covered by a shorter one: nothing new
    fireEvent.change(input, { target: { value: '89073' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    expect(current.allowedPostalCodes).toEqual(['7322', '89']);
    fireEvent.click(screen.getByRole('button', { name: '89… entfernen' }));
    expect(current.allowedPostalCodes).toEqual(['7322']);
  });

  it('starts over in another country and explains a missing place', async () => {
    render(<Form postalCode="" prefixes={['89']} />);
    await screen.findByText(/Noch kein Ort auf der Karte/);
    expect(screen.getByRole('slider')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Postleitzahlen aus'), { target: { value: 'AT' } });
    expect(current.postalCodeCountry).toBe('AT');
    expect(current.allowedPostalCodes).toEqual([]);
  });

  describe('with the current location', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('moves the circle to where the organizer is', async () => {
      const getCurrentPosition = vi.fn((success: PositionCallback) =>
        success({ coords: { latitude: 48.7758, longitude: 9.1829 } } as GeolocationPosition)
      );
      vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
      render(<Form prefixes={[]} />);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Nur Verkäufer aus der Region' }));
      await waitFor(() => expect(current.allowedPostalCodes).toContain('892'));
      fireEvent.click(screen.getByRole('radio', { name: 'Mein Standort' }));
      // Stuttgart instead of Neu-Ulm
      await waitFor(() => expect(current.allowedPostalCodes).toContain('70'));
      expect(current.allowedPostalCodes).not.toContain('892');
      expect(screen.getByRole('radio', { name: 'Mein Standort' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      fireEvent.click(screen.getByRole('radio', { name: 'Basar' }));
      await waitFor(() => expect(current.allowedPostalCodes).toContain('892'));
    });

    it('explains when the location is not available', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: {
          getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) =>
            failure({ code: 1 } as GeolocationPositionError),
        },
      });
      render(<Form prefixes={['89']} />);
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
      render(<Form prefixes={many} />);
      await screen.findByText('+4 weitere');
      fireEvent.click(screen.getByText('+4 weitere'));
      expect(screen.getByText('23…')).toBeInTheDocument();
      fireEvent.click(screen.getByText('weniger zeigen'));
      fireEvent.click(screen.getByRole('button', { name: 'Alle abwählen' }));
      expect(current.allowedPostalCodes).toEqual([]);
    });
  });
});
