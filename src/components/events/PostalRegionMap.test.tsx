import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import germany from '../../assets/postal-areas/DE.json';
import { positionOf, type PostalMapData } from '../../lib/postalMap';
import { PostalRegionMap } from './PostalRegionMap';

const data = germany as PostalMapData;
const venue = positionOf(data, '89231')!;

// jsdom lays nothing out: the map gets its size from here
const sizes = vi.hoisted(() => ({ width: 600, height: 400 }));
const descriptors = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => sizes.width,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => sizes.height,
  });
});
afterAll(() => {
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
  }
});

function renderMap(props: Partial<Parameters<typeof PostalRegionMap>[0]> = {}) {
  const onToggle = vi.fn();
  const view = render(
    <PostalRegionMap
      data={data}
      selected={new Set(['890', '892'])}
      partial={new Set(['732'])}
      onToggle={onToggle}
      venue={venue}
      venueLabel="Stadthalle"
      here={venue}
      circle={{ center: venue, km: 20 }}
      focus={{ center: venue, km: 20 }}
      {...props}
    />
  );
  const area = (prefix: string) =>
    view.container.querySelector(`path[data-prefix="${prefix}"]`) as SVGPathElement;
  return { ...view, onToggle, area };
}

const pointer = (x: number, y: number) => ({
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  clientX: x,
  clientY: y,
});

describe('PostalRegionMap (#304)', () => {
  it('draws the areas, the circle, the bazaar and the labels', () => {
    const { area, container } = renderMap();
    expect(screen.getByRole('img', { name: 'Karte der Postleitzahlgebiete' })).toBeInTheDocument();
    expect(container.querySelectorAll('path[data-prefix]')).toHaveLength(data.areas.length);
    expect(area('890').getAttribute('class')).toContain('fill-primary/45');
    expect(area('732').getAttribute('fill')).toBe('url(#postal-partial)');
    expect(screen.getByText('20 km')).toBeInTheDocument();
    expect(screen.getByText('Stadthalle')).toBeInTheDocument();
    // Zoomed in: towns and postal areas around Ulm
    expect(screen.getByText('Ulm')).toBeInTheDocument();
    expect(screen.getByText('© OpenStreetMap')).toBeInTheDocument();
  });

  it('toggles an area by click, not after dragging the map', () => {
    const { area, onToggle } = renderMap();
    const svg = screen.getByRole('img');
    fireEvent.pointerDown(area('893'), pointer(100, 100));
    fireEvent.pointerUp(area('893'), pointer(101, 100));
    expect(onToggle).toHaveBeenCalledWith('893');

    onToggle.mockClear();
    const before = svg.getAttribute('viewBox');
    fireEvent.pointerDown(area('893'), pointer(100, 100));
    fireEvent.pointerMove(svg, pointer(160, 130));
    fireEvent.pointerUp(svg, pointer(160, 130));
    expect(onToggle).not.toHaveBeenCalled();
    expect(svg.getAttribute('viewBox')).not.toBe(before);
  });

  it('names the area under the mouse', () => {
    const { area } = renderMap();
    fireEvent.pointerMove(area('893'), pointer(200, 200));
    expect(screen.getByText(/PLZ 893… · antippen zum Hinzufügen/)).toBeInTheDocument();
    fireEvent.pointerMove(area('890'), pointer(210, 200));
    expect(screen.getByText(/PLZ 890… · antippen zum Entfernen/)).toBeInTheDocument();
    fireEvent.pointerLeave(screen.getByRole('img'));
    expect(screen.queryByText(/PLZ 890…/)).not.toBeInTheDocument();
  });

  it('zooms with the buttons and shows the whole country', async () => {
    renderMap({ here: undefined, circle: undefined });
    const svg = screen.getByRole('img');
    const width = () => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const start = width();
    fireEvent.click(screen.getByRole('button', { name: 'Vergrößern' }));
    expect(width()).toBeLessThan(start);
    fireEvent.click(screen.getByRole('button', { name: 'Verkleinern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verkleinern' }));
    expect(width()).toBeGreaterThan(start);
    fireEvent.click(screen.getByRole('button', { name: 'Ganzes Land zeigen' }));
    // The country: regions of two digits instead of single areas
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(width()).toBeGreaterThan(5000);
    expect(screen.getByText('Berlin')).toBeInTheDocument();
  });

  it('glides to a new focus', async () => {
    const { rerender, onToggle } = renderMap();
    const svg = screen.getByRole('img');
    const before = svg.getAttribute('viewBox');
    rerender(
      <PostalRegionMap
        data={data}
        selected={new Set()}
        partial={new Set()}
        onToggle={onToggle}
        focus="country"
      />
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
    expect(svg.getAttribute('viewBox')).not.toBe(before);
    // The whole country, with its largest towns only
    expect(Number(svg.getAttribute('viewBox')!.split(' ')[2])).toBeGreaterThan(5000);
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.queryByText('Neu-Ulm')).not.toBeInTheDocument();
  });
});
