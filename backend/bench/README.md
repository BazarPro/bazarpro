# Lasttests

k6-Szenarien gegen ein laufendes Backend, so wie die App es benutzt: Abfragen über HTTP,
Live-Updates über `/api/ws`. Wie `src/lib/api/client.ts` lädt eine geänderte Abfrage nach
bis zu 300 ms und höchstens einmal pro Sekunde neu; ändert sich das im Client, hier mit.

| Skript          | Was passiert                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browse.js`     | Lesekapazität: Besucher laden die öffentliche Eventseite ohne Pause (`VUS`, `DURATION`)                                                                                                                                                                                  |
| `firstvisit.js` | Erstaufruf: `RATE` neue Besucher pro Sekunde laden Seite, Skript und Styles über eine neue Verbindung, wie ein Browser ohne Cache (`DURATION`)                                                                                                                           |
| `bazaar.js`     | Basartag: `CASHIERS` Kassen scannen, verkaufen und stornieren (damit der Artikel verkaufbar bleibt), dazu `VISITORS` Besucher, die die Eventseite `STAY` Sekunden mit Live-Updates offen haben (`DURATION`, `CASH_THINK`), davon der Anteil `SIGNED_IN` (0–1) angemeldet |

**Nie mit den Kassen gegen die Review-Apps oder Produktion:** `prepare.mjs` schaltet die
Mail-Bestätigung ab und macht seine Accounts zu Admins, `bazaar.js` verkauft. Für Messungen
auf dem Produktionsserver gibt es einen eigenen Stack, siehe „Auf dem Produktionsserver“.

## Ablauf

Voraussetzungen: Docker (k6 läuft als Image `grafana/k6`), Node, ein Release-Build.

```sh
# Eigene Datenbank, z. B. im Dev-Postgres (backend/docker-compose.dev.yml)
docker compose -f backend/docker-compose.dev.yml exec postgres createdb -U bazarpro bench
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bench STORAGE_DIR=/tmp/bench-files

cargo build --release --manifest-path backend/Cargo.toml
backend/target/release/bazarpro-backend import export.zip   # echte Daten (npx convex export …) oder: seed
backend/target/release/bazarpro-backend &                   # lauscht auf :3000

