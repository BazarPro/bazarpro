#!/usr/bin/env bash
# On the server, as /root/lasttest/measure.sh (remote/run.sh calls it): `start` before a
# run, `stop` after it prints the CPU time per container (cgroup), CPU and memory of the
# host, open sockets, Traefik's open files, conntrack entries and TCP counters, and what
# probe.sh measured.
D=/root/lasttest/m; mkdir -p $D
snap() { # CPU microseconds per container
  for c in $(docker ps --format "{{.Names}}"); do
    id=$(docker inspect -f "{{.Id}}" $c)
    f=$(ls /sys/fs/cgroup/system.slice/docker-$id.scope/cpu.stat /sys/fs/cgroup/docker/$id/cpu.stat 2>/dev/null | head -1)
    [ -n "$f" ] && echo "$c $(awk "/^usage_usec/{print \$2}" $f)"
  done
}
case $1 in
start)
  snap > $D/cpu0; date +%s.%N > $D/t0; nstat -n >/dev/null 2>&1
  ( while :; do
      read -r _ u n s i w q sq st _ < /proc/stat
      echo "$(date +%s) $u $n $s $i $w $q $sq $st $(awk "/MemAvailable/{print \$2}" /proc/meminfo) $(awk "/SwapFree/{print \$2}" /proc/meminfo) $(ss -s | awk "/^TCP:/{print \$2}") $(ls /proc/$(docker inspect -f "{{.State.Pid}}" traefik)/fd | wc -l) $(cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || echo 0)"
      sleep 1
    done ) > $D/host.log 2>/dev/null &
  echo $! > $D/pid
  nohup /root/lasttest/probe.sh > $D/probe.log 2>/dev/null </dev/null &
  echo $! > $D/probe.pid ;;
stop)
  kill $(cat $D/pid) $(cat $D/probe.pid) 2>/dev/null
  awk '{n++; a+=$2; if($2>am)am=$2; b+=$4; if($4>bm)bm=$4; c+=$8; if($8>cm)cm=$8; if($5!=200)e++; t+=$6; if($6>tm)tm=$6} END{printf "  Sonden auf dem Server (Mittel/Max s): Backend direkt %.3f/%.3f | via Traefik lokal %.3f/%.3f | Prod via Proxy %.3f/%.3f (TCP-Connect %.3f/%.3f, Fehler %d von %d)\n", a/n,am,b/n,bm,c/n,cm,t/n,tm,e,n}' $D/probe.log
  snap > $D/cpu1; t=$(awk -v a=$(date +%s.%N) -v b=$(cat $D/t0) "BEGIN{print a-b}")
  echo "Dauer ${t}s"
  join <(sort $D/cpu0) <(sort $D/cpu1) | awk -v t=$t "{d=(\$3-\$2)/1e6; if(d>0.5) printf \"  %-34s %7.1f CPU-s  %.2f Kerne\n\",\$1,d,d/t}" | sort -k2 -nr
  awk "NR>1{b=(\$2+\$3+\$4+\$7+\$8+\$9)-(pu); tot=b+(\$5+\$6)-(pi); if(tot>0){c=100*b/tot; s+=c; n++; if(c>m)m=c}} {pu=\$2+\$3+\$4+\$7+\$8+\$9; pi=\$5+\$6; if(mem==\"\"||\$10<mem)mem=\$10; if(\$12>tcp)tcp=\$12; if(\$13>fd)fd=\$13; if(\$14>ct)ct=\$14; sw=\$11} END{printf \"  Host-CPU Mittel %.0f %% / Max %.0f %%, min. RAM frei %d MB, Swap frei %d MB, max TCP %d, max Traefik-FDs %d, max Conntrack %d\n\",s/n,m,mem/1024,sw/1024,tcp,fd,ct}" $D/host.log
  nstat 2>/dev/null | egrep "ListenOverflows|ListenDrops|TcpExtTCPReqQFull|TcpRetransSegs|TcpExtTCPAbortOnMemory|TcpExtTCPBacklogDrop" | awk "{printf \"  %s=%s\", \$1,\$2} END{print \"\"}" ;;
esac
