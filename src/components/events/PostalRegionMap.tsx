import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { unitsPerKm, type Point, type PostalMapData } from '../../lib/postalMap';

/** What the map shows in full: the circle around a point, or the whole country. */
export type MapFocus = { center: Point; km: number } | 'country';

interface View {
  /** Centre of the view in map units */
  x: number;
  y: number;
  /** Map units per screen pixel */
  upp: number;
}

/** A label is drawn only where it does not cover another one. */
interface Label {
  key: string;
  x: number;
  y: number;
  text: string;
  kind: 'town' | 'region' | 'area';
  /** Rank 1 to 3 of a town */
  rank?: number;
}

const DRAG_THRESHOLD = 5;
const ANIMATION_MS = 320;

/**
 * The postal code areas of one country to pick a bazaar's region (#304): areas are picked
 * by tap or click, the circle shows the radius chosen beside the map. Drag to move, the
 * buttons zoom. Plain SVG without map tiles, so no third party learns who looks at it.
 */
export function PostalRegionMap({
  data,
  selected,
  partial,
  onToggle,
  venue,
  venueLabel,
  here,
  circle,
  focus,
  className,
}: {
  data: PostalMapData;
  selected: ReadonlySet<string>;
  partial: ReadonlySet<string>;
  onToggle: (prefix: string) => void;
  /** The bazaar's place */
  venue?: Point;
  venueLabel?: string;
  /** The user's current location */
  here?: Point;
  /** The radius around its centre */
  circle?: { center: Point; km: number };
  /** Changes move the view there */
  focus: MapFocus;
  className?: string;
}) {
  const { t } = useTranslation('organizer');
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [hovered, setHovered] = useState<{ prefix: string; x: number; y: number } | null>(null);
  const animation = useRef<number | null>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; id: number } | null>(
    null
  );

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const countryView = useMemo((): View | null => {
    if (!size.width || !size.height) return null;
    const [minX, minY, maxX, maxY] = data.bounds;
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      upp: Math.max((maxX - minX) / size.width, (maxY - minY) / size.height) * 1.06,
    };
  }, [data.bounds, size.width, size.height]);
  const minUpp = countryView ? Math.min(countryView.upp / 40, 4) : 1;
  const maxUpp = countryView ? countryView.upp * 1.6 : 1;

  const focusKey =
    focus === 'country' ? 'country' : `${focus.center[0]},${focus.center[1]},${focus.km}`;
  const target = useMemo((): View | null => {
    if (!countryView) return null;
    if (focus === 'country') return countryView;
    const radius = Math.max(focus.km, 8) * unitsPerKm(focus.center) * 1.3;
    const upp = (2 * radius) / Math.min(size.width, size.height);
    return {
      x: focus.center[0],
      y: focus.center[1],
      upp: Math.min(Math.max(upp, minUpp), countryView.upp),
    };
    // The focus as values: a new object with the same place must not move the map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryView, focusKey]);

  // Glide to the new focus, e.g. while the radius grows
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    if (!target) return;
    const from = viewRef.current;
    if (!from || typeof requestAnimationFrame === 'undefined') {
      setView(target);
      return;
    }
    // From the first frame on: its time may lie before now
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(Math.max((now - start) / ANIMATION_MS, 0), 1);
      const ease = 1 - (1 - progress) ** 3;
      // Zoom evenly on the log scale
      const upp = Math.exp(Math.log(from.upp) + (Math.log(target.upp) - Math.log(from.upp)) * ease);
      setView({
        x: from.x + (target.x - from.x) * ease,
        y: from.y + (target.y - from.y) * ease,
        upp,
      });
      animation.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    animation.current = requestAnimationFrame(step);
    return () => {
      if (animation.current) cancelAnimationFrame(animation.current);
    };
  }, [target]);

  const zoom = (factor: number) => {
    if (animation.current) cancelAnimationFrame(animation.current);
    setView((current) =>
      current
        ? { ...current, upp: Math.min(Math.max(current.upp * factor, minUpp), maxUpp) }
        : current
    );
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!view || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.current = { x: event.clientX, y: event.clientY, view, moved: false, id: event.pointerId };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (current && current.id === event.pointerId) {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        current.moved = true;
        if (animation.current) cancelAnimationFrame(animation.current);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setHovered(null);
      }
      if (current.moved) {
        setView({
          ...current.view,
          x: current.view.x - dx * current.view.upp,
          y: current.view.y - dy * current.view.upp,
        });
        return;
      }
    }
    const prefix = (event.target as Element).getAttribute?.('data-prefix');
    const box = frame.current?.getBoundingClientRect();
    if (prefix && box && event.pointerType === 'mouse') {
      setHovered({ prefix, x: event.clientX - box.left, y: event.clientY - box.top });
    } else if (hovered) {
      setHovered(null);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current || current.moved || current.id !== event.pointerId) return;
    const prefix = (event.target as Element).getAttribute?.('data-prefix');
    if (prefix) onToggle(prefix);
  };

  const shown = view ?? target;
  const upp = shown?.upp ?? 1;
  const viewBox = shown
    ? [
        shown.x - (size.width * upp) / 2,
        shown.y - (size.height * upp) / 2,
        size.width * upp,
        size.height * upp,
      ]
    : [0, 0, 1, 1];

  const labels = useMemo(
    () => (shown ? placeLabels(data, shown, size, selected, venue, circle) : []),
    [data, shown, size, selected, venue, circle]
  );
  const circleRadius = circle ? circle.km * unitsPerKm(circle.center) : 0;
  const px = (pixels: number) => pixels * upp;

  return (
    <div
      ref={frame}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:14px_14px] bg-muted/30 select-none',
        className
      )}
    >
      {shown && size.width > 0 && (
        <svg
          role="img"
          aria-label={t('region.mapLabel')}
          viewBox={viewBox.join(' ')}
          width={size.width}
          height={size.height}
          className="block touch-pan-y cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
          onPointerLeave={() => setHovered(null)}
        >
          <defs>
            <pattern
              id="postal-partial"
              patternUnits="userSpaceOnUse"
              width={px(7)}
              height={px(7)}
              patternTransform="rotate(45)"
            >
              <rect width={px(7)} height={px(7)} className="fill-card" />
              <rect width={px(3)} height={px(7)} className="fill-primary/45" />
            </pattern>
          </defs>
          <path
            d={data.outline}
            className="fill-card stroke-foreground/10"
            strokeWidth={8}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          <AreaLayer data={data} selected={selected} partial={partial} />
          <path
            d={data.regions.map((region) => region.d).join('')}
            className="pointer-events-none fill-none stroke-foreground/35"
            strokeWidth={1.1}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          <path
            d={data.outline}
            className="pointer-events-none fill-none stroke-foreground/50"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {circle && circle.km > 0 && (
            <g className="pointer-events-none">
              <circle
                cx={circle.center[0]}
                cy={circle.center[1]}
                r={circleRadius}
                className="fill-primary/5 stroke-primary"
                strokeWidth={2}
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
              />
              <g transform={`translate(${circle.center[0]} ${circle.center[1] - circleRadius})`}>
                <rect
                  x={px(-24)}
                  y={px(-11)}
                  width={px(48)}
                  height={px(22)}
                  rx={px(11)}
                  className="fill-primary"
                />
                <text
                  y={px(4)}
                  textAnchor="middle"
                  fontSize={px(12)}
                  fontWeight={600}
                  className="fill-primary-foreground"
                >
                  {t('region.km', { km: circle.km })}
                </text>
              </g>
            </g>
          )}
          <g className="pointer-events-none">
            {labels.map((label) => (
              <MapLabel key={label.key} label={label} px={px} />
            ))}
          </g>
          {here && (
            <g transform={`translate(${here[0]} ${here[1]})`} className="pointer-events-none">
              <circle
                r={px(16)}
                className="fill-sky-500/25 animate-ping [transform-box:fill-box] [transform-origin:center]"
              />
              <circle r={px(8)} className="fill-sky-500 stroke-white" strokeWidth={px(3)} />
            </g>
          )}
          {venue && (
            <g transform={`translate(${venue[0]} ${venue[1]})`} className="pointer-events-none">
              <ellipse rx={px(6)} ry={px(2.5)} className="fill-foreground/25" />
              <path
                transform={`scale(${upp}) translate(-12 -30)`}
                d="M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 30 12 30s12-9.5 12-18.3C24 5.2 18.6 0 12 0Z"
                className="fill-primary stroke-white"
                strokeWidth={2}
              />
              <circle cy={px(-18.5)} r={px(4.2)} className="fill-white" />
              {venueLabel && (
                <text
                  y={px(-38)}
                  textAnchor="middle"
                  fontSize={px(12)}
                  fontWeight={700}
                  className="fill-foreground stroke-card [paint-order:stroke]"
                  strokeWidth={px(4)}
                  strokeLinejoin="round"
                >
                  {venueLabel}
                </text>
              )}
            </g>
          )}
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
          style={{ left: hovered.x, top: hovered.y }}
        >
          {t('region.areaTooltip', { prefix: hovered.prefix })}
          {' · '}
          {selected.has(hovered.prefix) ? t('region.areaRemove') : t('region.areaAdd')}
        </div>
      )}

      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border bg-card/95 shadow-sm backdrop-blur">
        <MapButton label={t('region.zoomIn')} onClick={() => zoom(1 / 1.6)}>
          <Plus className="h-4 w-4" />
        </MapButton>
        <MapButton label={t('region.zoomOut')} onClick={() => zoom(1.6)}>
          <Minus className="h-4 w-4" />
        </MapButton>
        <MapButton
          label={t('region.wholeCountry')}
          onClick={() => {
            if (animation.current) cancelAnimationFrame(animation.current);
            if (countryView) setView(countryView);
          }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </MapButton>
      </div>
      <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted-foreground/80">
        {data.country === 'DE' ? '© OpenStreetMap' : '© GeoNames'}
      </p>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center text-foreground/80 transition-colors hover:bg-muted hover:text-foreground [&+&]:border-t"
    >
      {children}
    </button>
  );
}