node backend/bench/prepare.mjs     # Kassen- und Besucher-Accounts, Artikel → backend/bench/.data.json
BACKEND_PID=$(pgrep -f release/bazarpro-backend) backend/bench/run.sh bazaar.js tag500 -e VISITORS=500
```

`run.sh` legt k6-Export und Log unter `backend/bench/results/` ab und gibt Latenzen aus,
mit `BACKEND_PID` auch die CPU-Zeit des Backends. Für vergleichbare Zahlen das Backend so
starten wie in Produktion (`DATABASE_MAX_CONNECTIONS` 10) und Postgres direkt ansprechen
statt über den Docker-Portproxy (`docker inspect` → IP des Containers): der Proxy allein
kostet unter Last mehr als ein CPU-Kern.

`prepare.mjs` schaltet `is_e2e_auth_skip_email` ein und macht die Kassen-Accounts zu
Admins (dürfen an jeder Kasse verkaufen). Nur auf einer eigenen Datenbank benutzen.
Angemeldete Besucher (`SIGNED_IN`) nutzen `VISITOR_ACCOUNTS` (200) Accounts ohne Rolle
an der Veranstaltung, wie Käufer. Ihre Latenzen stehen getrennt als `*_signed_in`.

### Daten

Nach einem Import ist die Veranstaltung meist vorbei: Artikel zurückgegeben, Verkäufer
ausbezahlt. Für einen Basartag (auch nach abgebrochenen Läufen, die zwischen Verkauf und
Storno endeten):

```sql
UPDATE event_products SET status = 'available';
UPDATE event_sellers SET payout_received = false;
```

## Messung vom 21.10.2026

Produktionsexport vom 30.04.2026 (1 Veranstaltung, 120 Artikel, 82 Nutzer, 211 Bilder),
alles auf einem Rechner mit 16 Kernen inklusive k6. Die Zahlen taugen zum Vergleichen,
nicht als Kapazität des Produktionsservers. Convex: self-hosted wie in Produktion
(SQLite), angesprochen über seinen Sync-WebSocket wie vom Convex-Client.

Lesen (`browse.js`, 50 Besucher ohne Pause):

|                      | Requests/s | Median | CPU Backend + Postgres |
| -------------------- | ---------: | -----: | ---------------------: |
| Convex               |      3 477 |   7 ms |              4,0 Kerne |
| Rust vorher          |      2 139 |  20 ms |              7,1 Kerne |
| Rust mit Cache, gzip |      5 637 | 1,3 ms |              0,6 Kerne |

Kasse (`bazaar.js`, 20 Kassen, keine Besucher): Verkauf Median / p95 bei Convex
154 / 614 ms, Rust 9–10 / 36–47 ms.

Basartag (`bazaar.js`, 20 Kassen, Besucher bleiben 30 s), Laden der Eventseite
Median / p95:

| Besucher | Convex         | Rust vorher  | Rust mit Cache, gzip |
| -------: | -------------- | ------------ | -------------------- |
|      200 | 414 / 2 926 ms | 652 / 968 ms | 45 / 583 ms          |
|      500 | 1,5 / 6,4 s    | 2,0 / 2,8 s  | 0,26 / 1,6 s         |
|     1000 | 2,2 / 6,8 s ¹  | 6,6 / 8,3 s  | 1,2 / 2,6 s          |

Ab etwa 500 Besuchern bremst k6 selbst: Bei 1000 brauchte es 11 von 16 Kernen, das
Backend einen. Für mehr Last k6 auf einem zweiten Rechner laufen lassen.

¹ Convex lehnte 1 694 Abfragen ab („Too many concurrent requests“) und beendete sich mit
Dockers Standardlimit von 1024 offenen Dateien ganz. Das Rust-Backend nimmt mit diesem
Limit ab rund 1000 Besuchern keine Verbindungen mehr an; daher `ulimits.nofile` im Compose.

Mit Cache rechnet Postgres im Basartag 16 statt 270 CPU-Sekunden. Pro Live-Update gehen
mit gzip rund 36 statt 77 KB über die Leitung.

### Live-Updates gebündelt, Antworten vorkomprimiert

Nachmessung am selben Tag: Der Client lädt bei Änderungen anderer höchstens einmal pro
Sekunde und Abfrage, gecachte Antworten werden einmal komprimiert. Basartag mit 20 Kassen,
zwei Läufe je Stand (Spannen):

|                         | 200 Besucher vorher | nachher      | 500 Besucher vorher | nachher      |
| ----------------------- | ------------------- | ------------ | ------------------- | ------------ |
| Eventseite Median / p95 | 43–290 / ~1 400 ms  | 5 / 13–25 ms | 539 / 2 409 ms      | 7 / 1 186 ms |
| Übertragen (2 Minuten)  | 0,9–1,2 GB          | 0,27 GB      | 1,35 GB             | 0,64 GB      |
| Backend-CPU             | 0,75–1,2 Kerne      | 0,15–0,22    | 1,0 Kerne           | 0,48 Kerne   |

## Messung vom 31.10.2026: angemeldete Besucher (#228)

Demo-Daten (`seed`, Veranstaltung mit 75 Artikeln), Postgres 17 mit Standardkonfiguration,
`DATABASE_MAX_CONNECTIONS` 10, k6 auf demselben Rechner (12 Kerne, nicht exklusiv).
Basartag mit 20 Kassen, Besucher bleiben 30 s. Eventseite Median / p95, angemeldete
Besucher getrennt:

| Besucher, angemeldet | vorher anonym | vorher angemeldet | nachher anonym | nachher angemeldet |
| -------------------- | ------------- | ----------------- | -------------- | ------------------ |
| 500, 100 %           | –             | 13 / 61 ms        | –              | 9 / 26 ms          |
| 1000, 0 %            | 6 / 107 ms    | –                 | 6 / 95 ms      | –                  |
| 1000, 50 %           | 10 / 408 ms   | 33 / 1 706 ms     | 6 / 121 ms     | 10 / 183 ms        |
| 1000, 100 %          | –             | –                 | –              | 14 / 364 ms        |

Vorher lief jede Abfrage eines angemeldeten Besuchers gegen Postgres. Bei 1000 Besuchern,
davon die Hälfte angemeldet, war nicht die CPU knapp (Backend 1,1, Postgres 0,5 Kerne),
sondern der Pool: Auch der Verkauf an der Kasse brauchte im Median 495 statt 28 ms.
Nachher bekommen Angemeldete ohne Rolle an der Veranstaltung die Antworten der Besucher
(`registry.share`), der Verkauf liegt bei 35 ms (Median) / 111 ms (p95). Was bleibt, ist pro
Anfrage die Session und die Rollenprüfung sowie `users.viewer`; bei 1000 Angemeldeten
Verkauf 63 / 153 ms.

## Auf dem Produktionsserver

Was der Server trägt, zeigt nur eine Messung über denselben Weg wie die Produktion (Proxy,
Traefik, TLS). `remote/` enthält dafür einen Stack mit eigener Datenbank und Demo-Daten
unter `lasttest.<domain>` (der Wildcard-Eintrag im DNS deckt ihn ab) und Skripte, die
während eines Laufs auf dem Server messen. Die Last bremst die Produktion: nur außerhalb
von Veranstaltungen, und danach wieder abbauen.

```sh
ssh bazarpro mkdir -p /root/lasttest
scp backend/bench/remote/{docker-compose.yml,measure.sh,probe.sh,big-event.sql} bazarpro:/root/lasttest/
ssh bazarpro 'cd /root/lasttest && docker compose -p lasttest up -d'
# Für ein großes Event (2025 statt 75 Artikel):
ssh bazarpro 'cd /root/lasttest && docker exec -i lasttest-postgres-1 psql -U bazarpro -v ON_ERROR_STOP=1 < big-event.sql && docker restart lasttest-backend-1'

