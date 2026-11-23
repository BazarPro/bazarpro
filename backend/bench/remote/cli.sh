#!/usr/bin/env bash
# BACKEND_BIN for prepare.mjs: runs the backend CLI in the load-test stack on the server.
#   DATABASE_URL=remote BACKEND_BIN=backend/bench/remote/cli.sh \
#     BASE=https://lasttest.bazarpro.de/api node backend/bench/prepare.mjs
args=""
for arg in "$@"; do args+=" $(printf '%q' "$arg")"; done
exec ssh -o BatchMode=yes "${SSH_HOST:-bazarpro}" \
  "docker exec lasttest-backend-1 bazarpro-backend$args"
