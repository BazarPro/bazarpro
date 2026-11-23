import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CategoryPicker } from './CategoryPicker';

const categories = [
  { _id: 'bikes', label: 'Fahrräder' },
  { _id: 'trekking', label: 'Trekkingräder', parentCategory: 'bikes' },
  { _id: 'cargo', label: 'Lastenräder', parentCategory: 'bikes' },
  { _id: 'clothes', label: 'Kleidung' },
  { _id: 'kids', label: 'Kinderkleidung', parentCategory: 'clothes' },
  { _id: 'misc', label: 'Sonstiges' },
];

// Radix opens the menu on pointer down
const open = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: /Kategorie wählen|›/ }), {
    button: 0,
    ctrlKey: false,
  });

describe('CategoryPicker', () => {
  it('shows main categories; one opens to its sub-categories, which are picked', () => {
    const onChange = vi.fn();
    render(
      <CategoryPicker
        categories={categories}
        value={undefined}
        onChange={onChange}
        placeholder="Kategorie wählen"
      />
    );
    open();
    expect(screen.getByRole('menuitem', { name: /Fahrräder/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Trekkingräder' })).not.toBeInTheDocument();

    // A main category with sub-categories only opens them
    fireEvent.click(screen.getByRole('menuitem', { name: /Fahrräder/ }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Trekkingräder' }));
    expect(onChange).toHaveBeenCalledWith('trekking');
  });

  it('a main category without sub-categories is picked directly', () => {
    const onChange = vi.fn();
    render(
      <CategoryPicker
        categories={categories}
        value={undefined}
        onChange={onChange}
        placeholder="Kategorie wählen"
      />
    );
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sonstiges' }));
    expect(onChange).toHaveBeenCalledWith('misc');
  });

  it('names the main category of the choice and leaves out what is not allowed', () => {
    render(
      <CategoryPicker
        categories={categories}
        value="cargo"
        onChange={() => {}}
        isAllowed={(id) => id !== 'trekking' && id !== 'misc'}
        placeholder="Kategorie wählen"
      />
    );
    expect(screen.getByRole('button', { name: /Fahrräder ›\s*Lastenräder/ })).toBeInTheDocument();
    open();
    // The group of the choice is open
    expect(screen.getByRole('menuitem', { name: 'Lastenräder' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Trekkingräder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Sonstiges' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Kleidung/ })).toBeInTheDocument();
  });
});
