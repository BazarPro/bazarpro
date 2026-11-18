import { execFileSync } from 'node:child_process';

/**
 * The backend CLI the tests run functions with (internal ones too). Defaults to the debug build; set BACKEND_CLI for another binary, e.g. in CI.
 */
const BACKEND_CLI = process.env.BACKEND_CLI ?? 'backend/target/debug/bazarpro-backend';

function backend(args: string[]) {
  return execFileSync(BACKEND_CLI, args, {
    env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? 'warn' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
    .toString('utf8')
    .trim();
}

/** Runs a backend function, e.g. `runBackend('featureFlags.set', { key, value })`; returns its JSON value. */
export function runBackend<T = unknown>(name: string, args: Record<string, unknown> = {}): T {
  console.log(`Executing: ${name} ${JSON.stringify(args)}`);
  return JSON.parse(backend(['run', name, JSON.stringify(args)])) as T;
}

/** Fills the database with the demo data (`seed`), see backend/src/demo. */
export function seedBackend(...flags: string[]) {
  return backend(['seed', ...flags]);
}

/** Where the login page leads: the overview (`/`, src/pages/dashboard) */
export const isOverview = (url: URL) => url.pathname === '/';

/**
 * Picks the category of an item: opens the picker, then the main category, then the
 * sub-category (items go into sub-categories).
 */
export async function pickCategory(
  page: import('@playwright/test').Page,
  main: string,
  sub: string,
  scope: import('@playwright/test').Locator | import('@playwright/test').Page = page
) {
  await scope.locator('#categoryId').click();
  await page.getByRole('menu').waitFor();
  const item = page.getByRole('menuitem', { name: sub, exact: true });
  // The only main category left, e.g. at a bike sale, is open already
  if (!(await item.isVisible())) {
    await page.getByRole('menuitem', { name: new RegExp(`^${main}`) }).click();
  }
  await item.click();
}
