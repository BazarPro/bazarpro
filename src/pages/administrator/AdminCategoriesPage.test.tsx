import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFunctionName } from '../../lib/api/functions';
import { useMutation, useQuery } from '../../lib/api/react';
import type { CategoryField } from '../../shared/categoryFields';
import { AdminCategoriesPage } from './AdminCategoriesPage';

vi.mock('../../lib/api/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }));

const field = (id: string, label: string, extra: Partial<CategoryField> = {}) => ({
  _id: id,
  key: id,
  label,
  short: false,
  notFoundButton: false,
  ...extra,
});
const frameNumber = field('frameNumber', 'Rahmennummer', { placeholder: 'z. B. WBK123456' });
const brand = field('brand', 'Marke');
const clothingSize = field('clothingSize', 'Größe', { key: 'size', short: true });
const shoeSize = field('shoeSize', 'Größe (EU)', { key: 'size', short: true });
const definitions = [frameNumber, brand, clothingSize, shoeSize];

const base = { _creationTime: 1, updatedAt: 1, childCount: 0, productCount: 0, eventCount: 0 };
const bikes = {
  ...base,
  _id: 'bikes',
  label: 'Fahrräder',
  translations: { en: 'Bikes' },
  fields: ['frameNumber', 'brand'],
  fieldList: [frameNumber, brand],
  childCount: 2,
  eventCount: 1,
};
const trekking = {
  ...base,
  _id: 'trekking',
  label: 'Trekkingräder',
  translations: {},
  parentCategory: 'bikes',
  fieldList: [frameNumber, brand],
  productCount: 3,
};
const trailers = {
  ...base,
  _id: 'trailers',
  label: 'Fahrradanhänger',
  translations: {},
  parentCategory: 'bikes',
  fields: [],
  fieldList: [],
};
const misc = { ...base, _id: 'misc', label: 'Sonstiges', translations: {}, fieldList: [] };

const mutations: Record<string, ReturnType<typeof vi.fn>> = {};
let categories: unknown[] = [];

beforeEach(() => {
  // jsdom has no ResizeObserver; checkbox and radio use it
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  for (const name of Object.keys(mutations)) delete mutations[name];
  categories = [bikes, trekking, trailers, misc];
  vi.mocked(useQuery).mockImplementation(((fn: unknown) => {
    const name = getFunctionName(fn);
    if (name === 'categories.listFields') return definitions;
    if (name === 'categories.listFieldsForAdmin') {
      return definitions.map((d) => ({ ...d, categoryCount: d === frameNumber ? 1 : 0 }));
    }
    return categories;
  }) as never);
  vi.mocked(useMutation).mockImplementation(((fn: unknown) => {
    const name = getFunctionName(fn);
    mutations[name] ??= vi.fn(async () => null);
    return mutations[name];
  }) as never);
});

const row = (name: string) => screen.getByTestId(`category-${name}`);
const openBikes = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder zeigen' }));

describe('AdminCategoriesPage', () => {
  it('shows main categories with their fields; sub-categories when opened', () => {
    render(<AdminCategoriesPage />);
    expect(within(row('Fahrräder')).getByText('Bikes · 2 Unterkategorien')).toBeInTheDocument();
    expect(within(row('Fahrräder')).getByText('Rahmennummer')).toBeInTheDocument();
    expect(within(row('Fahrräder')).getByText('0 Artikel · 1 Basar')).toBeInTheDocument();
    expect(screen.queryByTestId('category-Trekkingräder')).not.toBeInTheDocument();

    openBikes();
    expect(within(row('Trekkingräder')).getByText('Wie „Fahrräder“')).toBeInTheDocument();
    expect(within(row('Fahrradanhänger')).getByText('Keine')).toBeInTheDocument();
    expect(within(row('Sonstiges')).getByText('Keine')).toBeInTheDocument();
  });

  it('only offers to delete what nothing uses', () => {
    render(<AdminCategoriesPage />);
    openBikes();
    expect(screen.getByRole('button', { name: 'Löschen: Fahrräder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Löschen: Trekkingräder' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Löschen: Sonstiges' })).toBeEnabled();
  });

  it('keeps the last category', () => {
    categories = [misc];
    render(<AdminCategoriesPage />);
    expect(screen.getByRole('button', { name: 'Löschen: Sonstiges' })).toBeDisabled();
  });

  it('a sub-category takes the fields of its main category or picks its own', async () => {
    render(<AdminCategoriesPage />);
    openBikes();
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten: Trekkingräder' }));
    expect(
      screen.getByLabelText('Wie „Fahrräder“: Rahmennummer, Marke', { exact: false })
    ).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Rahmennummer/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Eigene Auswahl'));
    // The choice starts from the fields of the main category
    expect(screen.getByRole('checkbox', { name: /Rahmennummer/ })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Marke/ }));
    // Items use the category: the fields change for them
    expect(screen.getByText(/ändern sich für alle Artikel/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(mutations['categories.updateCategory']).toHaveBeenCalledWith({
        categoryId: 'trekking',
        label: 'Trekkingräder',
        translations: { en: undefined },
        parentCategory: 'bikes',
        fields: ['frameNumber'],
      })
    );
  });

  it('a main category picks its fields, one size at most', async () => {
    render(<AdminCategoriesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten: Sonstiges' }));
    expect(screen.queryByLabelText('Eigene Auswahl')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /^Größe$/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Größe \(EU\)/ }));
    expect(screen.getByRole('checkbox', { name: /^Größe$/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(mutations['categories.updateCategory']).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'misc', fields: ['shoeSize'] })
      )
    );
  });

  it('adds a sub-category right below its main category', async () => {
    render(<AdminCategoriesPage />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unterkategorie zu „Fahrräder“ hinzufügen' })
    );
    expect(screen.getByText('Neue Unterkategorie')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'fahrradanhänger' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(mutations['categories.createCategory']).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tandems' } });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(mutations['categories.createCategory']).toHaveBeenCalledWith({
        label: 'Tandems',
        translations: { en: undefined },
        parentCategory: 'bikes',
        fields: undefined,
      })
    );
  });

  it('keeps a category with sub-categories on top', () => {
    render(<AdminCategoriesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Bearbeiten: Fahrräder' }));
    expect(screen.getByText(/bleibt deshalb Hauptkategorie/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Gehört zu' })).toBeDisabled();
  });

  it('admins define the extra fields themselves', async () => {
    render(<AdminCategoriesPage />);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Zusatzfelder' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Zusatzfelder' }));
    await screen.findByTestId('field-Rahmennummer');
    expect(within(screen.getByTestId('field-Rahmennummer')).getByText('In 1 Kategorie'));
    expect(screen.getByRole('button', { name: 'Löschen: Rahmennummer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Löschen: Marke' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Feld hinzufügen' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Höhe ' } });
    fireEvent.change(screen.getByLabelText('Englischer Name'), { target: { value: 'Height' } });
    fireEvent.change(screen.getByLabelText('Beispiel im Eingabefeld'), {
      target: { value: 'z. B. 120 cm' },
    });
    fireEvent.click(screen.getByLabelText(/Kurzer Wert/));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(mutations['categories.saveField']).toHaveBeenCalledWith({
        fieldId: undefined,
        label: ' Höhe ',
        labelEn: 'Height',
        placeholder: 'z. B. 120 cm',
        placeholderEn: '',
        hint: '',
        hintEn: '',
        short: true,
      })
    );
  });
});
