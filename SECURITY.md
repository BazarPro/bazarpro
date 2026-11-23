# Security Policy

BazarPro handles accounts, addresses of sellers and money at the cash desk, so we take security
reports seriously and thank everyone who reports responsibly.

## Supported versions

Only the latest release gets security fixes. Self-hosted instances should follow the
[releases](https://github.com/BazarPro/bazarpro/releases) and update with
`docker compose pull && docker compose up -d`.

| Version        | Supported |
| -------------- | --------- |
| Latest release | ✅        |
| Older releases | ❌        |

## Reporting a vulnerability

**Please do not open a public issue.** Report it privately instead:

1. Open [Report a vulnerability](https://github.com/BazarPro/bazarpro/security/advisories/new)
   (Security tab → "Report a vulnerability").
2. Describe the problem, the affected version or page, and the steps to reproduce it. A proof of
   concept helps; please use your own test instance or the demo
   ([demo.bazarpro.de](https://demo.bazarpro.de)), never the data of other people on bazarpro.de.

What happens next:

- We confirm the report within **5 working days**.
- We tell you our assessment and plan within **14 days**.
- After the fix is released, we publish a security advisory and credit you, if you wish.

## Scope

In scope: this repository (web app, backend, mobile apps, Docker images
`ghcr.io/bazarpro/core`) and the hosted instance bazarpro.de.

Out of scope: denial of service and load tests against bazarpro.de, social engineering, reports
from automated scanners without a demonstrated impact, and missing best-practice headers without
an exploit.

Bilingual: reports in German are welcome, too (Meldungen gerne auch auf Deutsch).
