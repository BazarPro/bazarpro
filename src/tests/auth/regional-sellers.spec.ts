import { test, expect } from '@playwright/test';
import { runBackend } from '../utils';
import {
  OTHER_BUYER,
  ORGANIZER,
  createShowcase,
  expectToast,
  login,
  loginAs,
} from '../helpers/features';
import { fillProfileForm } from '../helpers/profile';

/**
 * A bazaar for its region (#304): the organizer limits the registration to postal codes,
 * sellers from elsewhere learn why they cannot join.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

test.describe.configure({ timeout: 120_000 });

test('only sellers from the chosen postal codes register on their own', async ({
  page,
}, testInfo) => {
  const showcase = createShowcase(testInfo, 'Region');

  await login(page, ORGANIZER);
  await page.goto(`/events/view/${showcase.eventId}/settings`);
  await page.getByRole('checkbox', { name: 'Nur Verkäufer aus der Region' }).click();
  await expect(page.getByText('Mit dem Regler den Umkreis ziehen')).toBeVisible();
  // The map shows the areas of the country
  await expect(page.getByRole('img', { name: 'Karte der Postleitzahlgebiete' })).toBeVisible();
  // Whatever a circle chose: start over with exactly one prefix
  const clear = page.getByRole('button', { name: 'Alle abwählen' });
  if (await clear.isVisible()) await clear.click();
  const manual = page.getByLabel('Postleitzahl oder ihren Anfang hinzufügen');
  await manual.fill('7322');
  await manual.press('Enter');
  await expect(page.getByTestId('region-summary')).toContainText('Postleitzahl 7322…');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expectToast(page, 'Basar gespeichert');

  const seller = await loginAs(page, OTHER_BUYER);
  await seller.goto(`/public-events/${showcase.eventId}`);
  await expect(seller.getByText('Nur aus PLZ 7322…').first()).toBeVisible();
  await seller.getByRole('button', { name: 'Als Verkäufer anmelden' }).click();
  await fillProfileForm(seller).catch(() => {});
  await expect(
    seller.getByText(
      'Dieser Basar ist nur für Verkäufer aus seiner Region: Postleitzahl 7322… (Deutschland).'
    )
  ).toBeVisible();
  await expect(seller.getByRole('button', { name: 'Anmelden bestätigen' })).toHaveCount(0);
});
