import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import germany from '../../assets/postal-areas/DE.json';
import { combineMaps, positionOf, type PostalMapData } from '../../lib/postalMap';
import { PostalRegionMap, type PostalRegionMapProps } from './PostalRegionMap';

const germanMap = germany as PostalMapData;
const data = combineMaps([germanMap]);
const venue = positionOf(germanMap, '89231')!;

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

function renderMap(props: Partial<PostalRegionMapProps> = {}) {
  const onToggle = vi.fn();
  const view = render(
    <PostalRegionMap
      data={data}
      selected={new Set(['DE:890', 'DE:892'])}
      partial={new Set(['DE:732'])}
      onToggle={onToggle}
      venue={venue}
      venueLabel="Stadthalle"
      here={venue}
      circle={{ center: venue, km: 20 }}
      focus={{ center: venue, km: 20 }}
      {...props}
    />
  );
  const kind = (name: 'none' | 'selected' | 'partial') =>
    view.container.querySelector(`path[data-areas="${name}"]`) as SVGPathElement | null;
  return { ...view, onToggle, kind };
}

/** Where on screen an area's label point is, in the drawing as it rests */
function at(key: string) {
  const [left, top, width] = screen
    .getByRole('img')
    .getAttribute('viewBox')!
    .split(' ')
    .map(Number);
  const upp = width / (sizes.width * 1.8);
  const [x, y] = data.areas.find((area) => area.p === key)!.c;
  // The drawing reaches 40 % of the frame beyond each edge
  return { x: (x - left) / upp - sizes.width * 0.4, y: (y - top) / upp - sizes.height * 0.4 };
}
const areaD = (key: string) => data.areas.find((area) => area.p === key)!.d;

const pointer = (x: number, y: number) => ({
  pointerId: 1,
  pointerType: 'mouse',
  button: 0,
  clientX: x,
  clientY: y,
});

describe('PostalRegionMap (#304)', () => {
  it('draws the areas, the circle, the bazaar and the labels', () => {
    const { kind } = renderMap();
    expect(screen.getByRole('img', { name: 'Karte der Postleitzahlgebiete' })).toBeInTheDocument();
    // One path per kind of area, with the areas in view only
    expect(kind('selected')!.getAttribute('class')).toContain('fill-primary/45');
    expect(kind('selected')!.getAttribute('d')).toContain(areaD('DE:890'));
    expect(kind('none')!.getAttribute('d')).toContain(areaD('DE:893'));
    expect(kind('none')!.getAttribute('d')).not.toContain(areaD('DE:101'));
    expect(kind('partial')!.getAttribute('fill')).toBe('url(#postal-partial)');
    expect(kind('partial')!.getAttribute('d')).toContain(areaD('DE:732'));
    expect(screen.getByText('20 km')).toBeInTheDocument();
    expect(screen.getByText('Stadthalle')).toBeInTheDocument();
    // Zoomed in: towns and postal areas around Ulm
    expect(screen.getByText('Ulm')).toBeInTheDocument();
    expect(screen.getByText('© OpenStreetMap')).toBeInTheDocument();
  });

  it('toggles an area by click, not after dragging the map', () => {
    const { onToggle } = renderMap();
    const svg = screen.getByRole('img');
    const { x, y } = at('DE:893');
    fireEvent.pointerDown(svg, pointer(x, y));
    fireEvent.pointerUp(svg, pointer(x + 1, y));
    expect(onToggle).toHaveBeenCalledWith('DE:893');

    onToggle.mockClear();
    const before = svg.getAttribute('viewBox');
    fireEvent.pointerDown(svg, pointer(x, y));
    fireEvent.pointerMove(svg, pointer(160, 130));
    fireEvent.pointerUp(svg, pointer(160, 130));
    expect(onToggle).not.toHaveBeenCalled();
    expect(svg.getAttribute('viewBox')).not.toBe(before);
  });

  it('moves the drawing while dragging and draws it anew once let go', () => {
    renderMap();
    const svg = screen.getByRole('img');
    const before = svg.getAttribute('viewBox');
    fireEvent.pointerDown(svg, pointer(100, 100));
    fireEvent.pointerMove(svg, pointer(130, 110));
    // Moved on screen only: the large SVG stays as it is
    expect(svg.getAttribute('viewBox')).toBe(before);
    const [x, y] = svg.parentElement!.style.transform.match(/-?[\d.]+/g)!.map(Number);
    expect([Math.round(x), Math.round(y)]).toEqual([30, 10]);
    fireEvent.pointerUp(svg, pointer(130, 110));
    expect(svg.getAttribute('viewBox')).not.toBe(before);
    expect(svg.parentElement!.style.transform).toBe('');
  });

  it('zooms with two fingers', () => {
    renderMap();
    const svg = screen.getByRole('img');
    const width = () => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const start = width();
    const finger = (pointerId: number, x: number) => ({
      pointerId,
      pointerType: 'touch',
      isPrimary: pointerId === 1,
      clientX: x,
      clientY: 200,
    });
    fireEvent.pointerDown(svg, finger(1, 250));
    fireEvent.pointerDown(svg, finger(2, 350));
    fireEvent.pointerMove(svg, finger(2, 450));
    fireEvent.pointerUp(svg, finger(2, 450));
    fireEvent.pointerUp(svg, finger(1, 250));
    expect(width()).toBeCloseTo(start / 2);
  });

  it('zooms with Ctrl and the wheel, not with the wheel alone', async () => {
    const { container } = renderMap();
    const svg = screen.getByRole('img');
    const width = () => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const start = width();
    const frame = container.firstElementChild!;
    fireEvent.wheel(frame, { deltaY: 50 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(width()).toBe(start);
    fireEvent.wheel(frame, { deltaY: -50, ctrlKey: true });
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(width()).toBeLessThan(start);
  });

  it('names the area under the mouse', () => {
    const { container } = renderMap();
    const svg = screen.getByRole('img');
    const g893 = at('DE:893');
    fireEvent.pointerMove(svg, pointer(g893.x, g893.y));
    expect(
      screen.getByText(/PLZ 893… \(Deutschland\) · antippen zum Hinzufügen/)
    ).toBeInTheDocument();
    // With the names of its largest places, and drawn on top
    expect(screen.getByText('Günzburg, Burgau, Ichenhausen')).toBeInTheDocument();
    expect(container.querySelector('path.stroke-primary\\/70')!.getAttribute('d')).toBe(
      areaD('DE:893')
    );
    const g890 = at('DE:890');
    fireEvent.pointerMove(svg, pointer(g890.x, g890.y));
    expect(
      screen.getByText(/PLZ 890… \(Deutschland\) · antippen zum Entfernen/)
    ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Ganze Karte zeigen' }));
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
