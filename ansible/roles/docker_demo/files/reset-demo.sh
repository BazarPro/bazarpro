#!/bin/sh
# Resets the demo instance: removes database and uploaded files, then starts again with
# fresh demo data (the seed container). Run nightly by cron (role docker_demo).
set -eu
cd "$(dirname "$0")/.."
echo "$(date -Is) resetting the demo"
docker compose down --volumes --remove-orphans
# Waits for the seed before it starts the frontend (depends_on)
docker compose up -d
# The demo data sign in admin@bazarpro.de with 123456; the role stores another password
if [ -s admin-password ]; then
  docker compose exec -T backend bazarpro-backend password admin@bazarpro.de < admin-password
fi
echo "$(date -Is) demo reset done"
