import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CalendarPlus,
  FlaskConical,
  LogIn,
  PackagePlus,
  TriangleAlert,
  Undo2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/page-header';
import { Switch } from '../../components/ui/switch';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { ListSkeleton, Loading } from '../../components/ui/loading';
import { useMutation, useQuery } from '../../lib/api/react';
import { api } from '../../lib/api/functions';
import { getUserFacingErrorMessage } from '../../lib/errors';
import { dateLocale } from '../../i18n/format';
import { cn } from '../../lib/utils';

const ICONS = {
  is_login_enabled: LogIn,
  is_registration_enabled: UserPlus,
  is_event_creation_enabled: CalendarPlus,
  allow_undo_inventory_actions: Undo2,
  is_create_products_on_signup_enabled: PackagePlus,
  is_demo_mode: FlaskConical,
} satisfies Record<string, LucideIcon>;

type FlagKey = keyof typeof ICONS;
type Flag = {
  key: FlagKey;
  value: boolean;
  isDefault: boolean;
  updatedAt?: number;
  updatedBy?: string | null;
};

/** Asked before: these changes lock people out or open protected bazaars. */
const RISKY = { is_login_enabled: false, is_demo_mode: true } as const;
type RiskyKey = keyof typeof RISKY;
const isRisky = (key: FlagKey): key is RiskyKey => key in RISKY;

/** The flags of the admin area by topic; flags the backend does not know stay hidden. */
const GROUPS: { id: 'access' | 'bazaars' | 'presentation'; flags: FlagKey[] }[] = [
  { id: 'access', flags: ['is_login_enabled', 'is_registration_enabled'] },
  {
    id: 'bazaars',
    flags: [
      'is_event_creation_enabled',
      'allow_undo_inventory_actions',
      'is_create_products_on_signup_enabled',
    ],
  },
  { id: 'presentation', flags: ['is_demo_mode'] },
];

/** Feature flags: switches for the whole platform, effective at once (#256). */
export function AdminFeaturesPage() {
  const { t } = useTranslation('admin');
  // Unknown keys of a newer backend are left out
  const flags = useQuery(api.featureFlags.listForAdmin, {})?.filter(
    (flag): flag is Flag => flag.key in ICONS
  );
  const update = useMutation(api.featureFlags.update);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ key: RiskyKey; value: boolean } | null>(null);

  const save = async (key: FlagKey, value: boolean) => {
    setSaving(key);
    try {
      await update({ key, value });
      toast.success(
        t('features.saved', {
          name: t(`features.flags.${key}.title`),
          state: value ? t('features.on') : t('features.off'),
        })
      );
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error));
    } finally {
      setSaving(null);
    }
  };

  const change = (key: FlagKey, value: boolean) => {
    if (isRisky(key) && RISKY[key] === value) setConfirm({ key, value });
    else void save(key, value);
  };

  const loginOff = flags?.find((flag) => flag.key === 'is_login_enabled')?.value === false;

  return (
    <div className="space-y-6">
      <PageHeader title={t('features.title')} description={t('features.description')} />

      {loginOff && (
        <Alert variant="warning" className="max-w-3xl">
          <TriangleAlert />
          <AlertDescription>{t('features.loginOff')}</AlertDescription>
        </Alert>
      )}

      {flags === undefined ? (
        <Loading className="max-w-3xl">
          <ListSkeleton rows={4} />
        </Loading>
      ) : (
        <div className="max-w-3xl space-y-8">
          {GROUPS.map((group) => {
            const items = group.flags
              .map((key) => flags.find((flag) => flag.key === key))
              .filter((flag): flag is Flag => !!flag);
            if (items.length === 0) return null;
            return (
              <section key={group.id} className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {t(`features.groups.${group.id}`)}
                </h2>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {items.map((flag) => (
                    <FlagRow
                      key={flag.key}
                      flag={flag}
                      saving={saving === flag.key}
                      onChange={(value) => change(flag.key, value)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm && t(`features.confirm.${confirm.key}.title`)}
        description={confirm && t(`features.confirm.${confirm.key}.text`)}
        confirmLabel={confirm && t(`features.confirm.${confirm.key}.action`)}
        destructive
        onConfirm={() => {
          if (confirm) void save(confirm.key, confirm.value);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function FlagRow({
  flag,
  saving,
  onChange,
}: {
  flag: Flag;
  saving: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation('admin');
  const Icon = ICONS[flag.key];
  const id = `flag-${flag.key}`;
  const date =
    flag.updatedAt &&
    new Date(flag.updatedAt).toLocaleString(dateLocale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  const meta = flag.isDefault
    ? t('features.default')
    : date
      ? flag.updatedBy
        ? t('features.changed', { name: flag.updatedBy, date })
        : t('features.changedAt', { date })
      : null;

  return (
    <li className="flex items-start gap-3 p-4 sm:gap-4 sm:px-5">
      <span
        className={cn(
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors',
          flag.value && 'text-foreground'
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer font-medium leading-6">
          {t(`features.flags.${flag.key}.title`)}
        </label>
        <p className="text-sm text-muted-foreground">{t(`features.flags.${flag.key}.text`)}</p>
        {meta && <p className="mt-1 text-xs text-muted-foreground/80">{meta}</p>}
      </div>
      <Switch
        id={id}
        className="mt-1.5"
        checked={flag.value}
        disabled={saving}
        onCheckedChange={(checked) => onChange(checked === true)}
        data-testid={id}
      />
    </li>
  );
}