/**
 * The areas; only drawn again when the choice changes, not while the map moves. Clicks
 * reach the map through `data-prefix`.
 */
const AreaLayer = memo(function AreaLayer({
  data,
  selected,
  partial,
}: {
  data: PostalMapData;
  selected: ReadonlySet<string>;
  partial: ReadonlySet<string>;
}) {
  return (
    <g>
      {data.areas.map((area) => {
        const isSelected = selected.has(area.p);
        return (
          <path
            key={area.p}
            d={area.d}
            data-prefix={area.p}
            fill={!isSelected && partial.has(area.p) ? 'url(#postal-partial)' : undefined}
            className={cn(
              'cursor-pointer stroke-foreground/12 transition-[fill] duration-150',
              isSelected
                ? 'fill-primary/45 hover:fill-primary/60'
                : partial.has(area.p)
                  ? 'hover:opacity-80'
                  : 'fill-card hover:fill-primary/15'
            )}
            strokeWidth={0.6}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
});

function MapLabel({ label, px }: { label: Label; px: (pixels: number) => number }) {
  if (label.kind === 'town') {
    const size = label.rank === 1 ? 12.5 : label.rank === 2 ? 11.5 : 10.5;
    return (
      <g transform={`translate(${label.x} ${label.y})`}>
        <circle r={px(2.6)} className="fill-foreground/70" />
        <text
          x={px(5)}
          y={px(4)}
          fontSize={px(size)}
          fontWeight={label.rank === 1 ? 600 : 500}
          className="fill-foreground/85 stroke-card [paint-order:stroke]"
          strokeWidth={px(3.5)}
          strokeLinejoin="round"
        >
          {label.text}
        </text>
      </g>
    );
  }
  return (
    <text
      x={label.x}
      y={label.y + px(4)}
      textAnchor="middle"
      fontSize={px(label.kind === 'region' ? 13 : 10.5)}
      fontWeight={label.kind === 'region' ? 700 : 600}
      className={cn(
        'stroke-card [paint-order:stroke] tabular-nums',
        label.kind === 'region' ? 'fill-foreground/55' : 'fill-foreground/45'
      )}
      strokeWidth={px(3)}
      strokeLinejoin="round"
    >
      {label.text}
    </text>
  );
}

/**
 * Towns and postal codes that fit the view without covering each other: towns first by
 * size, then the areas (zoomed in) or the regions of two digits (zoomed out).
 */
function placeLabels(
  data: PostalMapData,
  view: View,
  size: { width: number; height: number },
  selected: ReadonlySet<string>,
  venue?: Point,
  circle?: { center: Point; km: number }
): Label[] {
  const { upp } = view;
  const toScreen = ([x, y]: Point) => [
    (x - view.x) / upp + size.width / 2,
    (y - view.y) / upp + size.height / 2,
  ];
  const taken: [number, number, number, number][] = [];
  const result: Label[] = [];
  if (venue) {
    // The pin and its name stay readable
    const [vx, vy] = toScreen(venue);
    taken.push([vx - 70, vy - 48, vx + 70, vy + 6]);
  }
  if (circle && circle.km > 0) {
    // The badge with the radius on top of the circle
    const [cx, cy] = toScreen([
      circle.center[0],
      circle.center[1] - circle.km * unitsPerKm(circle.center),
    ]);
    taken.push([cx - 28, cy - 14, cx + 28, cy + 14]);
  }
  // The zoom buttons and the source
  taken.push(
    [size.width - 48, 0, size.width, 112],
    [size.width - 110, size.height - 18, size.width, size.height]
  );
  const place = (label: Label, width: number, height: number, anchorLeft: boolean) => {
    const [sx, sy] = toScreen([label.x, label.y]);
    const box: [number, number, number, number] = anchorLeft
      ? [sx - 4, sy - height / 2 - 2, sx + width + 6, sy + height / 2 + 2]
      : [sx - width / 2 - 3, sy - height / 2 - 2, sx + width / 2 + 3, sy + height / 2 + 2];
    // Whole labels only, none cut off at the edge
    if (box[0] < 0 || box[1] < 0 || box[2] > size.width || box[3] > size.height) return;
    if (
      taken.some(
        (other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]
      )
    ) {
      return;
    }
    taken.push(box);
    result.push(label);
  };

  const sizes = data.areas.map((area) => area.s).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 0;
  const detailed = median / upp > 46;
  const townRank = upp < (median / 46) * 1.8 ? 3 : upp < (median / 46) * 4 ? 2 : 1;

  for (const town of data.towns) {
    if (town.r > townRank) continue;
    const fontPx = town.r === 1 ? 12.5 : 11.5;
    place(
      {
        key: `t${town.n}${town.c[0]}`,
        x: town.c[0],
        y: town.c[1],
        text: town.n,
        kind: 'town',
        rank: town.r,
      },
      town.n.length * fontPx * 0.56 + 6,
      fontPx + 2,
      true
    );
  }
  if (detailed) {
    // Chosen areas first: they matter most
    const areas = [...data.areas].sort(
      (a, b) => Number(selected.has(b.p)) - Number(selected.has(a.p)) || b.s - a.s
    );
    for (const area of areas) {
      if (area.s / upp < 30) continue;
      place(
        { key: `a${area.p}`, x: area.c[0], y: area.c[1], text: area.p, kind: 'area' },
        22,
        12,
        false
      );
    }
  } else {
    for (const region of [...data.regions].sort((a, b) => b.s - a.s)) {
      if (region.s / upp < 26) continue;
      place(
        { key: `r${region.p}`, x: region.c[0], y: region.c[1], text: region.p, kind: 'region' },
        20,
        14,
        false
      );
    }
  }
  return result;
}
