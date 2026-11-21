import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LocateFixed, MapPin, MapPinned, X } from 'lucide-react';
import { InfoTip } from '../../../../components/ui/info-tip';
import { Switch } from '../../../../components/ui/switch';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { FieldError } from '../../../../components/ui/field-error';
import { Skeleton } from '../../../../components/ui/skeleton';
import { PostalRegionMap, type MapFocus } from '../../../../components/events/PostalRegionMap';
import {
  areaKey,
  combineMaps,
  keysWithin,
  loadAllPostalMaps,
  loadPostalMap,
  positionOf,
  project,
  regionFromSelection,
  selectionFromRegion,
  type CombinedMap,
  type Point,
} from '../../../../lib/postalMap';
import {
  compactRegion,
  parseTypedCode,
  regionSize,
  type PostalCodesByCountry,
} from '../../../../shared/postalCodes';
import { COUNTRIES, type Country } from '../../../../shared/constants';
import { cn } from '../../../../lib/utils';

/** Radius chosen when the region is switched on and the bazaar's place is known */
export const DEFAULT_RADIUS_KM = 20;
const MAX_RADIUS_KM = 150;
const CHIPS_SHOWN = 10;
/** Quiet time on the slider before its areas are stored */
const RADIUS_SETTLE_MS = 250;

function asCountry(value: string | undefined): Country {
  return COUNTRIES.find((code) => code === value) ?? 'DE';
}

/**
 * The maps of all countries as one, loaded while the region is on. With `first`, its map
 * shows on its own at once and the neighbours follow (Germany alone is half of the data);
 * `complete` tells when all are there.
 */
function usePostalMaps(enabled: boolean, first: Country | undefined) {
  const [state, setState] = useState<{ data?: CombinedMap; complete?: boolean; failed?: boolean }>(
    {}
  );
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const failed = () => current && setState({ failed: true });
    if (first) {
      loadPostalMap(first).then(
        (map) =>
          current && setState((state) => (state.complete ? state : { data: combineMaps([map]) })),
        failed
      );
    }
    loadAllPostalMaps().then(
      (maps) => current && setState({ data: combineMaps(maps), complete: true }),
      failed
    );
    return () => {
      current = false;
    };
  }, [enabled, first]);
  return state;
}

/**
 * Only sellers from the bazaar's region join on their own (#304): the organizer picks
 * postal code areas on a map, by a radius around the bazaar or their own location and by
 * tapping single areas. The map holds every country of the app, so a region near a border
 * reaches across it. Invitations and the access code still let anyone in, so exceptions
 * stay possible. A switch row inside the registration settings.
 */
