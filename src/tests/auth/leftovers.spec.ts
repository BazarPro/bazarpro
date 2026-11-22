import { test, expect, type Page } from '@playwright/test';
import { runBackend } from '../utils';
import { ORGANIZER, createShowcase, expectToast, login } from '../helpers/features';

/**
 * The end of a bazaar (#305): the team returns the items left over at once, or the
 * nightly cron does and marks them, so the team can clear up whether they were picked up.
 */

test.beforeAll(() => {
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
});

// The cron step takes every bazaar that is over: one after the other
test.describe.configure({ timeout: 120_000, mode: 'serial' });

/** Screenshots for the pull request, only when asked for */
async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (!dir) return;
  // Dialogs fade in
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test('the team returns what is left after the bazaar at once', async ({ page }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Leftovers');
  runBackend('seed.endEvent', { eventId: showcase.eventId, hoursAgo: 2 });

  await login(page, ORGANIZER);
  await page.goto(`/events/view/${showcase.eventId}/products`);
  // Quiet: in the "…" menu, no notice
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await shot(page, 'leftovers-menu');
  await page.getByRole('menuitem', { name: /Alle übrigen zurückgeben/ }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('als zurückgegeben markieren?');
  await expect(dialog).toContainText('Verkaufte und nie abgegebene Artikel bleiben');
  await shot(page, 'leftovers-confirm');
  await dialog.getByRole('button', { name: 'Zurückgeben' }).click();
  await expectToast(page, /Artikel zurückgegeben/);
  // Live: nothing left to return, nothing marked as returned by the cron
  await expect(page.getByRole('button', { name: 'Weitere Aktionen' })).toBeHidden();
  await page.getByRole('tab', { name: /Rückgabe/ }).click();
  await expect(page.getByTestId('auto-returned-notice')).toBeHidden();
});

test('the night after, the cron returns the rest and marks it', async ({ page }, testInfo) => {
  const showcase = createShowcase(testInfo, 'Auto return');
  runBackend('seed.endEvent', { eventId: showcase.eventId, hoursAgo: 10 });
  runBackend('retention.returnLeftovers', {});

  await login(page, ORGANIZER);
  await page.goto(`/events/view/${showcase.eventId}/products?tab=returned`);
  const notice = page.getByTestId('auto-returned-notice');
  await expect(notice).toContainText('nach dem Basar automatisch zurückgegeben');
  await expect(page.getByText('automatisch', { exact: true }).first()).toBeVisible();
  await shot(page, 'auto-returned-line');

  await notice.getByRole('button', { name: 'Nur diese anzeigen' }).click();
  await expect(page).toHaveURL(/returned=auto/);
  await expect(notice.getByRole('button', { name: 'Alle anzeigen' })).toBeVisible();
  await shot(page, 'auto-returned-list');
});
