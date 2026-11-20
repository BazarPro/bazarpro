import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Hand, LocateFixed, MapPin, MapPinned, Ruler, X } from 'lucide-react';
import { FormSection } from '../../../../components/ui/form-section';
import { Switch } from '../../../../components/ui/switch';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { CountrySelect } from '../../../../components/ui/country-select';
import { FieldError } from '../../../../components/ui/field-error';
import { Skeleton } from '../../../../components/ui/skeleton';
import { PostalRegionMap, type MapFocus } from '../../../../components/events/PostalRegionMap';
import {
  areasWithin,
  loadPostalMap,
  positionOf,
  prefixesFromSelection,
  project,
  selectionFromPrefixes,
  type Point,
  type PostalMapData,
} from '../../../../lib/postalMap';
import { compactPrefixes, formatPrefixes, postalCodeDigits } from '../../../../shared/postalCodes';
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

/** The map of a country, loaded while the region is on. */
function usePostalMap(country: Country, enabled: boolean) {
  const [state, setState] = useState<{ country: Country; data?: PostalMapData; failed?: boolean }>({
    country,
  });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    loadPostalMap(country).then(
      (data) => current && setState({ country, data }),
      () => current && setState({ country, failed: true })
    );
    return () => {
      current = false;
    };
  }, [country, enabled]);
  return state.country === country ? state : { country };
}

/**
 * Only sellers from the bazaar's region join on their own (#304): the organizer picks
 * postal code areas of one country on a map, by a radius around the bazaar or their own
 * location and by tapping single areas. Invitations and the access code still let anyone
 * in, so exceptions stay possible.
 */
