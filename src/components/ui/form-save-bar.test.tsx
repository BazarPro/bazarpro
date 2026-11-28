import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormSaveBar } from './form-save-bar';

describe('FormSaveBar', () => {
  it('says all is saved and keeps the main button, paler, without changes', () => {
    render(<FormSaveBar dirty={false} saving={false} disabled onSave={vi.fn()} />);
    expect(screen.getByTestId('form-saved')).toHaveTextContent('Alles gespeichert');
    const save = screen.getByRole('button', { name: 'Speichern' });
    expect(save).toBeDisabled();
    // Not grey like a second button: still the action colour
    expect(save.className).toContain('disabled:bg-primary');
  });

  it('saves a change and discards it only after asking', async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<FormSaveBar dirty saving={false} onSave={onSave} onDiscard={onDiscard} />);
    expect(screen.getByText('Ungespeicherte Änderungen')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(await screen.findByText('Änderungen verwerfen?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Verwerfen' }).at(-1)!);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('submits its form without onSave', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <FormSaveBar dirty saving={false} saveLabel="Änderungen speichern" />
      </form>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Änderungen speichern' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
