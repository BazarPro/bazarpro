import { defineConfig, devices } from '@playwright/test';

/**
 * Screenshots of the app for the README (docs/screenshots/), made from the English demo
 * data: `npm run screenshots`. Needs Postgres like the E2E tests (playwright.config.ts);
 * the database is wiped, so its name has to end in _e2e or _test.
 */
const databaseUrl =
  process.env.SCREENSHOTS_DATABASE_URL ??
  'postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro_screenshots_test';
if (!/_(e2e|test)$/.test(new URL(databaseUrl).pathname)) {
  throw new Error(`SCREENSHOTS_DATABASE_URL must name a database ending in _e2e or _test.`);
}
const backendPort = process.env.SCREENSHOTS_BACKEND_PORT ?? '3200';
const frontendPort = process.env.SCREENSHOTS_FRONTEND_PORT ?? '5174';
process.env.DATABASE_URL = databaseUrl;
process.env.ALLOW_REMOVE_ALL_DATA = 'true';
process.env.SITE_URL = `http://127.0.0.1:${frontendPort}`;
process.env.STORAGE_DIR ??= 'test-results/screenshot-files';
process.env.LISTEN_ADDR = `127.0.0.1:${backendPort}`;
process.env.BACKEND_URL = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: './scripts/screenshots',
  testMatch: '*.screens.ts',
  // One after the other: the shots share the demo data (the cash desk sells items)
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  globalSetup: './scripts/screenshots/setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}/`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
  },
  // Every picture in the light and in the dark theme (name-dark.jpg)
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  webServer: [
    {
      name: 'Backend',
      command:
        process.env.BACKEND_CLI ??
        'cargo build --manifest-path backend/Cargo.toml && backend/target/debug/bazarpro-backend',
      url: `http://127.0.0.1:${backendPort}/healthz`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      name: 'Frontend',
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
