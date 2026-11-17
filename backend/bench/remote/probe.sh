#!/usr/bin/env bash
# Probes on the server, twice a second: (a) the load-test backend directly, (b) through
# Traefik on localhost (without the upstream proxy), (c) production through its public
# IPv4 (proxy, Traefik, backend). They tell which layer is slow, and whether production
# suffers, independent of the network of the machine that generates the load.
D=/root/lasttest/m; ip=$(docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}" lasttest-backend-1 | cut -d" " -f1)
H="content-type: application/json"; q=api/query/events.get; body="{\"includePast\":false}"
while :; do
  a=$(curl -s -o /dev/null -m 10 -w "%{time_total}" -X POST -H "$H" -d "$body" http://$ip:3000/$q)
  b=$(curl -s -o /dev/null -m 10 -w "%{time_appconnect} %{time_total}" --resolve lasttest.bazarpro.de:443:127.0.0.1 -X POST -H "$H" -d "$body" https://lasttest.bazarpro.de/$q)
  c=$(curl -4 -s -o /dev/null -m 10 -w "%{http_code} %{time_connect} %{time_appconnect} %{time_total}" -X POST -H "$H" -d "$body" https://bazarpro.de/$q)
  echo "$(date +%s) $a $b $c"; sleep 0.4
done
