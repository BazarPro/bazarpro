import { compactRegion, regionSize, type PostalCodesByCountry } from '../shared/postalCodes';
import {
  boxOf,
  combineMaps,
  loadAllPostalMaps,
  positionOf,
  selectionFromRegion,
  townRankAt,
  unitsPerKm,
  type CombinedMap,
  type Point,
  type PostalArea,
} from './postalMap';

/** Size of the picture in CSS pixels; it is drawn at twice that for sharp screens */
export const REGION_IMAGE_WIDTH = 360;
export const REGION_IMAGE_HEIGHT = 225;
const DENSITY = 2;
/** Room around the region, as a share of its size */
const MARGIN = 0.18;
/** The smallest stretch of land shown, so a single area still shows its neighbours */
const MIN_SPAN_KM = 30;

// The light theme of the map (src/styles/index.css): the picture looks the same everywhere
const COLORS = {
  water: '#eef0f4',
  land: '#ffffff',
  border: 'rgba(10, 10, 10, 0.12)',
  region: 'rgba(10, 10, 10, 0.35)',
  outline: 'rgba(10, 10, 10, 0.5)',
  chosen: 'rgba(32, 78, 195, 0.45)',
  primary: '#204ec3',
  text: 'rgba(10, 10, 10, 0.85)',
  code: 'rgba(16, 40, 110, 0.85)',
  halo: '#ffffff',
};

export interface RegionImageInput {
  region: PostalCodesByCountry;
  /** The bazaar's postal code and country, for its pin */
  venueCode?: string | null;
  venueCountry?: string | null;
}

/** What the picture shows: the same region and venue give the same picture. */
export function regionImageKey({ region, venueCode, venueCountry }: RegionImageInput): string {
  return JSON.stringify([compactRegion(region), venueCode?.trim() ?? '', venueCountry || 'DE']);
}

/** The stored postal codes of a bazaar's features. */
export function postalCodesOf(features: object | null | undefined): PostalCodesByCountry {
  return (
    (features as { allowedPostalCodes?: PostalCodesByCountry } | null | undefined)
      ?.allowedPostalCodes ?? {}
  );
}

/**
 * The picture of the region to save with a bazaar (#304): drawn anew when the region or
 * the bazaar's place changed, dropped with the region. Only a picture: saving goes on
 * without it, and an outdated one goes rather than stays.
 */
export async function regionImageChange<FileId>(
  next: RegionImageInput,
  stored: (RegionImageInput & { image?: FileId }) | null | undefined,
  upload: (file: File) => Promise<FileId>,
  draw: (input: RegionImageInput) => Promise<File | undefined> = drawRegionImage
): Promise<{ regionMapImage?: FileId; clearRegionMapImage?: boolean }> {
  const hadImage = stored?.image !== undefined && stored.image !== null;
  if (!regionSize(next.region)) return hadImage ? { clearRegionMapImage: true } : {};
  if (hadImage && regionImageKey(next) === regionImageKey(stored)) return {};
  try {
    const file = await draw(next);
    if (file) return { regionMapImage: await upload(file) };
  } catch (error) {
    console.error('Failed to draw the picture of the region:', error);
  }
  return hadImage ? { clearRegionMapImage: true } : {};
}

/**
 * A picture of a bazaar's region (#304) for sellers: the chosen postal code areas with their
 * neighbours, towns and the bazaar. Drawn in the browser when the organizer saves, from the
 * same maps as the region settings, and stored with the bazaar, so sellers need not load
 * the maps. Undefined where the browser cannot draw it (or in tests).
 */
export async function drawRegionImage(input: RegionImageInput): Promise<File | undefined> {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return undefined;
  if (!regionSize(input.region)) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = REGION_IMAGE_WIDTH * DENSITY;
  canvas.height = REGION_IMAGE_HEIGHT * DENSITY;
  const context = canvas.getContext('2d');
  if (!context) return undefined;

  const data = combineMaps(await loadAllPostalMaps());
  const venueMap = data.maps.find((map) => map.country === (input.venueCountry || 'DE'));
  const venue =
    venueMap && input.venueCode?.trim() ? positionOf(venueMap, input.venueCode) : undefined;
  if (!paint(context, data, input.region, venue)) return undefined;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85)
  );
  if (!blob) return undefined;
  // Safari makes PNG instead of WebP; the server takes both
  const type = blob.type || 'image/png';
  return new File([blob], `region.${type === 'image/webp' ? 'webp' : 'png'}`, { type });
}

