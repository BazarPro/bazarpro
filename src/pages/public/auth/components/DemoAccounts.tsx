import { Store, Bike, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Accounts of the German demo data (backend/src/demo, `seed` without `--locale`), the data
 * of the demo instance and the review apps. All with the password of the seed.
 */
export const DEMO_PASSWORD = '123456';
const ACCOUNTS = [
  { key: 'organizer', email: 'sabine.krause@example.org', icon: Store },
  { key: 'seller', email: 'laura.zimmermann@example.org', icon: ShoppingBag },
  { key: 'bikeMarket', email: 'user1@bazarpro.de', icon: Bike },
] as const;

/** Demo mode: one click fills in a demo account, so visitors need no account of their own. */
export function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const { t } = useTranslation('auth');
  return (
    <section
      className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 sm:mb-6"
      data-testid="demo-accounts"
    >
      <h2 className="text-sm font-medium">{t('demo.title')}</h2>
      <p className="mb-2 text-xs text-muted-foreground">
        {t('demo.hint', { password: DEMO_PASSWORD })}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {ACCOUNTS.map(({ key, email, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(email, DEMO_PASSWORD)}
            className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm hover:border-primary hover:text-primary"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="leading-tight">{t(`demo.${key}`)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
