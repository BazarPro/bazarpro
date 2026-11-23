import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../lib/api/types';
import { RegionMapLink } from './RegionMap';

vi.mock('../ui/StorageImage', () => ({
  StorageImage: ({ storageId, alt }: { storageId: string; alt: string }) => (
    <img src={`/files/${storageId}`} alt={alt} />
  ),
}));

const image = 'f1' as Id<'_storage'>;

describe('RegionMapLink (#304)', () => {
  it('is plain text without a picture', () => {
    render(<RegionMapLink>Nur aus PLZ 89…</RegionMapLink>);
    expect(screen.getByText('Nur aus PLZ 89…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the map visibly and opens it large with the codes', () => {
    render(
      <RegionMapLink image={image} codes="Nur aus PLZ 89…">
        Nur aus der Region
      </RegionMapLink>
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Karte ansehen' }));
    const dialog = screen.getByRole('dialog', { name: 'Region des Basars' });
    expect(dialog).toHaveTextContent(/Nur aus PLZ 89….*gehören zur Region/);
    expect(screen.getByRole('img', { name: 'Karte der Region des Basars' })).toHaveAttribute(
      'src',
      '/files/f1'
    );
  });
});