DATABASE_URL=remote BACKEND_BIN=backend/bench/remote/cli.sh \
  BASE=https://lasttest.bazarpro.de/api node backend/bench/prepare.mjs
backend/bench/remote/run.sh bazaar.js tag1000 -e VISITORS=1000     # k6 lokal installiert

ssh bazarpro 'cd /root/lasttest && docker compose -p lasttest down -v'
```

`run.sh` gibt neben den Latenzen aus: CPU-Zeit je Container, CPU und RAM des Servers,
Sockets, offene Dateien von Traefik, Conntrack, TCP-Zähler und drei Sonden vom Server aus
(Backend direkt, über Traefik ohne den Proxy, Produktion über den Proxy). Die Sonden
trennen, welche Schicht bremst, und hängen nicht am Netz des Lastrechners.

## Messung vom 16.11.2026: Produktionsserver, v2.5.1 (#227, #229)

Server Kiros (2 vCPUs, 4 GB), daneben Produktion, vier Review-Apps und Plausible. k6 auf
einem Rechner mit 12 Kernen hinter einem Privatanschluss, 25 ms entfernt. Basartag mit
20 Kassen, Besucher bleiben 30 s.

| Lauf                       | Eventseite Median / p95 (k6) | Server-CPU Mittel | Traefik / Backend / Postgres (Kerne) | Produktion vom Server aus, Mittel / Max |
| -------------------------- | ---------------------------- | ----------------- | ------------------------------------ | --------------------------------------- |
| Leerlauf                   | –                            | –                 | –                                    | 23 / 29 ms                              |
| 75 Artikel, 1000 Besucher  | 1,3 / 13,5 s                 | 72 %              | 0,48 / 0,27 / 0,07                   | 89 / 856 ms                             |
| 75 Artikel, 2000 Besucher  | 2,3 / 51 s                   | 74 %              | 0,58 / 0,32 / 0,06                   | nicht gemessen                          |
| 2025 Artikel, 200 Besucher | 1,3 / 4,0 s                  | 69 %              | 0,21 / 0,39 / 0,16                   | 36 / 168 ms                             |
| 2025 Artikel, 500 Besucher | 4,9 / 11,7 s                 | 64 %              | 0,26 / 0,31 / 0,10                   | 35 / 391 ms                             |

- **Die Latenzen von k6 sind ab 1000 Besuchern die des Lastrechners.** Bei 1000 Besuchern
  antwortete das Backend dem Server direkt in 7 ms, über Traefik in 95 ms; k6 maß im
  Median 304 ms pro Abfrage und sah die Produktion mit bis zu 9 s, vom Server aus waren es
  höchstens 0,86 s und kein Fehler. Bei 2000 Besuchern stieg der Durchsatz nicht mehr
  (572 statt 535 Requests/s). Für diese Größen braucht es Lastrechner in einem
  Rechenzentrum, am besten mehrere.
- **Kein Limit von Kernel oder Dateien**, wie am 30.10.: höchstens 5952 offene Dateien bei
  Traefik, 14 460 Conntrack-Einträge, keine `ListenOverflows`.
- **Traefik kostet am meisten.** Reines Lesen gegen die Produktion (`browse.js`, 200
  Besucher): 2841 Requests/s bei 94 % Server-CPU, davon Traefik 1,04 Kerne, das Backend
  0,21. Pro Request 0,37 ms CPU in Traefik und 0,07 ms im Backend.
- **Ein großes Event trägt ein Fünftel der Besucher (#229).** Die Liste von 2025 Artikeln
  ist 1,26 MB JSON, 136 KB mit gzip (die Kopien der Demo-Artikel komprimieren besser als
  echte). Neu berechnet braucht sie 70–86 ms, und das nach jedem Verkauf. 200 Besucher
  luden in zwei Minuten 774 MB und lasteten den Server so aus wie 1000 beim kleinen Event;
  bei 500 kam k6 mit dem Entpacken nicht mehr nach (912 MB). Ein Telefon lüde jede Sekunde
  136 KB und läse 1,26 MB JSON.

### Erstaufruf: Skripte einmal komprimiert

`firstvisit.js`: Das Hauptskript ist 1,76 MB groß. Der Web-Server komprimierte es für jede
Anfrage neu, 75 ms CPU pro Erstaufruf. Jetzt hält er von den Dateien unter `/assets/` je
eine Kopie mit Brotli und gzip im Speicher (453 statt 518 KB für das Hauptskript).

| Neue Besucher pro Sekunde | vorher: Antwort Median / p95, CPU Web-Server | nachher           |
| ------------------------- | -------------------------------------------- | ----------------- |
| 20                        | 1,3 / 10,1 s, 1,13 Kerne (Server bei 98 %)   | 73 / 120 ms, 0,16 |
| 50                        | 4,4 / 30,7 s, 1,15 Kerne (schafft ~16/s)     | 83 / 130 ms, 0,34 |
