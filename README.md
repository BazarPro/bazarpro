<div align="center">

<img src="public/favicon.svg" alt="" width="72" height="72" />

# BazarPro

**Free, open-source software for kids' consignment sales, flea markets and bike swaps.**<br />
Sellers list their items at home and print QR labels. At the bazaar every phone becomes a cash desk, and BazarPro does the payouts.

[![CI](https://github.com/BazarPro/bazarpro/actions/workflows/pipeline.yml/badge.svg?branch=main)](https://github.com/BazarPro/bazarpro/actions/workflows/pipeline.yml)
[![Release](https://img.shields.io/github/v/release/BazarPro/bazarpro)](https://github.com/BazarPro/bazarpro/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/Docs-docs.bazarpro.de-1d3fe0.svg)](https://docs.bazarpro.de)

[**Try the demo**](https://demo.bazarpro.de) · [Website](https://bazarpro.de) · [Guides](https://docs.bazarpro.de/en/) · [Self-hosting](#self-hosting)

<img src="docs/screenshots/landing.jpg" alt="BazarPro landing page" width="860" />

</div>

> 🇩🇪 **Auf Deutsch:** BazarPro ist eine kostenlose Open-Source-Software für **Kinderbasare, Kleiderbasare, Flohmärkte, Fahrradbörsen und Skibasare**. Verkäufer erfassen ihre Artikel zu Hause und drucken **QR-Etiketten**. Am Basartag wird mit dem Handy **gescannt und kassiert**, und die **Abrechnung mit Provision** erstellt BazarPro automatisch. Ohne Installation auf [bazarpro.de](https://bazarpro.de) oder **selbst gehostet** mit Docker. Zum Ausprobieren: [demo.bazarpro.de](https://demo.bazarpro.de). Anleitungen gibt es auf [docs.bazarpro.de](https://docs.bazarpro.de).

## Features

| For organizers                                                                       | For sellers                                           | For visitors                                             |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- |
| Set up a bazaar with commission, fees, categories and seller limits                  | Register items with photos, sizes and prices          | Browse the catalog of a bazaar before and during the day |
| Invite sellers or let them register, by region (postal codes) or with an access code | Print QR labels for all items at once                 | Upcoming bazaars on the website, prerendered for search  |
| Intake, cash desk and returns on any phone: scan the label, done, also offline       | Follow sales live and see the payout after commission | Make offers or ask questions about an item               |
| Settlement per seller, receipts, posters and flyers                                  | Take part in several bazaars with the same items      |                                                          |

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/organizer-items.jpg" alt="Items of a bazaar with their status" /><br /><sub><b>Items:</b> intake, sale and returns at a glance</sub></td>
    <td width="50%"><img src="docs/screenshots/cash-desk.jpg" alt="Cash desk with three scanned items" /><br /><sub><b>Cash desk:</b> scan the QR labels with the phone camera or a scanner</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/settlement.jpg" alt="Settlement of a bazaar" /><br /><sub><b>Settlement:</b> what is in the till and what each seller gets</sub></td>
    <td width="50%"><img src="docs/screenshots/organizer-overview.jpg" alt="Overview of a bazaar for the organizer" /><br /><sub><b>Overview:</b> the next steps of a bazaar</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/seller-items-phone.jpg" alt="A seller's items on a phone" width="260" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/catalog-phone.jpg" alt="Catalog of a bazaar on a phone" width="260" />
</p>

## Try it

- **Demo:** [demo.bazarpro.de](https://demo.bazarpro.de) with sample bazaars; it is reset every night and sends no emails. Sign in with one of the demo accounts shown on the login page.
- **Hosted:** [bazarpro.de](https://bazarpro.de), free for bazaars.
- **Self-hosted:** see below.

## Self-hosting

One server with Docker is enough, no build and no CI needed:

```bash
curl -O https://raw.githubusercontent.com/BazarPro/bazarpro/main/docker-compose.selfhost.yml
curl -o .env https://raw.githubusercontent.com/BazarPro/bazarpro/main/.env.selfhost.example
# edit .env: domain, e-mail for Let's Encrypt, SMTP server
docker compose -f docker-compose.selfhost.yml up -d
```

The stack contains Traefik (HTTPS via Let's Encrypt), PostgreSQL, the backend and the web app, all under one domain. The account in `ADMIN_EMAIL` becomes administrator once it has signed up. Step-by-step guide: [English](https://docs.bazarpro.de/en/selbst-hosten/) · [Deutsch](https://docs.bazarpro.de/selbst-hosten/).

The iOS and Android apps can switch to a self-hosted server, see [docs/mobile-app.md](./docs/mobile-app.md).

## Development

```bash
npm install
docker compose -f backend/docker-compose.dev.yml up -d postgres
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro STORAGE_DIR=.files
npm run seed        # demo data, all accounts with password 123456
npm run dev:full    # backend on :3000, Vite on :5173
```

**Stack:** React 19, TypeScript, Vite, Tailwind CSS · Rust (Axum, sqlx) with PostgreSQL and live updates over WebSocket · Capacitor for the mobile apps · Docker, Traefik, Ansible · Vitest, Playwright, `cargo test`.

More in [docs/](./docs/README.md): [development and tests](./docs/development.md), [deployment and feature flags](./docs/deployment.md), [CI/CD pipeline](./docs/pipeline.md), [environment variables](./docs/env.md), [mobile app](./docs/mobile-app.md).

## Contributing

Issues and pull requests are welcome, see [CONTRIBUTING.md](./CONTRIBUTING.md). Code, commits and issues are in English; the app and the user guides are in German and English. Please report security issues privately as described in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE)
