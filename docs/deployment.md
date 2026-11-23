# Deployment

Self-hosting a single instance with `docker-compose.selfhost.yml` is described in the
[README](../README.md#self-hosting) and, step by step, on
[docs.bazarpro.de/en/selbst-hosten](https://docs.bazarpro.de/en/selbst-hosten/). This page is about
bazarpro.de itself: production, review apps and the demo instance, all deployed by the
[pipeline](./pipeline.md) with Ansible.

## Production

`docker-compose.yml` runs Traefik (wildcard certificate by DNS challenge at Cloudflare), the web
app, the backend, PostgreSQL and the nightly backup. The pipeline deploys it on every release tag
(role `ansible/roles/docker_deploy`); the variables are listed in [env.md](./env.md).

To test the production images locally:

```bash
docker compose build
docker compose up
```

### Backups

The `backup` service dumps the database and archives the uploaded files every night
(`scripts/backup.sh`, kept for 7 days); `scripts/restore.sh` restores them. Every deploy also
dumps the database first (`backups/predeploy_*.dump`).

### Ansible by hand

```bash
# Syntax check
uvx --from ansible-core ansible-playbook -i ansible/inventory ansible/site.yml --syntax-check

# Dry run with diff
uvx --from ansible-core ansible-playbook -i ansible/inventory ansible/site.yml --check --diff
```

### Administrators and data from Convex

```bash
docker compose exec backend bazarpro-backend admin you@example.org   # make an account admin
docker compose exec backend bazarpro-backend import export.zip       # data of a Convex instance
```

## Demo instance

[demo.bazarpro.de](https://demo.bazarpro.de) lets interested people try BazarPro without an
account. It runs on its own small server (AWS Lightsail, Ubuntu 24.04), role
`ansible/roles/docker_demo`:

- **Data:** the German demo data with photos (`bazarpro-backend seed`). The login page shows
  three demo accounts in demo mode (`src/pages/public/auth/components/DemoAccounts.tsx`);
  registration is switched off.
- **Reset:** every night at 3:00 UTC `scripts/reset-demo.sh` removes database and uploads and
  starts again with fresh demo data (log: `/var/log/bazarpro-demo-reset.log`).
- **Emails:** none. The demo has no `AUTH_SMTP_HOST`, so the backend only logs its emails.
- **Uploads:** allowed (images up to 10 MB, as everywhere), removed by the nightly reset.
- **Statistics:** Plausible on `PLAUSIBLE_API_HOST` with the site `demo.bazarpro.de`; add the
  site in Plausible once.
- **Search engines:** every page is sent with `X-Robots-Tag: noindex, nofollow`, so the made-up
  bazaars do not compete with bazarpro.de.
- **Updates:** the job `deploy-demo` of the pipeline deploys every release after production. It
  runs once the repository variable `DEMO_HOST` is set and needs the secret
  `DEMO_SSH_PRIVATE_KEY` (base64 of the private key of the user `ubuntu`).
- **Certificates:** Let's Encrypt by HTTP challenge, so the DNS record of `demo.bazarpro.de` is
  an A record to the server's static IP, not proxied by Cloudflare.

By hand, e.g. after changing the role:

```bash
uvx --from ansible-core --with requests ansible-galaxy collection install -r ansible/requirements.yml
ACME_EMAIL=… PLAUSIBLE_API_HOST=https://data.bazarpro.de IMAGE_TAG=v2.5.1 \
  uvx --from ansible-core ansible-playbook -i ansible/inventory ansible/site.yml --tags demo \
  -e ansible_host=<DEMO_HOST> -e ansible_ssh_private_key_file=<key>
```

## Feature flags

Feature flags switch parts of an instance on and off without a deploy, with the backend CLI
(`docker compose exec backend …` on a server):

```bash
bazarpro-backend run featureFlags.set '{"key": "is_event_creation_enabled", "value": false}'
bazarpro-backend run seed.toggleFeatureFlag '{"key": "is_event_creation_enabled"}'
```

| Flag                                   | Effect                                                                    | After `seed` |
| -------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| `is_demo_mode`                         | Demo banner, demo access code `DEMO`, demo accounts on the login page     | `true`       |
| `is_login_enabled`                     | Sign-in page                                                              | `true`       |
| `is_registration_enabled`              | Registration page                                                         | `false`      |
| `is_event_creation_enabled`            | Creating new bazaars                                                      | `true`       |
| `allow_undo_inventory_actions`         | Undoing sales and returns at the cash desk (default `false` without seed) | `true`       |
| `is_create_products_on_signup_enabled` | Starter items for new users                                               | `true`       |
| `is_e2e_auth_skip_email`               | Stores sign-in codes for the E2E tests instead of sending them            | `false`      |
