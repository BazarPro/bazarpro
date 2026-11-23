// Renders the link preview: node scripts/social-preview/render.mjs
// public/og-image.png (bazarpro.de, 1200x630) and docs/social-preview.png (GitHub,
// Settings → Social preview, 1280x640).
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const targets = { og: 'public/og-image.png', github: 'docs/social-preview.png' };

const server = await createServer({ server: { port: 5198, open: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
await page.goto('http://localhost:5198/scripts/social-preview/index.html');
await page.waitForSelector('[data-preview]');
await page.evaluate(() => document.fonts.ready);

for (const [id, file] of Object.entries(targets)) {
  await page.locator(`[data-preview="${id}"]`).screenshot({ path: resolve(file) });
  console.log(file);
}

await browser.close();
await server.close();
