import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';
import type { FeeLock } from '../../../../lib/sellerFees';
import { EditEventFeeGroups, type FeeGroupForm } from './EditEventFeeGroups';

let current: FeeGroupForm[] = [];
const members: FeeGroupForm = {
  id: 'members',
  label: 'Vereinsmitglieder',
  commission: 5,
  intakeFee: 1,
  maxFeesPerSeller: 15,
  maxItemsPerSeller: 30,
  assignment: 'selfDeclared',
  proofHint: 'Ausweis zeigen',
};

// One object for every render: a new one each time would reset the form again and again
const LABEL_ERROR = {
  features: { feeGroups: [{ label: { type: 'custom', message: 'Name fehlt' } }] },
};

function Form({
  groups = [] as FeeGroupForm[],
  feeLock = null as FeeLock,
  registeredIds = [] as string[],
  error = false,
}) {
  const methods = useForm({
    defaultValues: {
      commission: 10,
      features: { maxFeesPerSeller: 20, maxItemsPerSeller: 20, feeGroups: groups },
    },
    errors: error ? LABEL_ERROR : undefined,
  });
  current = methods.watch('features.feeGroups');
  return (
    <FormProvider {...methods}>
      <EditEventFeeGroups feeLock={feeLock} registeredIds={registeredIds} />
    </FormProvider>
  );
}

describe('EditEventFeeGroups', () => {
  it("adds a group with the bazaar's commission and opens it", () => {
    render(<Form />);
    expect(screen.getByText(/Alle Verkäufer zahlen dieselben Gebühren/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gebührengruppe hinzufügen' }));
    expect(screen.getByText('Neue Gruppe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('wie Basar (20,00 €)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('wie Basar (20)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name der Gruppe'), { target: { value: 'Helfer' } });
    fireEvent.change(screen.getByLabelText('Wer gehört dazu?'), { target: { value: 'helpers' } });
    expect(current[0]).toMatchObject({ label: 'Helfer', commission: 10, assignment: 'helpers' });
    // Helpers bring no proof
    expect(screen.queryByLabelText('Nachweis (optional)')).not.toBeInTheDocument();
  });

  it('shows a group in short and removes it', () => {
    render(<Form groups={[members]} />);
    expect(
      screen.getByText(
        '5 % Provision · 1,00 € pro Artikel · höchstens 15,00 € · 30 Artikel · Angabe bei der Anmeldung'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Vereinsmitglieder/ }));
    expect(screen.getByLabelText('Nachweis (optional)')).toHaveValue('Ausweis zeigen');
    fireEvent.click(screen.getByRole('button', { name: 'Gruppe entfernen' }));
    expect(current).toEqual([]);
  });

  it('keeps a group sellers registered with', () => {
    render(<Form groups={[members]} feeLock="sellers" registeredIds={['members']} />);
    fireEvent.click(screen.getByRole('button', { name: /Vereinsmitglieder/ }));
    expect(screen.getByRole('button', { name: 'Gruppe entfernen' })).toBeDisabled();
    expect(screen.getByLabelText('Wer gehört dazu?')).toBeDisabled();
    expect(
      screen.getByText(/Verkäufer haben sich mit dieser Gruppe angemeldet/)
    ).toBeInTheDocument();
  });

  it('is fixed while the bazaar runs and opens a group with an error', () => {
    const noFees = {
      ...members,
      intakeFee: NaN,
      maxFeesPerSeller: NaN,
      maxItemsPerSeller: NaN,
      label: '',
    };
    render(<Form groups={[noFees]} feeLock="running" error />);
    expect(
      screen.queryByRole('button', { name: 'Gebührengruppe hinzufügen' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Name fehlt')).toBeInTheDocument();
    expect(
      screen.getByText('5 % Provision · keine Annahmegebühr · Angabe bei der Anmeldung')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Provision')).toHaveAttribute('readonly');
  });
});
