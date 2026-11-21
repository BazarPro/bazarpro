import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { countryName } from '../../i18n/countries';
import {
  splitKey,
  unitsPerKm,
  type CombinedMap,
  type Point,
  type PostalArea,
} from '../../lib/postalMap';

/** What the map draws: the areas of one or more countries, see `combineMaps` */
export type MapData = Pick<
  CombinedMap,
  'bounds' | 'outline' | 'areas' | 'regions' | 'towns' | 'attribution'
>;

/** What the map shows in full: the circle around a point, or all of the map. */
export type MapFocus = { center: Point; km: number } | 'country';

interface View {
  /** Centre of the view in map units */
  x: number;
  y: number;
  /** Map units per screen pixel */
  upp: number;
}

interface Size {
  width: number;
  height: number;
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

type Gesture =
  | { kind: 'drag'; id: number; x: number; y: number; view: View; moved: boolean }
  /** Two fingers: `mid` from the frame's centre in pixels */
  | { kind: 'pinch'; distance: number; mid: { x: number; y: number }; view: View };

const DRAG_THRESHOLD = 5;
const ANIMATION_MS = 320;
/** Share of the frame drawn beyond each edge, so a drag shows map and no blank edge */
const OVERSCAN = 0.4;
/** How far a drawing may be stretched while zooming in before it is drawn anew */
const MAX_STRETCH = 2.5;
/** Quiet time after the last zoom by touchpad or wheel before the map is drawn sharp */
const WHEEL_SETTLE_MS = 160;

export interface PostalRegionMapProps {
  data: MapData;
  /** Keys of the areas, e.g. "DE:890" */
  selected: ReadonlySet<string>;
  partial: ReadonlySet<string>;
  onToggle: (key: string) => void;
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
}

/**
 * The postal code areas of the countries to pick a bazaar's region (#304): areas are picked
 * by tap or click, the circle shows the radius chosen beside the map. Drag to move; the
 * buttons, two fingers or Ctrl and the wheel zoom. Plain SVG without map tiles, so no
 * third party learns who looks at it.
 *
 * The SVG is large (hundreds of KB of paths), so it is drawn anew only once the map
 * rests: while it is dragged, zoomed or glides, a CSS transform moves the last drawing,
 * which is a bit larger than the frame for that.
 */
export const PostalRegionMap = memo(function PostalRegionMap({
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
}: PostalRegionMapProps) {
  const { t } = useTranslation('organizer');
  const frame = useRef<HTMLDivElement>(null);
  /** Wraps the SVG: a transform on the SVG itself makes Chrome paint all of it again */
  const layer = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const sizeRef = useRef(size);
  /** The view the SVG is drawn for; it changes only once the map rests */
  const [view, setView] = useState<View | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverAt = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** Where the frame is on screen, measured once until it may have moved */
  const frameBox = useRef<DOMRect | null>(null);
  const boxOfFrame = () => (frameBox.current ??= frame.current?.getBoundingClientRect() ?? null);
  const gesture = useRef<Gesture | null>(null);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      frameBox.current = null;
      sizeRef.current = { width: element.clientWidth, height: element.clientHeight };
      setSize(sizeRef.current);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Scrolling the page, or a box around the map, moves the frame on screen
  useEffect(() => {
    const forget = () => {
      frameBox.current = null;
    };
    window.addEventListener('scroll', forget, { capture: true, passive: true });
    window.addEventListener('resize', forget, { passive: true });
    return () => {
      window.removeEventListener('scroll', forget, { capture: true });
      window.removeEventListener('resize', forget);
    };
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
  const limits = useRef({ min: minUpp, max: maxUpp });
  limits.current = { min: minUpp, max: maxUpp };

  const focusKey =
    focus === 'country' ? 'country' : `${focus.center[0]},${focus.center[1]},${focus.km}`;
  const previousTarget = useRef<View | null>(null);
  const target = useMemo((): View | null => {
    if (!countryView) return null;
    let next = countryView;
    if (focus !== 'country') {
      const radius = Math.max(focus.km, 8) * unitsPerKm(focus.center) * 1.3;
      const upp = (2 * radius) / Math.min(size.width, size.height);
      next = {
        x: focus.center[0],
        y: focus.center[1],
        upp: Math.min(Math.max(upp, minUpp), countryView.upp),
      };
    }
    // The same view as before, e.g. once the neighbours' maps came, must not move the map
    // the user dragged away
    const previous = previousTarget.current;
    if (previous && previous.x === next.x && previous.y === next.y && previous.upp === next.upp) {
      return previous;
    }
    return next;
    // The focus as values: a new object with the same place must not move the map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryView, focusKey]);
  useEffect(() => {
    previousTarget.current = target;
  }, [target]);

  const drawnView = view ?? target;

  /**
   * Moving the map without React: `live` is the view on screen, `drawn` the one the SVG
   * is drawn for, `requested` the one last asked to be drawn.
   */
  const map = useMemo(() => {
    const live: { current: View | null } = { current: null };
    const drawn: { current: View | null } = { current: null };
    const requested: { current: View | null } = { current: null };
    const animation: { current: number | null } = { current: null };

    const show = (next: View) => {
      live.current = next;
      const element = layer.current;
      const from = drawn.current;
      if (!element || !from) return;
      const scale = from.upp / next.upp;
      const tx = (from.x - next.x) / next.upp;
      const ty = (from.y - next.y) / next.upp;
      element.style.transform =
        scale === 1 && tx === 0 && ty === 0 ? '' : `translate(${tx}px, ${ty}px) scale(${scale})`;
    };
    const draw = (next: View) => {
      requested.current = next;
      setView(next);
    };
    /** Whether the drawing still shows `next` whole and sharp enough */
    const fits = (next: View) => {
      const current = requested.current ?? drawn.current;
      return !!current && covers(current, next, sizeRef.current);
    };
    const moving = (on: boolean) => {
      // Its own layer while it moves: the GPU shifts it without painting the paths again
      if (layer.current) layer.current.style.willChange = on ? 'transform' : '';
    };
    const stop = () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = null;
    };
    /** Shows `next` at once, drawn anew where the drawing does not reach */
    const follow = (next: View) => {
      show(next);
      if (!fits(next)) draw(next);
    };
    /** The map rests at `next`: drawn sharp for it */
    const settle = (next: View) => {
      stop();
      show(next);
      draw(next);
      moving(false);
    };
    const clamp = (upp: number) => Math.min(Math.max(upp, limits.current.min), limits.current.max);
    return { live, drawn, animation, show, draw, fits, moving, stop, follow, settle, clamp };
  }, []);

  // The SVG is drawn for a new view: the transform now starts from there
  useLayoutEffect(() => {
    map.drawn.current = drawnView;
    if (!map.live.current) map.live.current = drawnView;
    if (map.live.current) map.show(map.live.current);
  }, [map, drawnView]);

  // Glide to the new focus, e.g. while the radius grows
  useEffect(() => {
    if (!target) return;
    const from = map.live.current;
    const there = from && from.x === target.x && from.y === target.y && from.upp === target.upp;
    if (!from || there || typeof requestAnimationFrame === 'undefined') {
      map.settle(target);
      return;
    }
    const keep = (next: View) => {
      if (!map.fits(next)) map.draw(envelope(next, target, sizeRef.current));
    };
    map.stop();
    keep(from);
    map.moving(true);
    // From the first frame on: its time may lie before now
    let start: number | undefined;
    const step = (now: number) => {
      start ??= now;
      const progress = Math.min(Math.max((now - start) / ANIMATION_MS, 0), 1);
      if (progress >= 1) {
        map.animation.current = null;
        map.settle(target);
        return;
      }
      const ease = 1 - (1 - progress) ** 3;
      // Zoom evenly on the log scale
      const next = {
        x: from.x + (target.x - from.x) * ease,
        y: from.y + (target.y - from.y) * ease,
        upp: Math.exp(Math.log(from.upp) + (Math.log(target.upp) - Math.log(from.upp)) * ease),
      };
      keep(next);
      map.show(next);
      map.animation.current = requestAnimationFrame(step);
    };
    map.animation.current = requestAnimationFrame(step);
    return map.stop;
  }, [map, target]);

  // A pinch on the touchpad, or Ctrl and the wheel, zooms; the plain wheel scrolls the page
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      const current = map.live.current;
      if (!(event.ctrlKey || event.metaKey) || !current) return;
      event.preventDefault();
      map.stop();
      map.moving(true);
      const box = element.getBoundingClientRect();
      const mx = event.clientX - box.left - box.width / 2;
      const my = event.clientY - box.top - box.height / 2;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const upp = map.clamp(current.upp * Math.exp(Math.max(Math.min(delta, 60), -60) * 0.01));
      // The point under the pointer stays there
      map.follow({
        x: current.x + mx * (current.upp - upp),
        y: current.y + my * (current.upp - upp),
        upp,
      });
      clearTimeout(timer);
      timer = setTimeout(() => map.live.current && map.settle(map.live.current), WHEEL_SETTLE_MS);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      clearTimeout(timer);
    };
  }, [map]);

  const fromCentre = (clientX: number, clientY: number) => {
    const box = boxOfFrame();
    return box
      ? { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 }
      : { x: 0, y: 0 };
  };
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const view = map.live.current;
    if (!a || !b || !view) return;
    const mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
    gesture.current = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y), mid, view };
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const view = map.live.current;
    if (!view || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // A new touch or click: no pointer of an earlier one whose end went elsewhere
    if (event.isPrimary) pointers.current.clear();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = {
        kind: 'drag',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        view,
        moved: false,
      };
    } else if (pointers.current.size === 2) {
      map.stop();
      map.moving(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setHovered(null);
      startPinch();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const current = gesture.current;
    if (current?.kind === 'pinch' && pointers.current.has(event.pointerId)) {
      const [a, b] = [...pointers.current.values()];
      const mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      const upp = map.clamp(
        (current.view.upp * current.distance) / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)
      );
      // The point between the fingers at the start stays between them
      map.follow({
        x: current.view.x + current.mid.x * current.view.upp - mid.x * upp,
        y: current.view.y + current.mid.y * current.view.upp - mid.y * upp,
        upp,
      });
      return;
    }
    if (current?.kind === 'drag' && current.id === event.pointerId) {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        current.moved = true;
        map.stop();
        map.moving(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setHovered(null);
      }
      if (current.moved) {
        map.follow({
          ...current.view,
          x: current.view.x - dx * current.view.upp,
          y: current.view.y - dy * current.view.upp,
        });
        return;
      }
    }
    if (event.pointerType !== 'mouse') return;
    // The tooltip follows the mouse without React; a render only for another area
    const box = boxOfFrame();
    if (box) {
      hoverAt.current = { x: event.clientX - box.left, y: event.clientY - box.top };
      placeTooltip(tooltip.current);
    }
    setHovered((event.target as Element).getAttribute?.('data-prefix') ?? null);
  };

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>, tap: boolean) => {
    const current = gesture.current;
    pointers.current.delete(event.pointerId);
    if (current?.kind === 'pinch') {
      const rest = [...pointers.current.entries()];
      if (rest.length === 1 && map.live.current) {
        // One finger stays: it drags on
        const [[id, point]] = rest;
        gesture.current = { kind: 'drag', id, ...point, view: map.live.current, moved: true };
      } else if (rest.length === 0) {
        gesture.current = null;
        if (map.live.current) map.settle(map.live.current);
      }
      return;
    }
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (current.moved) {
      if (map.live.current) map.settle(map.live.current);
      return;
    }
    const prefix = (event.target as Element).getAttribute?.('data-prefix');
    if (tap && prefix) onToggle(prefix);
  };

  const placeTooltip = useCallback((element: HTMLDivElement | null) => {
    tooltip.current = element;
    if (!element) return;
    element.style.left = `${hoverAt.current.x}px`;
    element.style.top = `${hoverAt.current.y}px`;
  }, []);

  const order = useMemo(() => labelOrder(data), [data]);
  const areaOrder = useMemo(
    () =>
      // Chosen areas first: they matter most
      [...order.areas].sort(
        (a, b) => Number(selected.has(b.p)) - Number(selected.has(a.p)) || b.s - a.s
      ),
    [order, selected]
  );
  const labels = useMemo(
    () =>
      drawnView && size.width
        ? placeLabels(order, areaOrder, data, drawnView, size, venue, circle)
        : [],
    [order, areaOrder, data, drawnView, size, venue, circle]
  );

  const upp = drawnView?.upp ?? 1;
  const px = (pixels: number) => pixels * upp;
  const fullWidth = size.width * (1 + 2 * OVERSCAN);
  const fullHeight = size.height * (1 + 2 * OVERSCAN);
  const viewBox = drawnView
    ? [
        drawnView.x - (fullWidth * upp) / 2,
        drawnView.y - (fullHeight * upp) / 2,
        fullWidth * upp,
        fullHeight * upp,
      ]
    : [0, 0, 1, 1];
  const circleRadius = circle ? circle.km * unitsPerKm(circle.center) : 0;
  // Not drawn again when only the hovered area changes
  const labelLayer = useMemo(
    () => (
      <g className="pointer-events-none">
        {labels.map((label) => (
          <MapLabel key={label.key} label={label} px={(pixels) => pixels * upp} />
        ))}
      </g>
    ),
    [labels, upp]
  );

  return (
    <div
      ref={frame}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:14px_14px] bg-muted/30 select-none',
        className
      )}
    >
      {drawnView && size.width > 0 && (
        <div
          ref={layer}
          className="absolute origin-center"
          style={{
            left: -size.width * OVERSCAN,
            top: -size.height * OVERSCAN,
            width: fullWidth,
            height: fullHeight,
          }}
        >
          <svg
            role="img"
            aria-label={t('region.mapLabel')}
            viewBox={viewBox.join(' ')}
            width={fullWidth}
            height={fullHeight}
            className="block touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => endPointer(event, true)}
            onPointerCancel={(event) => endPointer(event, false)}
            onPointerEnter={() => {
              frameBox.current = null;
            }}
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
            <MapShapes data={data} selected={selected} partial={partial} />
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
            {labelLayer}
            {here && (
              <g transform={`translate(${here[0]} ${here[1]})`} className="pointer-events-none">
                {/* A few pulses only: a running animation paints the whole SVG anew each frame */}
                <circle
                  r={px(16)}
                  className="fill-sky-500/25 animate-ping [animation-iteration-count:3] [transform-box:fill-box] [transform-origin:center]"
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
        </div>
      )}

      {hovered && (
        <div
          ref={placeTooltip}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
        >
          {areaName(hovered, t('region.areaTooltip', { prefix: splitKey(hovered).prefix }))}
          {' · '}
          {selected.has(hovered) ? t('region.areaRemove') : t('region.areaAdd')}
        </div>
      )}

      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border bg-card/95 shadow-sm backdrop-blur">
        <MapButton
          label={t('region.zoomIn')}
          onClick={() => {
            const current = map.live.current;
            if (current) map.settle({ ...current, upp: map.clamp(current.upp / 1.6) });
          }}
        >
          <Plus className="h-4 w-4" />
        </MapButton>
        <MapButton
          label={t('region.zoomOut')}
          onClick={() => {
            const current = map.live.current;
            if (current) map.settle({ ...current, upp: map.clamp(current.upp * 1.6) });
          }}
        >
          <Minus className="h-4 w-4" />
        </MapButton>
        <MapButton
          label={t('region.wholeMap')}
          onClick={() => countryView && map.settle(countryView)}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </MapButton>
      </div>
      <p className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-muted-foreground/80">
        {data.attribution}
      </p>
    </div>
  );
});

