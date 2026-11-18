#!/usr/bin/env bash
# Runs a k6 scenario from this machine against the load-test stack on a server
# (docker-compose.yml here) and measures on that server meanwhile: CPU per container,
# sockets, kernel counters and probes (measure.sh, probe.sh). Production is asked once a
# second from here too, to see whether it suffers.
#
#   backend/bench/remote/run.sh bazaar.js tag1000 -e VISITORS=1000
#
# SSH_HOST (bazarpro), BASE (https://lasttest.bazarpro.de/api), PROD (https://bazarpro.de),
# K6 (k6). Results land in backend/bench/results/<name>.{json,log,probe}.
set -uo pipefail
here=$(cd "$(dirname "$0")/.." && pwd)
script=$1 name=$2
shift 2
host=${SSH_HOST:-bazarpro} prod=${PROD:-https://bazarpro.de}
export BASE=${BASE:-https://lasttest.bazarpro.de/api}
results=$here/results
mkdir -p "$results"

busy() { awk '/^cpu /{print $2+$3+$4+$7+$8, $5+$6}' /proc/stat; }
ssh -o BatchMode=yes "$host" /root/lasttest/measure.sh start </dev/null >/dev/null 2>&1
(while :; do
  curl -s -o /dev/null -m 10 -w '%{http_code} %{time_total}\n' -X POST \
    -H 'content-type: application/json' -d '{"includePast":false}' "$prod/api/query/events.get"
  sleep 1
done) >"$results/$name.probe" 2>&1 &
probe=$!
before=$(busy)
"${K6:-k6}" run -q --summary-export "$results/$name.json" "$@" "$here/$script" \
  >"$results/$name.log" 2>&1
after=$(busy)
kill $probe

echo "=== $name ($*)"
node "$here/summary.mjs" "$results/$name.json"
grep -o 'error="[^"]*"' "$results/$name.log" | sed -E 's/[0-9.]+:[0-9]+/ADDR/g' | sort | uniq -c |
  sort -nr | head -4
# Above ~70 % the latencies say more about this machine than about the server
echo "$before $after" |
  awk '{printf "  Lastrechner-CPU: %.0f %%\n", 100*($3-$1)/(($3-$1)+($4-$2))}'
awk '{n++; s+=$2; if($2>m)m=$2; if($1!=200)e++}
  END{printf "  Produktion von hier: Mittel %.3f s / Max %.3f s, Fehler %d von %d\n", s/n, m, e, n}' \
  "$results/$name.probe"
ssh -o BatchMode=yes "$host" /root/lasttest/measure.sh stop
