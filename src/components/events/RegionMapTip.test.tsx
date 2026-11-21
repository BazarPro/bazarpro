import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../lib/api/types';
import { RegionMapTip } from './RegionMapTip';

vi.mock('../ui/StorageImage', () => ({
  StorageImage: ({ storageId, alt }: { storageId: string; alt: string }) => (
    <img src={`/files/${storageId}`} alt={alt} />
  ),
}));

const image = 'f1' as Id<'_storage'>;

describe('RegionMapTip (#304)', () => {
  it('is plain text without a picture', () => {
    render(<RegionMapTip>Nur aus PLZ 89…</RegionMapTip>);
    expect(screen.getByText('Nur aus PLZ 89…').tagName).not.toBe('BUTTON');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the map of the region while the mouse rests on the codes', () => {
    render(<RegionMapTip image={image}>Nur aus PLZ 89…</RegionMapTip>);
    const codes = screen.getByRole('button', { name: 'Nur aus PLZ 89…' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.pointerEnter(codes, { pointerType: 'mouse' });
    expect(screen.getByRole('img', { name: 'Karte der Region des Basars' })).toHaveAttribute(
      'src',
      '/files/f1'
    );
    fireEvent.pointerLeave(codes, { pointerType: 'mouse' });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('opens on a tap', () => {
    render(
      <RegionMapTip image={image} codes="Nur aus PLZ 89…">
        Nur aus der Region
      </RegionMapTip>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nur aus der Region' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Nur aus PLZ 89….*gehören zur Region/);
  });
});
