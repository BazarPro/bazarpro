import { Check, Lock } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { ItemKind } from '../../../../../components/illustrations/ItemIllustrations';
import { Button } from '../../../../../components/ui/button';
import { ImageUpload } from '../../../../../components/ui/ImageUpload';
import { Label } from '../../../../../components/ui/label';
import { coverForKind, coverUrl, EVENT_COVERS } from '../../../../../lib/eventCovers';
import { cn } from '../../../../../lib/utils';
import { InfoTip, LabelWithInfo } from '../../../../../components/ui/info-tip';

/** Own pictures cannot wait in the browser until the account exists. */
function LoginForUpload({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation('organizer');
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t('wizard.pictures.locked')}</p>
        <Button type="button" variant="outline" size="sm" onClick={onLogin}>
          {t('wizard.pictures.login')}
        </Button>
      </div>
    </div>
  );
}

/** Last step of the wizard: cover and site plan, the preview next to it shows them at once. */
export function WizardPictures({
  isGuest,
  onLogin,
  kind,
}: {
  isGuest: boolean;
  onLogin: () => void;
  kind?: ItemKind;
}) {
  const { t } = useTranslation('organizer');
  const { setValue, watch } = useFormContext();
  const template = watch('coverTemplate') as string | undefined;
  const coverImage = watch('coverImageFile') as File | undefined;
  const mapImage = watch('eventMapImageFile') as File | undefined;
  // The picture of the chosen kind of bazaar first
  const suggested = kind ? coverForKind(kind) : undefined;
  const covers = [...EVENT_COVERS].sort((a, b) => +(b === suggested) - +(a === suggested));

  const chooseOwnCover = (files: File[]) => {
    setValue('coverImageFile', files[0], { shouldDirty: true });
    // An own picture replaces the template; removing it goes back to "none"
    setValue('coverTemplate', undefined, { shouldDirty: true });
  };

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-1">
        <h3 className="font-semibold">{t('wizard.pictures.title')}</h3>
        <InfoTip>{t('wizard.pictures.intro')}</InfoTip>
      </div>

      <div className="space-y-2">
        <LabelWithInfo info={t('wizard.pictures.coverText')}>
          {t('wizard.pictures.cover')}
        </LabelWithInfo>
        <div className="grid grid-cols-3 gap-1.5">
          {covers.map((id) => {
            const active = !coverImage && template === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                aria-label={t('wizard.pictures.coverPick', {
                  name: t(`wizard.pictures.names.${id}`),
                })}
                title={t(`wizard.pictures.names.${id}`)}
                disabled={!!coverImage}
                // A second click takes the picture away again
                onClick={() =>
                  setValue('coverTemplate', active ? undefined : id, { shouldDirty: true })
                }
                className={cn(
                  'relative overflow-hidden rounded-md ring-2 ring-offset-1 ring-offset-card transition-all focus-visible:outline-none focus-visible:ring-ring disabled:opacity-40',
                  active ? 'ring-primary' : 'ring-transparent hover:ring-primary/40'
                )}
              >
                <img
                  src={coverUrl(id)}
                  alt=""
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                {active && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isGuest ? (
        <LoginForUpload onLogin={onLogin} />
      ) : (
        <>
          <div className="space-y-2">
            <Label>{t('wizard.pictures.own')}</Label>
            <ImageUpload
              onFilesChange={chooseOwnCover}
              initialFiles={coverImage ? [coverImage] : undefined}
              maxFiles={1}
            />
          </div>
          <div className="space-y-2 border-t pt-4">
            <LabelWithInfo info={t('wizard.pictures.mapText')}>
              {t('wizard.pictures.map')}
            </LabelWithInfo>
            <ImageUpload
              onFilesChange={(files) =>
                setValue('eventMapImageFile', files[0], { shouldDirty: true })
              }
              initialFiles={mapImage ? [mapImage] : undefined}
              maxFiles={1}
            />
          </div>
        </>
      )}
    </div>
  );
}
