import { fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { EditEventBasicInfo } from './EditEventBasicInfo';

function Form({ lockDates = false, description = '' }) {
  const methods = useForm({ defaultValues: { title: '', description, location: '' } });
  return (
    <FormProvider {...methods}>
      <EditEventBasicInfo lockDates={lockDates} />
    </FormProvider>
  );
}

const description = () => document.getElementById('description') as HTMLTextAreaElement;

describe('EditEventBasicInfo', () => {
  it('formats the description with the toolbar', () => {
    render(<Form description="Räder" />);
    const formats: [string, string][] = [
      ['Fett', '**Räder**'],
      ['Kursiv', '*Räder*'],
      ['Liste', '- Räder'],
      ['Link', '[Räder](https://example.com)'],
      ['H2', '## Räder'],
      ['H3', '### Räder'],
      ['Absatz', '\n\nRäder\n\n'],
    ];
    for (const [button, expected] of formats) {
      fireEvent.change(description(), { target: { value: 'Räder' } });
      description().setSelectionRange(0, 5);
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(description()).toHaveValue(expected);
    }
  });

  it('indents with Tab and shows a preview', () => {
    render(<Form description="Marktplatz" />);
    description().setSelectionRange(0, 0);
    fireEvent.keyDown(description(), { key: 'Tab' });
    expect(description()).toHaveValue('  Marktplatz');
    fireEvent.keyDown(description(), { key: 'a' });

    fireEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
    expect(description()).toBeNull();
    expect(screen.getByText('Marktplatz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(description()).not.toBeNull();
  });

  it('says so when the preview has nothing to show', () => {
    render(<Form />);
    fireEvent.click(screen.getByRole('button', { name: 'Vorschau' }));
    expect(screen.getByText(/Noch keine Beschreibung vorhanden/)).toBeInTheDocument();
  });

  it('locks the dates of a running event', () => {
    render(<Form lockDates />);
    for (const id of ['startDay', 'startTime', 'endTime']) {
      expect(document.getElementById(id)).toHaveAttribute('readonly');
    }
    expect(screen.queryByLabelText('Geht über mehrere Tage')).toBeNull();
  });

  it('fills in usual times for the picked day and keeps the length when the start moves', () => {
    function Dates() {
      const methods = useForm({ defaultValues: { startDate: '', endDate: '' } });
      return (
        <FormProvider {...methods}>
          <EditEventBasicInfo parts={['when']} />
          <output data-testid="values">
            {methods.watch('startDate')}|{methods.watch('endDate')}
          </output>
        </FormProvider>
      );
    }
    render(<Dates />);
    fireEvent.change(document.getElementById('startDay')!, { target: { value: '2099-04-18' } });
    expect(screen.getByTestId('values')).toHaveTextContent('2099-04-18T10:00|2099-04-18T14:00');
    fireEvent.change(document.getElementById('startTime')!, { target: { value: '08:30' } });
    expect(screen.getByTestId('values')).toHaveTextContent('2099-04-18T08:30|2099-04-18T12:30');
    // Several days: the last day can be picked on its own
    fireEvent.click(screen.getByLabelText('Geht über mehrere Tage'));
    fireEvent.change(document.getElementById('endDay')!, { target: { value: '2099-04-19' } });
    expect(screen.getByTestId('values')).toHaveTextContent('2099-04-18T08:30|2099-04-19T12:30');
  });
});
