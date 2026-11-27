#!/usr/bin/env bash
# Lokaler Datenbank-Test (M.1): frische Postgres-Datenbank, alle Migrationen, dann jedes
# supabase/tests/*.sql (ausser stub/helpers) laufen lassen und mit *.expected vergleichen.
# Braucht lokal Postgres 16 (pg_ctl/initdb). Aufruf im Repo-Root: bash supabase/tests/run.sh [--update]
set -euo pipefail
cd "$(dirname "$0")/../.."
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
DATA=${MB_PGDATA:-/var/lib/postgresql/mb-test-$$}
PORT=${MB_PGPORT:-54331}
RUNAS=(); [ "$(id -u)" = 0 ] && RUNAS=(su postgres -c)
start(){ mkdir -p "$DATA"; [ ${#RUNAS[@]} -gt 0 ] && chown postgres "$DATA"; chmod 700 "$DATA"
  if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$BIN/initdb -D $DATA -A trust >/dev/null && $BIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA.log -w start >/dev/null"
  else "$BIN/initdb" -D "$DATA" -A trust >/dev/null && "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA.log" -w start >/dev/null; fi; }
stop(){ if [ ${#RUNAS[@]} -gt 0 ]; then "${RUNAS[@]}" "$BIN/pg_ctl -D $DATA -m fast stop >/dev/null"; else "$BIN/pg_ctl" -D "$DATA" -m fast stop >/dev/null; fi; rm -rf "$DATA" "$DATA.log"; }
start; trap stop EXIT
P=(psql -h /tmp -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
"${P[@]}" -c "create database mb"
"${P[@]}" -d mb -f supabase/tests/stub.sql 2>/dev/null
for f in supabase/migrations/*.sql; do "${P[@]}" -d mb -1 -f "$f" >/dev/null 2>&1 || { echo "Migration fehlgeschlagen: $f"; exit 1; }; done
"${P[@]}" -d mb -f supabase/tests/helpers.sql >/dev/null
fail=0
for t in supabase/tests/*.sql; do
  case "$t" in */stub.sql|*/helpers.sql) continue;; esac
  out=$("${P[@]}" -d mb -f "$t" 2>&1 | grep -v '^set_config\|^SET\|^RESET\|^0000' || true)
  exp="${t%.sql}.expected"
  if [ "${1:-}" = "--update" ]; then printf '%s\n' "$out" > "$exp"; echo "geschrieben: $exp"; continue; fi
  if diff <(printf '%s\n' "$out") "$exp" >/dev/null; then echo "ok   $t"; else echo "FAIL $t"; diff <(printf '%s\n' "$out") "$exp" || true; fail=1; fi
done
exit $fail