/** "PLZ 690… (Österreich)" for the key "AT:690". */
function areaName(key: string, label: string): string {
  return key.includes(':') ? `${label} (${countryName(splitKey(key).country)})` : label;
}

/** Whether a drawing for `drawn` shows `next` whole, and not stretched too far. */
function covers(drawn: View, next: View, size: Size): boolean {
  if (next.upp * MAX_STRETCH < drawn.upp) return false;
  const reach = 0.5 + OVERSCAN;
  return (
    Math.abs(next.x - drawn.x) + (size.width / 2) * next.upp <= size.width * reach * drawn.upp &&
    Math.abs(next.y - drawn.y) + (size.height / 2) * next.upp <= size.height * reach * drawn.upp
  );
}

/** A view whose drawing shows both views, for gliding from one to the other. */
function envelope(a: View, b: View, size: Size): View {
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const reach = 0.5 + OVERSCAN;
  const needed = (v: View) =>
    Math.max(
      (Math.abs(v.x - x) + (size.width / 2) * v.upp) / (size.width * reach),
      (Math.abs(v.y - y) + (size.height / 2) * v.upp) / (size.height * reach)
    );
  return { x, y, upp: Math.max(needed(a), needed(b), Math.min(a.upp, b.upp)) };
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
 * The country, its areas and borders; drawn again only when the choice changes, not
 * while the map moves. Clicks reach the map through `data-prefix`.
 */
const MapShapes = memo(function MapShapes({
  data,
  selected,
  partial,
}: {
  data: MapData;
  selected: ReadonlySet<string>;
  partial: ReadonlySet<string>;
}) {
  const regionBorders = useMemo(() => data.regions.map((region) => region.d).join(''), [data]);
  return (
    <>
      <path
        d={data.outline}
        className="fill-card stroke-foreground/10"
        strokeWidth={8}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <g>
        {data.areas.map((area) => (
          <AreaPath
            key={area.p}
            prefix={area.p}
            d={area.d}
            state={selected.has(area.p) ? 'selected' : partial.has(area.p) ? 'partial' : 'none'}
          />
        ))}
      </g>
      <path
        d={regionBorders}
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
    </>
  );
});

const AREA_CLASS = {
  selected: 'cursor-pointer stroke-foreground/12 fill-primary/45 hover:fill-primary/60',
  partial: 'cursor-pointer stroke-foreground/12 hover:opacity-80',
  none: 'cursor-pointer stroke-foreground/12 fill-card hover:fill-primary/15',
};

/** One area; drawn again only when its own state changes, e.g. while the radius grows. */
const AreaPath = memo(function AreaPath({
  prefix,
  d,
  state,
}: {
  prefix: string;
  d: string;
  state: keyof typeof AREA_CLASS;
}) {
  return (
    <path
      d={d}
      data-prefix={prefix}
      fill={state === 'partial' ? 'url(#postal-partial)' : undefined}
      className={AREA_CLASS[state]}
      strokeWidth={0.6}
      vectorEffect="non-scaling-stroke"
      strokeLinejoin="round"
    />
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

/** What the labels need of a map, worked out once per map. */
interface LabelOrder {
  /** Size of the middle area, for how far the map is zoomed in */
  median: number;
  areas: PostalArea[];
  /** Largest first */
  regions: PostalArea[];
}

function labelOrder(data: MapData): LabelOrder {
  const sizes = data.areas.map((area) => area.s).sort((a, b) => a - b);
  return {
    median: sizes[Math.floor(sizes.length / 2)] ?? 0,
    areas: data.areas,
    regions: [...data.regions].sort((a, b) => b.s - a.s),
  };
}

type Box = [number, number, number, number];

/** Boxes taken by labels, sorted into a grid so a new one is checked against its neighbours only. */
class TakenBoxes {
  private static readonly CELL = 64;
  private cells = new Map<number, Box[]>();

  private keys(box: Box): number[] {
    const cell = TakenBoxes.CELL;
    const keys: number[] = [];
    for (let cx = Math.floor(box[0] / cell); cx <= Math.floor(box[2] / cell); cx++) {
      for (let cy = Math.floor(box[1] / cell); cy <= Math.floor(box[3] / cell); cy++) {
        keys.push(cx * 100_003 + cy);
      }
    }
    return keys;
  }

  overlaps(box: Box): boolean {
    return this.keys(box).some((key) =>
      this.cells
        .get(key)
        ?.some(
          (other) =>
            box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]
        )
    );
  }

  add(box: Box) {
    for (const key of this.keys(box)) {
      const list = this.cells.get(key);
      if (list) list.push(box);
      else this.cells.set(key, [box]);
    }
  }
}

/**
 * Towns and postal codes that fit the view without covering each other: towns first by
 * size, then the areas (zoomed in) or the regions of two digits (zoomed out).
 */
function placeLabels(
  order: LabelOrder,
  areas: PostalArea[],
  data: MapData,
  view: View,
  size: Size,
  venue?: Point,
  circle?: { center: Point; km: number }
): Label[] {
  const { upp } = view;
  const toScreen = ([x, y]: Point) => [
    (x - view.x) / upp + size.width / 2,
    (y - view.y) / upp + size.height / 2,
  ];
  const taken = new TakenBoxes();
  const reserve = (box: Box) => {
    // Only what lies in the frame can be in the way
    if (box[2] > 0 && box[3] > 0 && box[0] < size.width && box[1] < size.height) {
      taken.add([
        Math.max(box[0], 0),
        Math.max(box[1], 0),
        Math.min(box[2], size.width),
        Math.min(box[3], size.height),
      ]);
    }
  };
  const result: Label[] = [];
  if (venue) {
    // The pin and its name stay readable
    const [vx, vy] = toScreen(venue);
    reserve([vx - 70, vy - 48, vx + 70, vy + 6]);
  }
  if (circle && circle.km > 0) {
    // The badge with the radius on top of the circle
    const [cx, cy] = toScreen([
      circle.center[0],
      circle.center[1] - circle.km * unitsPerKm(circle.center),
    ]);
    reserve([cx - 28, cy - 14, cx + 28, cy + 14]);
  }
  // The zoom buttons and the source
  reserve([size.width - 48, 0, size.width, 112]);
  reserve([size.width - 110, size.height - 18, size.width, size.height]);

  const place = (label: Label, width: number, height: number, anchorLeft: boolean) => {
    const [sx, sy] = toScreen([label.x, label.y]);
    const box: Box = anchorLeft
      ? [sx - 4, sy - height / 2 - 2, sx + width + 6, sy + height / 2 + 2]
      : [sx - width / 2 - 3, sy - height / 2 - 2, sx + width / 2 + 3, sy + height / 2 + 2];
    // Whole labels only, none cut off at the edge
    if (box[0] < 0 || box[1] < 0 || box[2] > size.width || box[3] > size.height) return;
    if (taken.overlaps(box)) return;
    taken.add(box);
    result.push(label);
  };

  const { median } = order;
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
    for (const area of areas) {
      if (area.s / upp < 30) continue;
      place(
        { key: `a${area.p}`, x: area.c[0], y: area.c[1], text: area.l ?? area.p, kind: 'area' },
        22,
        12,
        false
      );
    }
  } else {
    for (const region of order.regions) {
      if (region.s / upp < 26) continue;
      place(
        {
          key: `r${region.p}`,
          x: region.c[0],
          y: region.c[1],
          text: region.l ?? region.p,
          kind: 'region',
        },
        20,
        14,
        false
      );
    }
  }
  return result;
}
