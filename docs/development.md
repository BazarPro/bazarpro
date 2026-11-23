# Development

## Local setup

Start Postgres, then the backend and the Vite frontend (Rust via [rustup](https://rustup.rs)):

```bash
npm install
docker compose -f backend/docker-compose.dev.yml up -d postgres
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro STORAGE_DIR=.files
npm run dev:full    # backend on :3000, Vite on :5173 (forwards /api to the backend)
```

Open `http://localhost:5173`. Without `AUTH_SMTP_HOST` the backend only logs emails, including the sign-in codes.

### Demo data

```bash
npm run seed                    # German
npm run seed -- --locale en     # English, e.g. for screenshots
```

All demo accounts use the password `123456`, e.g. `admin@bazarpro.de`, `user1@bazarpro.de` or
`sarah.miller@example.org` (English) / `sabine.krause@example.org` (German), the organizer of the
running kids' bazaar.

### Dev Container

The repository includes a Dev Container for VS Code with Node.js 22 and the extensions for ESLint,
Prettier and Playwright. Open the folder in VS Code and choose "Reopen in Container". Forwarded
ports: `5173` (Vite) and `3000` (backend).

## Project structure

```text
├── ansible/          # Deployment playbooks and server configuration
├── backend/          # Rust backend: migrations, modules (one per area), auth, demo data, tests
├── docs/             # This documentation, the README screenshots and the GitHub social preview
├── scripts/          # Prerendering, SEO files, backups, screenshots, link preview, event covers
├── server/           # Node server of the web image: static files, server-side SEO, sitemap
├── src/
│   ├── components/   # UI library (shadcn/ui) and shared components
│   ├── hooks/        # Custom React hooks (auth, feature flags, etc.)
│   ├── lib/          # Utilities (PDF generation, image processing), lib/api: backend client
│   ├── native/       # Mobile app (Capacitor): server switch, bearer token
│   ├── shared/       # Constants and rules the app shares with the backend's behaviour
│   └── pages/        # Application routes (organized by role)
├── android/, ios/    # Capacitor projects of the mobile apps
└── playwright/       # E2E test state
```

## Tests

| What                       | Command                                                      |
| -------------------------- | ------------------------------------------------------------ |
| Unit and integration       | `npm run test`                                               |
| Backend                    | `cd backend && cargo test` (needs `DATABASE_URL`, see above) |
| End-to-end                 | `npm run test:e2e`, interactive: `npx playwright test --ui`  |
| Coverage                   | `npm run test:coverage`                                      |
| Everything but the backend | `npm run test:all`                                           |

The E2E tests wipe and reseed their own database (`E2E_DATABASE_URL`, default
`bazarpro_e2e` on the Postgres of `backend/docker-compose.dev.yml`).

## Screenshots of the README

`npm run screenshots` takes the pictures in `docs/screenshots/` with Playwright
(`playwright.screenshots.config.ts`, `scripts/screenshots/`): it starts backend and Vite on
ports 3200 and 5174, fills `bazarpro_screenshots_test` with the English demo data and signs in
as the organizer of the running kids' bazaar. Every picture is taken in the light and the dark theme
(`name-dark.jpg`); the README shows the one that matches the GitHub theme of the reader.

```bash
SCREENSHOTS_DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro_screenshots_test \
  npm run screenshots
```

After every release the workflow `Screenshots` (`.github/workflows/screenshots.yml`) takes them
again and opens a pull request into `development` when they changed, so new pictures are looked at
before they reach the README. For the pull request, GitHub Actions needs "Allow GitHub Actions to
create and approve pull requests" (Settings → Actions → General); without it the run leaves the
branch and a link to open the pull request by hand.

## Link preview

`node scripts/social-preview/render.mjs` renders the preview image of shared links from
`scripts/social-preview/scene.tsx` (with the illustrations of the landing page):

- `public/og-image.png` (1200 × 630): Open Graph image of bazarpro.de
- `docs/social-preview.png` (1280 × 640): upload it in the repository settings under
  "Social preview"; GitHub offers no API for it.