interface View {
  minX: number;
  minY: number;
  /** Map units per CSS pixel of the picture */
  upp: number;
}

/** The view showing the chosen areas and the venue with some room around them. */
function frame(areas: PostalArea[], venue: Point | undefined): View {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  for (const area of areas) {
    if (area.d) {
      const [x0, y0, x1, y1] = boxOf(area);
      add(x0, y0);
      add(x1, y1);
    } else {
      add(...area.c);
    }
  }
  if (venue) add(...venue);
  const center: Point = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const minSpan = MIN_SPAN_KM * unitsPerKm(center);
  const width = Math.max(box[2] - box[0], minSpan) * (1 + 2 * MARGIN);
  const height = Math.max(box[3] - box[1], minSpan) * (1 + 2 * MARGIN);
  const upp = Math.max(width / REGION_IMAGE_WIDTH, height / REGION_IMAGE_HEIGHT);
  return {
    minX: center[0] - (REGION_IMAGE_WIDTH * upp) / 2,
    minY: center[1] - (REGION_IMAGE_HEIGHT * upp) / 2,
    upp,
  };
}

/** Draws the picture; false when the region has no area on the maps. */
function paint(
  context: CanvasRenderingContext2D,
  data: CombinedMap,
  region: PostalCodesByCountry,
  venue: Point | undefined
): boolean {
  const selection = selectionFromRegion(data, region);
  const chosen = data.areas.filter(
    (area) => selection.areas.has(area.p) || selection.partial.has(area.p)
  );
  if (!chosen.length) return false;
  const view = frame(chosen, venue);
  const maxX = view.minX + REGION_IMAGE_WIDTH * view.upp;
  const maxY = view.minY + REGION_IMAGE_HEIGHT * view.upp;
  const inView = (area: PostalArea) => {
    if (!area.d) return false;
    const box = boxOf(area);
    return box[2] >= view.minX && box[0] <= maxX && box[3] >= view.minY && box[1] <= maxY;
  };
  const toPixel = ([x, y]: Point): Point => [
    (x - view.minX) / view.upp,
    (y - view.minY) / view.upp,
  ];

  context.save();
  context.scale(DENSITY, DENSITY);
  context.fillStyle = COLORS.water;
  context.fillRect(0, 0, REGION_IMAGE_WIDTH, REGION_IMAGE_HEIGHT);

  // Map units from here on; lines keep their width in pixels
  context.save();
  context.scale(1 / view.upp, 1 / view.upp);
  context.translate(-view.minX, -view.minY);
  context.lineJoin = 'round';
  const line = (pixels: number) => pixels * view.upp;
  const outline = new Path2D(data.outline);
  context.fillStyle = COLORS.land;
  context.fill(outline, 'evenodd');

  const all = new Path2D();
  const full = new Path2D();
  const partial = new Path2D();
  for (const area of data.areas) {
    if (!inView(area)) continue;
    const path = new Path2D(area.d);
    all.addPath(path);
    if (selection.areas.has(area.p)) full.addPath(path);
    else if (selection.partial.has(area.p)) partial.addPath(path);
  }
  context.fillStyle = COLORS.chosen;
  context.fill(full, 'evenodd');
  const stripes = hatch(context);
  if (stripes) {
    // The pattern repeats in pixels, not in map units
    stripes.setTransform(new DOMMatrix([view.upp, 0, 0, view.upp, 0, 0]));
    context.fillStyle = stripes;
    context.fill(partial, 'evenodd');
  }
  context.strokeStyle = COLORS.border;
  context.lineWidth = line(0.6);
  context.stroke(all);
  const regions = new Path2D();
  for (const part of data.regions) if (inView(part)) regions.addPath(new Path2D(part.d));
  context.strokeStyle = COLORS.region;
  context.lineWidth = line(1);
  context.stroke(regions);
  context.strokeStyle = COLORS.outline;
  context.lineWidth = line(1.4);
  context.stroke(outline);
  context.restore();

  const labels = new Labels();
  if (venue) {
    const [x, y] = toPixel(venue);
    drawPin(context, x, y);
    labels.take([x - 9, y - 24, x + 9, y + 2]);
  }
  labels.take([
    REGION_IMAGE_WIDTH - 130,
    REGION_IMAGE_HEIGHT - 14,
    REGION_IMAGE_WIDTH,
    REGION_IMAGE_HEIGHT,
  ]);

  const center: Point = [
    view.minX + (REGION_IMAGE_WIDTH * view.upp) / 2,
    view.minY + (REGION_IMAGE_HEIGHT * view.upp) / 2,
  ];
  const rank = townRankAt(view.upp / unitsPerKm(center));
  for (const town of data.towns) {
    if (town.r > rank) continue;
    const [x, y] = toPixel(town.c);
    const font = `${town.r === 1 ? 600 : 500} ${town.r <= 2 ? 11.5 : 10.5}px system-ui, sans-serif`;
    context.font = font;
    const width = context.measureText(town.n).width;
    if (!labels.fits([x - 3, y - 7, x + width + 8, y + 7])) continue;
    context.fillStyle = COLORS.text;
    context.beginPath();
    context.arc(x, y, 2.2, 0, Math.PI * 2);
    context.fill();
    text(context, town.n, x + 5, y + 4, COLORS.text);
  }
  // The codes of the chosen areas, where they fit
  context.font = '700 10px system-ui, sans-serif';
  for (const area of [...chosen].sort((a, b) => b.s - a.s)) {
    if (area.s / view.upp < 26) continue;
    const [x, y] = toPixel(area.c);
    const code = area.l ?? area.p;
    const width = context.measureText(code).width;
    if (!labels.fits([x - width / 2 - 2, y - 7, x + width / 2 + 2, y + 6])) continue;
    context.textAlign = 'center';
    text(context, code, x, y + 3.5, COLORS.code);
    context.textAlign = 'start';
  }

  context.font = '400 8px system-ui, sans-serif';
  context.textAlign = 'end';
  text(
    context,
    data.attribution,
    REGION_IMAGE_WIDTH - 4,
    REGION_IMAGE_HEIGHT - 4,
    'rgba(10,10,10,0.55)'
  );
  context.restore();
  return true;
}