export function EditEventRegion() {
  const { t } = useTranslation('organizer');
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext();
  const enabled = !!useWatch({ control, name: 'features.regionOnly' });
  const watchedPrefixes = useWatch({ control, name: 'features.allowedPostalCodes' }) as
    | string[]
    | undefined;
  const prefixes = useMemo(() => watchedPrefixes ?? [], [watchedPrefixes]);
  const country = asCountry(useWatch({ control, name: 'features.postalCodeCountry' }) as string);
  const venueCode = (useWatch({ control, name: 'address.postalCode' }) as string) ?? '';
  const venueCountry = useWatch({ control, name: 'address.country' }) as string | undefined;
  const venueName = (useWatch({ control, name: 'location' }) as string) ?? '';
  const { data, failed } = usePostalMap(country, enabled);

  const [radiusKm, setRadiusKm] = useState(0);
  const [centerMode, setCenterMode] = useState<'venue' | 'here'>('venue');
  const [here, setHere] = useState<Point>();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string>();
  const [manual, setManual] = useState('');
  const [manualError, setManualError] = useState<string>();
  const [showAllChips, setShowAllChips] = useState(false);
  const [focusOverride, setFocusOverride] = useState<MapFocus>();

  const venue = useMemo(
    () =>
      data && asCountry(venueCountry || 'DE') === country && venueCode
        ? positionOf(data, venueCode)
        : undefined,
    [data, venueCode, venueCountry, country]
  );
  const center = centerMode === 'here' && here ? here : venue;
  const selection = useMemo(
    () => (data ? selectionFromPrefixes(data, prefixes) : undefined),
    [data, prefixes]
  );

  const store = (next: string[]) =>
    setValue('features.allowedPostalCodes', next, { shouldDirty: true, shouldValidate: true });

  /** The areas after moving the circle: what the old one chose goes, what the new one covers comes. */
  const circleAreas = useCallback(
    (
      base: ReadonlySet<string>,
      from: { center?: Point; km: number },
      to: { center?: Point; km: number }
    ) => {
      if (!data) return undefined;
      const before = new Set(from.center ? areasWithin(data, from.center, from.km) : []);
      const after = to.center ? areasWithin(data, to.center, to.km) : [];
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
    if (data && areas) store(prefixesFromSelection(data, areas, selection.finer));
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
      store(prefixesFromSelection(data, draftAreas, selection.finer));
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
  const started = useRef(prefixes.length > 0);
  useEffect(() => {
    if (!enabled || started.current || !data || !venue) return;
    started.current = true;
    setRadiusKm(DEFAULT_RADIUS_KM);
    store(prefixesFromSelection(data, new Set(areasWithin(data, venue, DEFAULT_RADIUS_KM))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the map is there
  }, [enabled, data, venue]);

  const focus = useMemo(
    (): MapFocus =>
      focusOverride ?? (center ? { center, km: shownKm || DEFAULT_RADIUS_KM } : 'country'),
    [focusOverride, center, shownKm]
  );
  const circle = useMemo(
    () => (center && shownKm > 0 ? { center, km: shownKm } : undefined),
    [center, shownKm]
  );

  const toggle = (prefix: string) => {
    if (!data || !selection) return;
    commitDraft.current();
    const areas = new Set(draftAreas ?? selection.areas);
    if (areas.has(prefix)) areas.delete(prefix);
    else areas.add(prefix);
    // A finer prefix inside the area is covered by it, or goes with it
    const finer = selection.finer.filter((code) => !code.startsWith(prefix));
    store(prefixesFromSelection(data, areas, finer));
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
    const digits = postalCodeDigits(manual);
    if (
      !digits ||
      !data ||
      digits.length > data.digits ||
      /[^\d\s-]/i.test(manual.replace(/^L-/i, ''))
    ) {
      setManualError(t('region.manualInvalid', { digits: data?.digits ?? 5 }));
      return;
    }
    setManualError(undefined);
    setManual('');
    store(compactPrefixes([...prefixes, digits]));
  };

  const remove = (prefix: string) => store(prefixes.filter((code) => code !== prefix));

  const changeCountry = (next: Country) => {
    setValue('features.postalCodeCountry', next, { shouldDirty: true });
    clearTimeout(draftTimer.current);
    setDraftKm(undefined);
    store([]);
    setRadiusKm(0);
    setCenterMode('venue');
    setFocusOverride(undefined);
  };

  const error = (errors.features as { allowedPostalCodes?: { message?: string } } | undefined)
    ?.allowedPostalCodes?.message;
  const shownAreas = draftAreas ?? selection?.areas;
  const areaCount = selection && shownAreas ? shownAreas.size + selection.partial.size : 0;
  const shownChips = showAllChips ? prefixes : prefixes.slice(0, CHIPS_SHOWN);

  return (
    <FormSection
      icon={MapPinned}
      title={t('region.title')}
      description={t('region.intro')}
      action={
        <Controller
          name="features.regionOnly"
          control={control}
          render={({ field }) => (
            <Switch
              id="feature-regionOnly"
              aria-label={t('region.title')}
              className="ml-auto"
              checked={!!field.value}
              onCheckedChange={(checked: boolean | string) => {
                field.onChange(!!checked);
                if (checked && !prefixes.length) {
                  setValue('features.postalCodeCountry', asCountry(venueCountry || 'DE'));
                }
              }}
            />
          )}
        />
      }
    >
      {enabled && (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          <ol className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            {(
              [
                [MapPin, 'region.step1'],
                [Ruler, 'region.step2'],
                [Hand, 'region.step3'],
              ] as const
            ).map(([Icon, key], index) => (
              <li key={key} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {index + 1}
                </span>
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="leading-snug">{t(key)}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1 space-y-1.5 sm:max-w-56">
              <Label htmlFor="postalCodeCountry">{t('region.country')}</Label>
              <CountrySelect
                id="postalCodeCountry"
                value={country}
                onChange={(event) => changeCountry(asCountry(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">{t('region.center')}</span>
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
          </div>
          {locateError && <p className="text-xs text-destructive">{locateError}</p>}
          {!venue && data && !here && (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              {t('region.venueUnknownHint')}
            </p>
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
              className="h-[340px] sm:h-[420px]"
            />
          ) : failed ? (
            <p className="text-sm text-destructive">{t('region.mapFailed')}</p>
          ) : (
            <Skeleton className="h-[340px] w-full rounded-xl sm:h-[420px]" />
          )}

          <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="region-radius" className="flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-muted-foreground" aria-hidden />
                {t('region.radius')}
              </Label>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-primary">
                {shownKm > 0 ? t('region.km', { km: shownKm }) : t('region.radiusOff')}
              </span>
            </div>
            <input
              id="region-radius"
              type="range"
              min={0}
              max={MAX_RADIUS_KM}
              step={5}
              value={shownKm}
              disabled={!center || !data}
              onChange={(event) => changeRadius(Number(event.target.value))}
              onPointerUp={() => commitDraft.current()}
              onKeyUp={() => commitDraft.current()}
              onBlur={() => commitDraft.current()}
              className="mt-3 h-2 w-full cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>0</span>
              <span>{t('region.km', { km: 50 })}</span>
              <span>{t('region.km', { km: 100 })}</span>
              <span>{t('region.km', { km: MAX_RADIUS_KM })}</span>
            </div>
            {!center && (
              <p className="mt-2 text-xs text-muted-foreground">{t('region.radiusNeedsCenter')}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {prefixes.length
                  ? t('region.chosen', { count: areaCount })
                  : t('region.nothingChosen')}
              </span>
              {prefixes.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearTimeout(draftTimer.current);
                    setDraftKm(undefined);
                    store([]);
                    setRadiusKm(0);
                  }}
                >
                  {t('region.clear')}
                </Button>
              )}
            </div>
            {prefixes.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label={t('region.chosenCodes')}>
                {shownChips.map((prefix) => (
                  <li
                    key={prefix}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium tabular-nums text-primary"
                  >
                    {t('region.prefix', { prefix })}
                    <button
                      type="button"
                      onClick={() => remove(prefix)}
                      aria-label={t('region.removePrefix', { prefix })}
                      className="rounded-full p-0.5 hover:bg-primary/15"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {prefixes.length > CHIPS_SHOWN && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setShowAllChips(!showAllChips)}
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                    >
                      {showAllChips
                        ? t('region.fewer')
                        : t('region.more', { count: prefixes.length - CHIPS_SHOWN })}
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

          <p
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              prefixes.length
                ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                : 'bg-muted text-muted-foreground'
            )}
            data-testid="region-summary"
          >
            {prefixes.length
              ? t('region.summary', { codes: formatPrefixes(prefixes, 8) })
              : t('region.summaryEmpty')}
          </p>
        </div>
      )}
    </FormSection>
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