export function EditEventRegion() {
  const { t } = useTranslation('organizer');
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext();
  const enabled = !!useWatch({ control, name: 'features.regionOnly' });
  const watchedRegion = useWatch({ control, name: 'features.allowedPostalCodes' }) as
    | PostalCodesByCountry
    | undefined;
  const region = useMemo(() => watchedRegion ?? {}, [watchedRegion]);
  const count = regionSize(region);
  const venueCode = (useWatch({ control, name: 'address.postalCode' }) as string) ?? '';
  const home = asCountry((useWatch({ control, name: 'address.country' }) as string) || 'DE');
  const venueName = (useWatch({ control, name: 'location' }) as string) ?? '';
  // With the bazaar's place known the map shows its surroundings, so its own country
  // suffices at first; without, it shows all countries at once
  const { data, complete, failed } = usePostalMaps(enabled, venueCode.trim() ? home : undefined);

  const [radiusKm, setRadiusKm] = useState(0);
  const [centerMode, setCenterMode] = useState<'venue' | 'here'>('venue');
  const [here, setHere] = useState<Point>();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string>();
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string>();
  const [showAllChips, setShowAllChips] = useState(false);
  const [focusOverride, setFocusOverride] = useState<MapFocus>();

  const venue = useMemo(() => {
    const map = data?.maps.find((candidate) => candidate.country === home);
    return map && venueCode ? positionOf(map, venueCode) : undefined;
  }, [data, venueCode, home]);
  const center = centerMode === 'here' && here ? here : venue;
  const selection = useMemo(
    () => (data ? selectionFromRegion(data, region) : undefined),
    [data, region]
  );

  const store = (next: PostalCodesByCountry) =>
    setValue('features.allowedPostalCodes', next, { shouldDirty: true, shouldValidate: true });
  /** Stores the chosen areas; countries whose map is not there yet keep their codes */
  const storeAreas = (map: CombinedMap, areas: ReadonlySet<string>, finer?: string[]) => {
    const next = regionFromSelection(map, areas, finer);
    for (const country of COUNTRIES) {
      if (region[country] && !map.maps.some((loaded) => loaded.country === country)) {
        next[country] = region[country];
      }
    }
    store(compactRegion(next));
  };

  /** The areas after moving the circle: what the old one chose goes, what the new one covers comes. */
  const circleAreas = useCallback(
    (
      base: ReadonlySet<string>,
      from: { center?: Point; km: number },
      to: { center?: Point; km: number }
    ) => {
      if (!data) return undefined;
      const before = new Set(from.center ? keysWithin(data, from.center, from.km) : []);
      const after = to.center ? keysWithin(data, to.center, to.km) : [];
      const areas = new Set([...base].filter((area) => !before.has(area)));
      for (const area of after) areas.add(area);
      return areas;
    },
    [data]
  );
  const applyCircle = (
    from: { center?: Point; km: number },
    to: { center?: Point; km: number }
  ) => {
    if (!selection) return;
    const areas = circleAreas(draftAreas ?? selection.areas, from, to);
    if (data && areas) storeAreas(data, areas, selection.finer);
  };

  // While the slider moves, its circle and areas show on the map only; they are stored,
  // and the whole event checked, once it rests
  const [draftKm, setDraftKm] = useState<number>();
  const draftAreas = useMemo(
    () =>
      draftKm === undefined || !selection
        ? undefined
        : circleAreas(selection.areas, { center, km: radiusKm }, { center, km: draftKm }),
    [circleAreas, selection, center, radiusKm, draftKm]
  );
  const shownKm = draftKm ?? radiusKm;
  const draftTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const commitDraft = useRef(() => {});
  commitDraft.current = () => {
    clearTimeout(draftTimer.current);
    if (draftKm === undefined) return;
    if (data && selection && draftAreas) {
      storeAreas(data, draftAreas, selection.finer);
    }
    setRadiusKm(draftKm);
    setDraftKm(undefined);
  };
  useEffect(() => () => clearTimeout(draftTimer.current), []);
  const changeRadius = (km: number) => {
    setDraftKm(km);
    setFocusOverride(undefined);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => commitDraft.current(), RADIUS_SETTLE_MS);
  };

  // Switched on for the first time: a circle around the bazaar shows at once what happens
  const started = useRef(count > 0);
  useEffect(() => {
    // The circle may reach across the border: it waits for the neighbours' maps
    if (!enabled || started.current || !data || !complete || !venue) return;
    started.current = true;
    setRadiusKm(DEFAULT_RADIUS_KM);
    store(regionFromSelection(data, new Set(keysWithin(data, venue, DEFAULT_RADIUS_KM))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the map is there
  }, [enabled, data, complete, venue]);

  const focus = useMemo(
    (): MapFocus =>
      focusOverride ?? (center ? { center, km: shownKm || DEFAULT_RADIUS_KM } : 'country'),
    [focusOverride, center, shownKm]
  );
  const circle = useMemo(
    () => (center && shownKm > 0 ? { center, km: shownKm } : undefined),
    [center, shownKm]
  );

  const toggle = (key: string) => {
    if (!data || !selection) return;
    commitDraft.current();
    const areas = new Set(draftAreas ?? selection.areas);
    if (areas.has(key)) areas.delete(key);
    else areas.add(key);
    // A finer prefix inside the area is covered by it, or goes with it
    const finer = selection.finer.filter((code) => !code.startsWith(key));
    storeAreas(data, areas, finer);
  };

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const onToggle = useCallback((prefix: string) => toggleRef.current(prefix), []);

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateError(t('region.locateUnavailable'));
      return;
    }
    setLocating(true);
    setLocateError(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = project(position.coords.longitude, position.coords.latitude);
        setHere(point);
        setFocusOverride(undefined);
        commitDraft.current();
        if (shownKm > 0) applyCircle({ center, km: shownKm }, { center: point, km: shownKm });
        setCenterMode('here');
      },
      () => {
        setLocating(false);
        setLocateError(t('region.locateDenied'));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  };

  const chooseCenter = (mode: 'venue' | 'here') => {
    if (mode === 'here' && !here) {
      locate();
      return;
    }
    const next = mode === 'here' ? here : venue;
    commitDraft.current();
    if (shownKm > 0) applyCircle({ center, km: shownKm }, { center: next, km: shownKm });
    setFocusOverride(undefined);
    setCenterMode(mode);
  };

  const addManual = () => {
    const typed = parseTypedCode(manual, home);
    const map = typed && data?.maps.find((candidate) => candidate.country === typed.country);
    if (!typed || !map || typed.digits.length > map.digits) {
      setManualError(t('region.manualInvalid'));
      return;
    }
    setManualError(undefined);
    setManual('');
    store(
      compactRegion({
        ...region,
        [typed.country]: [...(region[typed.country] ?? []), typed.digits],
      })
    );
  };

  const remove = (country: Country, prefix: string) =>
    store(
      compactRegion({
        ...region,
        [country]: (region[country] ?? []).filter((code) => code !== prefix),
      })
    );

  const clear = () => {
    clearTimeout(draftTimer.current);
    setDraftKm(undefined);
    store({});
    setRadiusKm(0);
  };

  const error = (errors.features as { allowedPostalCodes?: { message?: string } } | undefined)
    ?.allowedPostalCodes?.message;
  const shownAreas = draftAreas ?? selection?.areas;
  const areaCount = selection && shownAreas ? shownAreas.size + selection.partial.size : 0;
  const chips = COUNTRIES.flatMap((country) =>
    (region[country] ?? []).map((prefix) => ({ country, prefix }))
  );
  // The country shows once the region leaves the bazaar's own
  const abroad = chips.some((chip) => chip.country !== home);
  const chipName = ({ country, prefix }: { country: Country; prefix: string }) =>
    abroad ? `${country} ${prefix}` : prefix;
  const shownChips = showAllChips ? chips : chips.slice(0, CHIPS_SHOWN);

  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <MapPinned className="h-4 w-4" />
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Label htmlFor="feature-regionOnly" className="cursor-pointer font-medium">
            {t('region.title')}
          </Label>
          <InfoTip>{t('region.intro')}</InfoTip>
        </div>
        <Controller
          name="features.regionOnly"
          control={control}
          render={({ field }) => (
            <Switch
              id="feature-regionOnly"
              checked={!!field.value}
              onCheckedChange={(checked: boolean | string) => field.onChange(!!checked)}
            />
          )}
        />
      </div>
      {enabled && (
        <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200 sm:pl-11">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label={t('region.center')}
              className="flex rounded-lg border bg-muted/40 p-0.5"
            >
              <CenterButton
                active={centerMode === 'venue' || !here}
                disabled={!venue}
                onClick={() => chooseCenter('venue')}
                title={venue ? undefined : t('region.venueUnknown')}
              >
                <MapPin className="h-3.5 w-3.5" /> {t('region.centerVenue')}
              </CenterButton>
              <CenterButton
                active={centerMode === 'here' && !!here}
                onClick={() => chooseCenter('here')}
                loading={locating}
              >
                <LocateFixed className="h-3.5 w-3.5" /> {t('region.centerHere')}
              </CenterButton>
            </div>
          </div>
          {locateError && <p className="text-xs text-destructive">{locateError}</p>}
          {!venue && data && !here && (
            <p className="text-xs text-muted-foreground">{t('region.venueUnknownHint')}</p>
          )}

          {data && selection ? (
            <PostalRegionMap
              data={data}
              selected={shownAreas ?? selection.areas}
              partial={selection.partial}
              onToggle={onToggle}
              venue={venue}
              venueLabel={venueName.trim() || t('region.yourBazaar')}
              here={here}
              circle={circle}
              focus={focus}
              className="h-[300px] sm:h-[380px]"
            />
          ) : failed ? (
            <p className="text-sm text-destructive">{t('region.mapFailed')}</p>
          ) : (
            <Skeleton className="h-[300px] w-full rounded-xl sm:h-[380px]" />
          )}

          <div className="flex items-center gap-3">
            <Label htmlFor="region-radius" className="shrink-0 text-sm font-medium">
              {t('region.radius')}
            </Label>
            <input
              id="region-radius"
              type="range"
              min={0}
              max={MAX_RADIUS_KM}
              step={5}
              value={shownKm}
              disabled={!center || !complete}
              title={center ? undefined : t('region.venueUnknownHint')}
              onChange={(event) => changeRadius(Number(event.target.value))}
              onPointerUp={() => commitDraft.current()}
              onKeyUp={() => commitDraft.current()}
              onBlur={() => commitDraft.current()}
              className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
              {shownKm > 0 ? t('region.km', { km: shownKm }) : t('region.radiusOff')}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
              <span
                className={cn('text-sm', count ? 'font-medium' : 'text-muted-foreground')}
                data-testid="region-summary"
              >
                {count ? t('region.chosen', { count: areaCount }) : t('region.summaryEmpty')}
              </span>
              {count > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={clear}>
                  {t('region.clear')}
                </Button>
              )}
            </div>
            {count > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t('region.chosenCodes')}>
                {shownChips.map((chip) => (
                  <li
                    key={areaKey(chip.country, chip.prefix)}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium tabular-nums text-primary"
                  >
                    {t('region.prefix', { prefix: chipName(chip) })}
                    <button
                      type="button"
                      onClick={() => remove(chip.country, chip.prefix)}
                      aria-label={t('region.removePrefix', { prefix: chipName(chip) })}
                      className="rounded-full p-0.5 hover:bg-primary/15"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {chips.length > CHIPS_SHOWN && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setShowAllChips(!showAllChips)}
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {showAllChips
                        ? t('region.fewer')
                        : t('region.more', { count: chips.length - CHIPS_SHOWN })}
                    </button>
                  </li>
                )}
              </ul>
            )}
            <div className="flex max-w-sm gap-2">
              <Input
                aria-label={t('region.manual')}
                placeholder={t('region.manualPlaceholder')}
                inputMode="numeric"
                value={manual}
                onChange={(event) => {
                  setManual(event.target.value);
                  setManualError(undefined);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    // Not the wizard's "next"
                    event.preventDefault();
                    addManual();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addManual} disabled={!manual.trim()}>
                {t('region.manualAdd')}
              </Button>
            </div>
            {manualError && <FieldError>{manualError}</FieldError>}
            {error && <FieldError>{error}</FieldError>}
          </div>
        </div>
      )}
    </div>
  );
}

function CenterButton({
  active,
  disabled,
  loading,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled || loading}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
        loading && 'animate-pulse'
      )}
    >
      {children}
    </button>
  );
}
