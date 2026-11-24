import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';
import type { Doc } from '../../../../lib/api/types';
import { getFunctionName } from '../../../../lib/api/functions';
import { useQuery } from '../../../../lib/api/react';
import { EditEventCategories } from './EditEventCategories';

vi.mock('../../../../lib/api/react', () => ({ useQuery: vi.fn() }));

const category = (id: string, label: string, parentCategory?: string) =>
  ({ _id: id, label, parentCategory, translations: {} }) as unknown as Doc<'categories'>;
const list = [
  category('bikes', 'Fahrräder'),
  category('cargo', 'Lastenräder', 'bikes'),
  category('trailers', 'Fahrradanhänger', 'bikes'),
  category('misc', 'Sonstiges'),
];

let chosen: string[] = [];
let services: string[] = [];
function Form({ categories = [] as string[] }) {
  const methods = useForm({ defaultValues: { categories, services: [] as string[] } });
  chosen = methods.watch('categories');
  services = methods.watch('services');
  return (
    <FormProvider {...methods}>
      <EditEventCategories categoryList={list} />
    </FormProvider>
  );
}

beforeEach(() => {
  // The admins' list of services (#256)
  vi.mocked(useQuery).mockImplementation(((fn: unknown) =>
    getFunctionName(fn) === 'services.list'
      ? [{ name: 'Parkplatz', nameEn: 'Parking' }, { name: 'Hüpfburg' }]
      : undefined) as never);
  // jsdom has no ResizeObserver; the checkbox uses it
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

describe('EditEventCategories', () => {
  it('one row per main category; opened, its sub-categories', () => {
    render(<Form />);
    expect(screen.getByText('0 von 2 Hauptkategorien gewählt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lastenräder')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder' }));
    expect(screen.getByLabelText('Lastenräder')).not.toBeChecked();
  });

  it('a main category with all sub-categories is stored as itself', () => {
    render(<Form />);
    fireEvent.click(screen.getByLabelText('Fahrräder'));
    expect(chosen).toEqual(['bikes']);
    expect(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder' })).toHaveTextContent(
      'alle'
    );

    // One sub-category less: the others are stored, the main category is half chosen
    fireEvent.click(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder' }));
    fireEvent.click(screen.getByLabelText('Fahrradanhänger'));
    expect(chosen).toEqual(['cargo']);
    expect(screen.getByLabelText('Fahrräder')).toHaveAttribute('data-state', 'indeterminate');
    expect(screen.getByText('1 von 2')).toBeInTheDocument();

    // Half chosen: a click chooses all, the next one none
    fireEvent.click(screen.getByLabelText('Fahrräder'));
    expect(chosen).toEqual(['bikes']);
    fireEvent.click(screen.getByLabelText('Fahrräder'));
    expect(chosen).toEqual([]);
  });

  it('all and none at once; a stored main category shows all its sub-categories', () => {
    render(<Form categories={['bikes']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder' }));
    expect(screen.getByLabelText('Lastenräder')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    expect(chosen).toEqual(['bikes', 'misc']);
    fireEvent.click(screen.getByRole('button', { name: 'Keine' }));
    expect(chosen).toEqual([]);
  });

  it('offers the services of the admins’ list', () => {
    render(<Form />);
    fireEvent.click(screen.getByText('Hüpfburg'));
    expect(services).toEqual(['Hüpfburg']);
    fireEvent.click(screen.getByText('Parkplatz'));
    expect(services).toEqual(['Hüpfburg', 'Parkplatz']);
  });
});