/** Text with a light halo, readable on every fill. */
function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  color: string
) {
  context.lineJoin = 'round';
  context.lineWidth = 3;
  context.strokeStyle = COLORS.halo;
  context.strokeText(value, x, y);
  context.fillStyle = color;
  context.fillText(value, x, y);
}

/** The stripes of an area only partly in the region, as on the map. */
function hatch(context: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 8;
  const pen = tile.getContext('2d');
  if (!pen) return null;
  pen.fillStyle = COLORS.land;
  pen.fillRect(0, 0, 8, 8);
  pen.strokeStyle = COLORS.chosen;
  pen.lineWidth = 3;
  pen.beginPath();
  for (const offset of [-8, 0, 8]) {
    pen.moveTo(offset, 8);
    pen.lineTo(offset + 8, 0);
  }
  pen.stroke();
  return context.createPattern(tile, 'repeat');
}

function drawPin(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x - 8, y - 20);
  context.scale(16 / 24, 20 / 30);
  const pin = new Path2D(
    'M12 0C5.4 0 0 5.2 0 11.7 0 20.5 12 30 12 30s12-9.5 12-18.3C24 5.2 18.6 0 12 0Z'
  );
  context.fillStyle = COLORS.primary;
  context.fill(pin);
  context.strokeStyle = COLORS.halo;
  context.lineWidth = 2.5;
  context.stroke(pin);
  context.beginPath();
  context.arc(12, 11.5, 4.2, 0, Math.PI * 2);
  context.fillStyle = COLORS.halo;
  context.fill();
  context.restore();
}

type Box = [number, number, number, number];

/** Labels drawn only where they cover no other one and stay whole in the picture. */
class Labels {
  private boxes: Box[] = [];

  take(box: Box) {
    this.boxes.push(box);
  }

  fits(box: Box): boolean {
    if (box[0] < 0 || box[1] < 0 || box[2] > REGION_IMAGE_WIDTH || box[3] > REGION_IMAGE_HEIGHT) {
      return false;
    }
    const free = this.boxes.every(
      (other) =>
        box[0] >= other[2] || box[2] <= other[0] || box[1] >= other[3] || box[3] <= other[1]
    );
    if (free) this.boxes.push(box);
    return free;
  }
}
