import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';
import type { Doc } from '../../../../lib/api/types';
import { EditEventCategories } from './EditEventCategories';

const category = (id: string, label: string, parentCategory?: string) =>
  ({ _id: id, label, parentCategory, translations: {} }) as unknown as Doc<'categories'>;
const list = [
  category('bikes', 'Fahrräder'),
  category('cargo', 'Lastenräder', 'bikes'),
  category('trailers', 'Fahrradanhänger', 'bikes'),
  category('misc', 'Sonstiges'),
];

let chosen: string[] = [];
function Form({ categories = [] as string[] }) {
  const methods = useForm({ defaultValues: { categories, services: [] } });
  chosen = methods.watch('categories');
  return (
    <FormProvider {...methods}>
      <EditEventCategories categoryList={list} />
    </FormProvider>
  );
}

describe('EditEventCategories', () => {
  it('shows main categories and their sub-categories only when opened', () => {
    render(<Form />);
    expect(screen.getByText('Fahrräder')).toBeInTheDocument();
    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.queryByText('Lastenräder')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder' }));
    expect(screen.getByText('Lastenräder')).toBeInTheDocument();
  });

  it('a main category comes and goes with its sub-categories', () => {
    render(<Form />);
    fireEvent.click(screen.getByText('Fahrräder'));
    expect(chosen).toEqual(['bikes', 'cargo', 'trailers']);
    expect(screen.getByText('2/2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Unterkategorien von Fahrräder' }));
    fireEvent.click(screen.getByText('Fahrradanhänger'));
    expect(chosen).toEqual(['bikes', 'cargo']);

    // Not all chosen: a click chooses the rest, the next one clears the group
    const badge = screen.getByText('1/2').parentElement as HTMLElement;
    fireEvent.click(within(badge).getByText('Fahrräder'));
    expect(chosen).toEqual(['bikes', 'cargo', 'trailers']);
    fireEvent.click(within(badge).getByText('Fahrräder'));
    expect(chosen).toEqual([]);

    fireEvent.click(screen.getByText('Sonstiges'));
    expect(chosen).toEqual(['misc']);
  });
});
