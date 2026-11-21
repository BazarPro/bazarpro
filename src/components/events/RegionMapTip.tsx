import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { InfoTip } from '../ui/info-tip';
import { StorageImage } from '../ui/StorageImage';
import type { Id } from '../../lib/api/types';
import { REGION_IMAGE_HEIGHT, REGION_IMAGE_WIDTH } from '../../lib/regionImage';

/**
 * "Nur aus der Region" for a bazaar for its region (#304), as text that shows a map of it on
 * hover, focus or tap: a map says more than "PLZ 890…, 893…" to someone who does not know
 * the codes, which go into the caption. The picture was drawn when the organizer saved
 * the region; without one, only the text (then with the codes).
 */
export function RegionMapTip({
  children,
  image,
  codes,
  className,
}: {
  children: ReactNode;
  image?: Id<'_storage'>;
  /** "Nur aus PLZ 89…, 7322…", under the map */
  codes?: string;
  className?: string;
}) {
  const { t } = useTranslation('events');
  if (!image) return <>{children}</>;
  return (
    <InfoTip
      trigger={children}
      width={REGION_IMAGE_WIDTH + 14}
      bubbleClassName="p-1.5"
      className={className}
    >
      <StorageImage
        storageId={image}
        alt={t('registration.regionMap')}
        width={REGION_IMAGE_WIDTH}
        height={REGION_IMAGE_HEIGHT}
        className="block aspect-[8/5] h-auto w-full rounded-md bg-muted"
      />
      {codes && <span className="mt-1.5 block px-1 font-medium">{codes}</span>}
      <span className="mt-0.5 block px-1 text-[11px] text-muted-foreground">
        {t('registration.regionMapCaption')}
      </span>
    </InfoTip>
  );
}

/** The same map shown at once, e.g. to a seller from outside the region. */
export function RegionMapImage({
  image,
  className,
}: {
  image?: Id<'_storage'>;
  className?: string;
}) {
  const { t } = useTranslation('events');
  if (!image) return null;
  return (
    <StorageImage
      storageId={image}
      alt={t('registration.regionMap')}
      width={REGION_IMAGE_WIDTH}
      height={REGION_IMAGE_HEIGHT}
      className={
        className ?? 'block aspect-[8/5] h-auto w-full max-w-sm rounded-md border bg-muted'
      }
    />
  );
}
