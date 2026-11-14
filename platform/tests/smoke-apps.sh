#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Mini-app smoke tests: ./dxos install/remove with the hello and tea-tour apps. Run from the repo root via
# `make apps-smoke` on a seeded stack after `make platform-smoke` (its fixtures: household hh_tc_1 linked to
# smoke_farmer_tc), because tea-tour picks that household as guide and the last check runs the full platform smoke.
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh
source platform/tests/tokens.sh

command -v jq >/dev/null || { echo "jq is required (brew/apt install jq)"; exit 1; }

# This smoke purges the data of tea-tour, hello, the three business apps and custom-books, so it must never run on a stack where one is really installed.
# Checked before the EXIT trap below, which would otherwise remove them on the way out.
LISTED=$(./dxos list) || { echo "./dxos list failed; apps-smoke did not start"; exit 1; }
for id in tea-tour hello leaf-purchase tea-shop farm-supply custom-books; do
  if grep -qxF "$id" <<<"$(cut -f1 <<<"$LISTED")"; then
    echo "apps-smoke xoá dữ liệu của tea-tour, hello, leaf-purchase, tea-shop, farm-supply và custom-books, nhưng stack này đang cài $id. Không chạy trên stack có dữ liệu thật;" \
      "hãy chạy trên stack riêng (COMPOSE_PROJECT_NAME=dxos-clean make platform-up) hoặc gỡ $id trước." >&2
    exit 1
  fi
done

# [store queue] state, defined before the trap so the trap can always call it: the background worker and the
# temporary miniapps/broken-health copy.
WORKER_PID=""
WORKER_OUT="$(mktemp)"
cleanup_store() {
  [ -z "$WORKER_PID" ] || kill "$WORKER_PID" 2>/dev/null || true
  rm -r -f miniapps/broken-health miniapps/bad-shot
  for app in leaf-purchase tea-shop farm-supply custom-books; do ./dxos remove "$app" --purge >/dev/null 2>&1 || true; done
}

# Whatever fails, leave no app behind (the registry, docker/runtime/<project> and the containers outlive this script).
trap 'rc=$?; cleanup_store; ./dxos remove tea-tour --purge >/dev/null 2>&1 || true; ./dxos remove db-app --purge >/dev/null 2>&1 || true; ./dxos remove broken-health >/dev/null 2>&1 || true; ./dxos remove hello >/dev/null 2>&1 || true; exit $rc' EXIT

RUNTIME="docker/runtime/${COMPOSE_PROJECT_NAME:-docker}"  # per compose project (R13), as in the Makefile
GW_FILE="$RUNTIME/gateway/apisix.yaml"
HELLO="$COMPOSE -f $RUNTIME/apps/hello.compose.yml"
# App routes match only on the gateway's internal port 9081 (R23), which is not published to the host. Reach it from
# hasura's curl on the compose network, as smoke-dataops does; $GATEWAY (the published 9080) must answer 404.
APP_GW="http://apisix:9081"
app_curl() { $COMPOSE exec -T hasura curl "$@"; }
# assert_app_http "codes" msg -- <curl args...>: assert_http from lib.sh, through app_curl.
assert_app_http() {
  local codes="$1" msg="$2" got; shift 3
  got="$(app_curl -s -o /dev/null -w '%{http_code}' "$@")"
  case " $codes " in *" $got "*) pass "$msg";; *) fail "$msg (expected one of '$codes', got '$got')";; esac
}

# page_ok <token> <path> <label>: a page of the kit answers 200. csv_check <token> <path> <label>: a CSV download answers 200 as
# text/csv with content-disposition: attachment and starts with the UTF-8 BOM. The same download through the web proxy is
# pressed in the browser story, which needs a session (the proxy passes content-disposition: tests in the web suite).
page_ok() { assert_app_http 200 "$3 -> 200" -- -H "Authorization: Bearer $1" "$APP_GW$2"; }
csv_check() {
  local hdrs body
  hdrs="$(app_curl -s -D - -o /dev/null -H "Authorization: Bearer $1" "$APP_GW$2" | tr -d '\r')"
  if grep -q '^HTTP/[0-9.]* 200' <<<"$hdrs" && grep -qi '^content-type: text/csv' <<<"$hdrs" && grep -qi '^content-disposition: attachment' <<<"$hdrs"; then
    pass "$3 -> 200 text/csv as an attachment"
  else fail "$3 is not a CSV download: $hdrs"; fi
  body="$(app_curl -s -H "Authorization: Bearer $1" "$APP_GW$2")"
  assert_eq "$(od -An -tx1 -N3 <<<"$body" | tr -d ' ')" efbbbf "$3 starts with the UTF-8 BOM"
}

# wait_http "codes" msg -- <curl args...>: APISIX reloads the route file within about a second.
wait_http() {  # through app_curl, like assert_app_http
  local codes="$1" msg="$2" got _; shift 3
  for _ in $(seq 1 15); do
    got="$(app_curl -s -o /dev/null -w '%{http_code}' "$@")"
    case " $codes " in *" $got "*) pass "$msg"; return 0;; esac
    sleep 1
  done
  fail "$msg (expected one of '$codes', got '$got')"
}
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
# Fixed container names are not used for apps, so filter by this project (compose's default is the docker/ dir name).
app_containers() { docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-docker}" --filter "label=com.docker.compose.service=app-$1" | wc -l | tr -d ' '; }
hello_container() { $HELLO ps -q --status running app-hello; }
perm() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }  # GNU, then BSD stat

echo "[identity setup]"
kc_wait
ensure_client dxos-smoke dx-os-core,roles,profile
ensure_user smoke_manager_tc manager TC
ensure_user smoke_farmer_tc farmer TC
# Access tokens live 5 minutes and Hasura refuses an expired one (the gateway allows 120 s of slack), so a section must not
# start with an old token.
fresh_tokens() {
  local pair user var t
  for pair in smoke_manager_tc:TM smoke_farmer_tc:TF smoke_officer_tc:TO; do
    user="${pair%%:*}"; var="${pair##*:}"
    t=$(user_token "$user") || t=""; [ -n "$t" ] && [ "$t" != null ] || fail "$user token empty"
    printf -v "$var" %s "$t"
  done
}
ensure_user smoke_officer_tc officer TC
fresh_tokens
pass "smoke client and users ready"

echo "[reinstall after another app may take the old address]"
# CI run 43178558735: Docker gave hello the IP a removed tea-tour had, and the gateway still held tea-tour's old DNS
# answer (600 s TTL), so tea-tour's requests and the user's token went to hello. Each gateway worker keeps its own
# cache: tour_gets asks 30 times, each on a new connection, so the requests spread over the workers.
tour_gets() { app_curl -s -H 'Connection: close' -H "Authorization: Bearer $TM" -w '\n%{http_code} %{size_download}\n' "$APP_GW$1?n=[1-30]"; }
app_ip() { docker inspect -f "{{(index .NetworkSettings.Networks \"${COMPOSE_PROJECT_NAME:-docker}_dxos-apps-net\").IPAddress}}" \
  "$(docker ps -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-docker}" --filter "label=com.docker.compose.service=app-$1")"; }
./dxos remove tea-tour --purge >/dev/null 2>&1 || true
./dxos install miniapps/tea-tour >/dev/null && pass "./dxos install miniapps/tea-tour exits 0" || fail "./dxos install miniapps/tea-tour"
wait_http 200 "manager token -> 200 on /apps/tea-tour/" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/tea-tour/"
TITLE="Tour reinstall $$"
HDRS=$(app_curl -s -D - -o /dev/null -H "Authorization: Bearer $TM" --data-urlencode "title=$TITLE" \
  --data-urlencode "starts_at=$(( $(date +%Y) + 1 ))-06-01T07:30" --data-urlencode "meeting_point=Nhà văn hoá xóm Hồng Thái" \
  -d seats=5 -d price_vnd=250000 -d guide=hh_tc_1 "$APP_GW/apps/tea-tour/tours")
LOC=$(grep -i '^location:' <<<"$HDRS" | tr -d '\r' | cut -d' ' -f2)
[[ "$LOC" =~ ^/apps/tea-tour/tours/[0-9a-f-]{36}$ ]] && pass "manager creates a tour before the reinstall" || fail "create tour not 303: $HDRS"
assert_eq "$(tour_gets "$LOC" | grep -c '^200 ')" 30 "tour page -> 200 on 30 connections (every worker caches app-tea-tour)"
OLD_IP=$(app_ip tea-tour)
./dxos remove tea-tour >/dev/null && pass "./dxos remove tea-tour (data kept) exits 0" || fail "./dxos remove tea-tour"
./dxos install miniapps/hello >/dev/null && pass "./dxos install miniapps/hello exits 0" || fail "./dxos install miniapps/hello"
HELLO_IP=$(app_ip hello)
./dxos install miniapps/tea-tour >/dev/null && pass "./dxos reinstall of tea-tour exits 0" || fail "./dxos reinstall of tea-tour"
echo "  app-tea-tour was $OLD_IP, hello got $HELLO_IP$([ "$OLD_IP" = "$HELLO_IP" ] && echo ' (reused)'), app-tea-tour is now $(app_ip tea-tour)"
wait_http 200 "manager token -> 200 on /apps/tea-tour/ after the reinstall" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/tea-tour/"
OUT=$(tour_gets "$LOC")
assert_eq "$(grep -c '^200 ' <<<"$OUT")" 30 "kept tour page -> 200 on all 30 connections after the reinstall"
assert_eq "$(grep -c "<h1>$TITLE</h1>" <<<"$OUT")" 30 "all 30 answers render the kept tour, which only tea-tour has"
grep -q -e '^404 21$' -e 'Không có trang này' <<<"$OUT" && fail "a request to tea-tour got hello's 404: $(grep -c '^404 21$' <<<"$OUT") of 30" \
  || pass "no request to tea-tour got hello's 21-byte 404"
./dxos remove tea-tour --purge >/dev/null && ./dxos remove hello >/dev/null && pass "tea-tour (--purge) and hello removed" \
  || fail "remove tea-tour --purge / hello"

echo "[install hello]"
./dxos remove hello >/dev/null 2>&1 || true  # an orphan app-hello container a crashed run left (the guard refuses a registered hello)
./dxos install miniapps/hello && pass "./dxos install miniapps/hello exits 0" || fail "./dxos install miniapps/hello"
wait_http 200 "manager token -> 200 on /apps/hello/" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
assert_http 404 "published port 9080 -> 404 on /apps/hello/ while hello is installed (R23)" -- \
  -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/"
BODY=$(app_curl -s -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/")
# The name claim is "first last" only while ensure_user has not re-run for an existing user (its update drops the
# names); without it the app falls back to preferred_username.
grep -Eq 'Xin chào smoke_manager_tc( Smoke)?, HTX TC, vai trò manager' <<<"$BODY" && pass "page greets the token's name, HTX and role" \
  || fail "page greeting wrong: $BODY"
grep -q 'href="/dxos-app.css"' <<<"$BODY" && pass "page links /dxos-app.css" || fail "page does not link /dxos-app.css"
grep -q 'action="/apps/hello/echo"' <<<"$BODY" && pass "form posts under the /apps/hello prefix" || fail "form action not prefixed"
assert_app_http 401 "no token -> 401 on /apps/hello/" -- "$APP_GW/apps/hello/"

echo "[echo form]"
HDRS=$(app_curl -s -D - -o /dev/null -X POST -H "Authorization: Bearer $TM" --data-urlencode 'message=<b>chè</b>' "$APP_GW/apps/hello/echo")
grep -q '^HTTP/[0-9.]* 303' <<<"$HDRS" && pass "POST /apps/hello/echo -> 303" || fail "POST /apps/hello/echo not 303: $HDRS"
LOC=$(grep -i '^location:' <<<"$HDRS" | tr -d '\r' | cut -d' ' -f2)
case "$LOC" in /apps/hello/\?said=*) pass "echo redirects under the prefix ($LOC)";; *) fail "echo Location wrong: '$LOC'";; esac
SAID=$(app_curl -s -H "Authorization: Bearer $TM" "$APP_GW$LOC")
grep -q '&lt;b&gt;chè&lt;/b&gt;' <<<"$SAID" && ! grep -q '<b>chè' <<<"$SAID" && pass "echoed message is HTML-escaped" \
  || fail "echoed message not escaped"
got=$($HELLO exec -T app-hello python -c "import urllib.request as u, urllib.error as e
try: u.urlopen(u.Request('http://127.0.0.1:8080/echo', data=b'message=x'))
except e.HTTPError as x: print(x.code)")
assert_eq "$got" 401 "direct POST /echo without a token -> 401"

echo "[registry]"
assert_eq "$(psql_app "select count(*) from platform.installed_apps where id='hello'")" 1 "platform.installed_apps has the hello row"
LIST=$(./dxos list) || fail "./dxos list failed"
grep -Eq $'^hello\t.*\\(healthy\\)$' <<<"$LIST" && pass "./dxos list shows hello healthy" || fail "./dxos list: $LIST"
./dxos install miniapps/hello && pass "installing hello again exits 0 (idempotent)" || fail "second install of hello failed"
assert_eq "$(psql_app "select count(*) from platform.installed_apps where id='hello'")" 1 "still one hello row"
assert_app_http 200 "hello still answers after the second install" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"

echo "[failed install is undone]"
BEFORE=$(sha "$GW_FILE")
rc=0; ./dxos install platform/cli/tests/fixtures/broken-health || rc=$?
assert_eq "$rc" 1 "install broken-health (healthz answers 500) exits 1"
assert_eq "$(sha "$GW_FILE")" "$BEFORE" "gateway file sha256 equals its value before the failed install"
LIST=$(./dxos list) || fail "./dxos list failed"
grep -q broken-health <<<"$LIST" && fail "./dxos list shows broken-health: $LIST" || pass "./dxos list does not show broken-health"
assert_eq "$(psql_app "select count(*) from platform.installed_apps where id='broken-health'")" 0 "no broken-health row"
assert_eq "$(find "$RUNTIME" -name 'broken-health*' | wc -l | tr -d ' ')" 0 "no broken-health runtime file left"
assert_eq "$(app_containers broken-health)" 0 "no app-broken-health container left"
assert_app_http 200 "hello unaffected by the failed install" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"

echo "[database app]"
DB_ENV="$RUNTIME/apps/db-app.env"
./dxos install platform/cli/tests/fixtures/db-app && pass "./dxos install db-app exits 0" || fail "./dxos install db-app"
assert_eq "$(psql_app "select count(*) from pg_namespace where nspname='app_db_app'")" 1 "schema app_db_app exists"
assert_eq "$(psql_app "select count(*) from pg_roles where rolname='app_db_app'")" 1 "role app_db_app exists"
assert_eq "$(perm "$DB_ENV")" 600 "db-app env file has mode 600"
URL=$(sed -n 's/^DXOS_APP_DB_URL=//p' "$DB_ENV")  # holds the password: compared, never printed
[ "$($COMPOSE -f "$RUNTIME/apps/db-app.compose.yml" exec -T app-db-app printenv DXOS_APP_DB_URL)" = "$URL" ] \
  && pass "app container gets DXOS_APP_DB_URL from the env file" || fail "app container DXOS_APP_DB_URL differs from the env file"
assert_eq "$($COMPOSE exec -T postgres psql "$URL" -tAc 'select count(*) from notes')" 0 "app role logs in with that URL and reads its own table"
./dxos remove db-app --purge && pass "./dxos remove db-app --purge exits 0" || fail "./dxos remove db-app --purge"
assert_eq "$(psql_app "select count(*) from pg_namespace where nspname='app_db_app'")" 0 "--purge dropped schema app_db_app"
assert_eq "$(psql_app "select count(*) from pg_roles where rolname='app_db_app'")" 0 "--purge dropped role app_db_app"
[ ! -e "$DB_ENV" ] && pass "--purge deleted the db-app env file" || fail "db-app env file left after --purge"

echo "[tea-tour]"
./dxos remove tea-tour --purge >/dev/null 2>&1 || true  # a fresh schema, whatever an earlier run or the browser story left
TEA_ENV="$RUNTIME/apps/tea-tour.env"
./dxos install miniapps/tea-tour && pass "./dxos install miniapps/tea-tour exits 0" || fail "./dxos install miniapps/tea-tour"
fresh_tokens
wait_http 200 "manager token -> 200 on /apps/tea-tour/" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/tea-tour/"
assert_app_http 401 "no token -> 401 on /apps/tea-tour/" -- "$APP_GW/apps/tea-tour/"
assert_http 404 "published port 9080 -> 404 on the public /apps/tea-tour/public/TC (R23)" -- "$GATEWAY/apps/tea-tour/public/TC"
# refused <token> <path> <who>: the gateway's role check (R3) answers before the app. The app refuses a wrong role
# too, but with its own page, which links /dxos-app.css; the gateway's answer must not be such a page.
refused() {
  local out code
  out="$(app_curl -s -w $'\n%{http_code}' -H "Authorization: Bearer $1" "$APP_GW$2")"; code="${out##*$'\n'}"
  case "$code" in 401|403) ;; *) fail "$3 token on $2 not refused: HTTP $code" ;; esac
  grep -q 'dxos-app.css' <<<"${out%$'\n'*}" && fail "$3 token on $2 got an app page (HTTP $code), not the gateway's refusal"
  pass "$3 token on $2 -> HTTP $code from the gateway, no app content"
}
refused "$TF" /apps/tea-tour/ smoke_farmer_tc
refused "$TF" /apps/tea-tour/tours smoke_farmer_tc
refused "$TM" /apps/tea-tour/guide smoke_manager_tc

TITLE="Tour smoke $$"
START="$(( $(date +%Y) + 1 ))-05-01T07:30"
HDRS=$(app_curl -s -D - -o /dev/null -H "Authorization: Bearer $TM" --data-urlencode "title=$TITLE" \
  --data-urlencode "starts_at=$START" --data-urlencode "meeting_point=Nhà văn hoá xóm Hồng Thái" \
  -d seats=5 -d price_vnd=250000 -d guide=hh_tc_1 "$APP_GW/apps/tea-tour/tours")
grep -q '^HTTP/[0-9.]* 303' <<<"$HDRS" && pass "manager creates a tour with guide hh_tc_1 -> 303" || fail "create tour not 303: $HDRS"
LOC=$(grep -i '^location:' <<<"$HDRS" | tr -d '\r' | cut -d' ' -f2)
TOUR="${LOC##*/}"
[[ "$LOC" =~ ^/apps/tea-tour/tours/[0-9a-f-]{36}$ ]] && pass "create redirects to the tour page ($LOC)" || fail "create Location wrong: '$LOC'"
grep -qF "$TITLE" <<<"$(app_curl -s "$APP_GW/apps/tea-tour/public/TC")" && pass "public page lists the tour without a token" \
  || fail "public page does not list $TITLE"
HDRS=$(app_curl -s -D - -o /dev/null --data-urlencode "guest_name=Nguyễn Thị Hoa" -d phone=0912345678 -d party_size=2 \
  "$APP_GW/apps/tea-tour/public/TC/tours/$TOUR/book")
LOC=$(grep -i '^location:' <<<"$HDRS" | tr -d '\r' | cut -d' ' -f2)
CODE=$(sed -n 's/.*[?&]code=\([A-Z0-9]*\).*/\1/p' <<<"$LOC")
[[ "$LOC" == /apps/tea-tour/public/TC/booking\?* && -n "$CODE" ]] && pass "guest books 2 seats without a token -> code $CODE" \
  || fail "booking Location wrong: '$LOC'"
assert_eq "$(psql_app "select party_size || ' ' || status from app_tea_tour.bookings where code = '$CODE'")" "2 PENDING" \
  "booking stored: 2 seats, PENDING"
grep -qF "$TITLE" <<<"$(app_curl -s -H "Authorization: Bearer $TF" "$APP_GW/apps/tea-tour/guide")" \
  && pass "guide farmer sees the tour on /apps/tea-tour/guide" || fail "smoke_farmer_tc /guide does not list $TITLE"
page_ok "$TM" /apps/tea-tour/bookings "tea-tour bookings list"
page_ok "$TM" "/apps/tea-tour/bookings?q=Ho%25&status=PENDING&page=999999" "tea-tour bookings list with wildcard search and a page far out"
csv_check "$TM" /apps/tea-tour/tours/$TOUR/guests/export.csv "tea-tour guest list CSV"
page_ok "$TM" /apps/tea-tour/tours/$TOUR/print "tea-tour group list print page"
refused "$TF" /apps/tea-tour/tours/$TOUR/guests/export.csv smoke_farmer_tc

./dxos remove tea-tour && pass "./dxos remove tea-tour exits 0" || fail "./dxos remove tea-tour"
wait_http 404 "removed tea-tour public route -> 404" -- "$APP_GW/apps/tea-tour/public/TC"
assert_eq "$(psql_app "select count(*) from app_tea_tour.bookings where code = '$CODE'")" 1 "remove without --purge keeps the bookings"
./dxos remove tea-tour --purge && pass "./dxos remove tea-tour --purge exits 0" || fail "./dxos remove tea-tour --purge"
assert_eq "$(psql_app "select count(*) from pg_namespace where nspname='app_tea_tour'")" 0 "--purge dropped schema app_tea_tour"
assert_eq "$(psql_app "select count(*) from pg_roles where rolname='app_tea_tour'")" 0 "--purge dropped role app_tea_tour"
[ ! -e "$TEA_ENV" ] && pass "--purge deleted the tea-tour env file" || fail "tea-tour env file left after --purge"

echo "[platform-up with hello installed]"
CID=$(hello_container); [ -n "$CID" ] || fail "app-hello not running before platform-up"
PG_BEFORE=$($COMPOSE ps -q postgres)
make platform-up >/dev/null || fail "make platform-up with hello installed"
pass "make platform-up exits 0 with hello installed"
# Rebuilding unchanged images must not recreate a running core container (CI runs 43224292853, 43224322784: postgres
# was recreated under keycloak, whose next admin call got a 500).
assert_eq "$($COMPOSE ps -q postgres)" "$PG_BEFORE" "postgres container kept running through platform-up"
# Even a legitimate restart must not fail the next steps: wait for the admin API, the token endpoint and the gateway.
kc_ready
for _ in $(seq 1 30); do
  TM=$(user_token smoke_manager_tc 2>/dev/null) && [ -n "$TM" ] && [ "$TM" != null ] && break
  TM=""; sleep 2
done
[ -n "$TM" ] || fail "smoke_manager_tc token not available 60s after platform-up"
wait_http 200 "/apps/hello/ still 200 after platform-up" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
assert_eq "$(hello_container)" "$CID" "app-hello container kept running through platform-up"

echo "[remove hello]"
./dxos remove hello && pass "./dxos remove hello exits 0" || fail "./dxos remove hello"
wait_http 404 "removed app route -> 404" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
assert_eq "$(app_containers hello)" 0 "app-hello container removed"
assert_eq "$(psql_app "select count(*) from platform.installed_apps")" 0 "registry empty after remove"

echo "[gateway guard]"
# A hand-typed compose command (no DXOS_GATEWAY_FILE) recreates apisix on the base route file; install must refuse.
env -u DXOS_GATEWAY_FILE $COMPOSE up -d --no-deps apisix >/dev/null 2>&1 || fail "recreate apisix on the base route file"
ERR=$(./dxos install miniapps/hello 2>&1 >/dev/null) && fail "install succeeded while the gateway read the base route file" \
  || pass "./dxos install exits non-zero while the gateway reads the base route file"
grep -q 'make gateway-up' <<<"$ERR" && pass "the refusal names make gateway-up" || fail "the refusal does not name make gateway-up: $ERR"
assert_eq "$(psql_app "select count(*) from platform.installed_apps" | sed -n 1p)" 0 "registry still empty after the refusal"
make gateway-up >/dev/null 2>&1 && pass "make gateway-up exits 0" || fail "make gateway-up"
SRC=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/usr/local/apisix/conf/apisix.yaml"}}{{.Source}}{{end}}{{end}}' "$($COMPOSE ps -q apisix)")
case "$SRC" in */"$RUNTIME/gateway/apisix.yaml") pass "gateway mounts the runtime route file";; *) fail "gateway mount source is '$SRC'";; esac
wait_http 404 "gateway answers again" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
fresh_tokens
./dxos install miniapps/hello && pass "./dxos install exits 0 once the gateway is back" || fail "./dxos install after make gateway-up"
wait_http 200 "manager token -> 200 on /apps/hello/ after the guard" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
./dxos remove hello >/dev/null && pass "hello removed after the guard section" || fail "./dxos remove hello after the guard section"
assert_eq "$(psql_app "select count(*) from platform.installed_apps" | sed -n 1p)" 0 "registry empty after the guard section"

echo "[business apps]"
# The three business apps of the store: install, role routes through the gateway, one write each, purge.
# post_loc <token|""> <path> <curl data args...>: the Location of a 303, otherwise the status line.
post_loc() {
  local tok="$1" path="$2" hdrs auth=(); shift 2
  [ -z "$tok" ] || auth=(-H "Authorization: Bearer $tok")
  hdrs=$(app_curl -s -D - -o /dev/null ${auth[@]+"${auth[@]}"} "$@" "$APP_GW$path")
  if grep -q '^HTTP/[0-9.]* 303' <<<"$hdrs"; then grep -i '^location:' <<<"$hdrs" | tr -d '\r' | cut -d' ' -f2
  else head -n 1 <<<"$hdrs" | tr -d '\r'; fi
}
get_page() { app_curl -s -H "Authorization: Bearer $1" "$APP_GW$2"; }
purged() {  # <app id> <schema>
  ./dxos remove "$1" --purge && pass "./dxos remove $1 --purge exits 0" || fail "./dxos remove $1 --purge"
  assert_eq "$(psql_app "select count(*) from pg_namespace where nspname='$2'")" 0 "--purge dropped schema $2"
  assert_eq "$(psql_app "select count(*) from pg_roles where rolname='$2'")" 0 "--purge dropped role $2"
}
DAY=$(TZ=Asia/Ho_Chi_Minh date +%F)
NOID=00000000-0000-0000-0000-000000000000

echo "[leaf-purchase]"
./dxos remove leaf-purchase --purge >/dev/null 2>&1 || true
./dxos install miniapps/leaf-purchase && pass "./dxos install miniapps/leaf-purchase exits 0" || fail "./dxos install miniapps/leaf-purchase"
fresh_tokens
LP=/apps/leaf-purchase
wait_http 200 "officer token -> 200 on $LP/" -- -H "Authorization: Bearer $TO" "$APP_GW$LP/"
assert_app_http 200 "manager token -> 200 on $LP/periods" -- -H "Authorization: Bearer $TM" "$APP_GW$LP/periods"
assert_app_http 200 "manager token -> 200 on $LP/prices" -- -H "Authorization: Bearer $TM" "$APP_GW$LP/prices"
assert_app_http 200 "farmer token -> 200 on $LP/mine" -- -H "Authorization: Bearer $TF" "$APP_GW$LP/mine"
assert_app_http 401 "no token -> 401 on $LP/" -- "$APP_GW$LP/"
assert_http 404 "published port 9080 -> 404 on $LP/ (R23)" -- -H "Authorization: Bearer $TM" "$GATEWAY$LP/"
refused "$TF" $LP/ smoke_farmer_tc
refused "$TF" $LP/tickets/$NOID/edit smoke_farmer_tc  # /tickets/* falls under the "/" prefix rule
refused "$TO" $LP/prices smoke_officer_tc
refused "$TO" $LP/periods smoke_officer_tc
refused "$TO" $LP/periods/$NOID smoke_officer_tc  # /periods/* falls under the /periods prefix rule
refused "$TM" $LP/mine smoke_manager_tc
assert_app_http 404 "officer on an unknown ticket reaches the app: 404, not the gateway's refusal" -- \
  -H "Authorization: Bearer $TO" "$APP_GW$LP/tickets/$NOID/edit"
assert_app_http 404 "manager on an unknown period reaches the app: 404" -- -H "Authorization: Bearer $TM" "$APP_GW$LP/periods/$NOID"

# The household lists come from Hasura with the caller's own token and role.
grep -q '<option value="hh_tc_1"' <<<"$(get_page "$TO" $LP/)" && pass "officer's household list (Hasura, role officer) offers hh_tc_1" \
  || fail "officer page does not offer hh_tc_1"
grep -q '<option value="hh_lb_' <<<"$(get_page "$TO" $LP/)" && fail "officer page offers an LB household" || pass "officer page offers no household of another HTX"
grep -q '<option value="hh_tc_1"' <<<"$(get_page "$TM" $LP/)" && pass "manager's household list (Hasura, role manager) offers hh_tc_1" \
  || fail "manager page does not offer hh_tc_1"
grep -q 'app-header-subtitle">Hộ ' <<<"$(get_page "$TF" $LP/mine)" && pass "farmer's /mine names the farmer's own household (Hasura, role farmer)" \
  || fail "farmer /mine shows no household"

LOC=$(post_loc "$TM" $LP/prices --data-urlencode "name=Búp tươi loại 1" -d price_vnd=9000)
assert_eq "$LOC" "$LP/prices?notice=price" "manager adds a grade -> 303"
GRADE=$(psql_app "select id from app_leaf_purchase.grades where name = 'Búp tươi loại 1'")
LOC=$(post_loc "$TO" $LP/tickets -d household=hh_tc_1 -d "weighed_on=$DAY" -d "grade=$GRADE" --data-urlencode "kg=12,5")
assert_eq "$LOC" "$LP/?day=$DAY&notice=saved" "officer writes a ticket for hh_tc_1 -> 303"
assert_eq "$(psql_app "select kg || ' ' || amount_vnd from app_leaf_purchase.tickets where household_id = 'hh_tc_1'")" "12.5 112500" \
  "ticket stored: 12.5 kg at 9000 = 112500"
LOC=$(post_loc "$TM" $LP/periods -d "date_from=$DAY" -d "date_to=$DAY")
[[ "$LOC" =~ ^$LP/periods/[0-9a-f-]{36}$ ]] && pass "manager closes a period -> 303 ($LOC)" || fail "close period Location wrong: '$LOC'"
PERIOD="${LOC##*/}"
assert_eq "$(psql_app "select household_id || ' ' || total_vnd from app_leaf_purchase.payouts where period_id = '$PERIOD'")" "hh_tc_1 112500" \
  "the period holds one payout: hh_tc_1 112500"
PAYOUT=$(psql_app "select id from app_leaf_purchase.payouts where period_id = '$PERIOD'")
page_ok "$TM" $LP/overview "leaf-purchase overview"
page_ok "$TO" "$LP/tickets?q=Household%25&page=0" "leaf-purchase ticket list (officer, wildcard search, page 0)"
csv_check "$TM" "$LP/tickets/export.csv?from=$DAY&to=$DAY" "leaf-purchase ticket CSV"
TICKET=$(psql_app "select id from app_leaf_purchase.tickets where household_id = 'hh_tc_1'" | sed -n 1p)
page_ok "$TO" $LP/tickets/$TICKET/print "leaf-purchase weighing slip print page"
csv_check "$TM" $LP/periods/$PERIOD/export.csv "leaf-purchase payout CSV"
page_ok "$TM" $LP/periods/$PERIOD/print "leaf-purchase payout sheet print page"
refused "$TF" $LP/tickets/export.csv smoke_farmer_tc
grep -q 'Chưa trả' <<<"$(get_page "$TF" $LP/mine)" && pass "farmer sees the payout as unpaid" || fail "farmer /mine shows no unpaid payout"
LOC=$(post_loc "$TM" $LP/periods/$PERIOD/payouts/$PAYOUT/paid -X POST)
[[ "$LOC" == $LP/periods/$PERIOD* ]] && pass "manager marks the payout paid -> 303" || fail "mark paid Location wrong: '$LOC'"
grep -q 'Đã trả' <<<"$(get_page "$TF" $LP/mine)" && pass "farmer sees the payout as paid" || fail "farmer /mine does not show Đã trả"
./dxos remove leaf-purchase >/dev/null && pass "./dxos remove leaf-purchase exits 0"
assert_eq "$(psql_app "select count(*) from app_leaf_purchase.tickets")" 1 "remove without --purge keeps the ticket"
purged leaf-purchase app_leaf_purchase
wait_http 404 "removed leaf-purchase route -> 404" -- -H "Authorization: Bearer $TO" "$APP_GW$LP/"

echo "[tea-shop]"
./dxos remove tea-shop --purge >/dev/null 2>&1 || true
./dxos install miniapps/tea-shop && pass "./dxos install miniapps/tea-shop exits 0" || fail "./dxos install miniapps/tea-shop"
fresh_tokens
TS=/apps/tea-shop
wait_http 200 "manager token -> 200 on $TS/" -- -H "Authorization: Bearer $TM" "$APP_GW$TS/"
assert_app_http 401 "no token -> 401 on $TS/" -- "$APP_GW$TS/"
assert_app_http 200 "no token -> 200 on the public $TS/public/TC" -- "$APP_GW$TS/public/TC"
assert_http 404 "published port 9080 -> 404 on the public $TS/public/TC (R23)" -- "$GATEWAY$TS/public/TC"
assert_http 404 "published port 9080 -> 404 on $TS/ (R23)" -- -H "Authorization: Bearer $TM" "$GATEWAY$TS/"
refused "$TF" $TS/ smoke_farmer_tc
refused "$TO" $TS/ smoke_officer_tc
LOC=$(post_loc "$TM" $TS/products --data-urlencode "name=Chè Shan Tuyết" --data-urlencode "pack=Gói 200g" -d price_vnd=95000 -d stock=10 -d active=on)
assert_eq "$LOC" "$TS/" "manager adds a product -> 303"
PRODUCT=$(psql_app "select id from app_tea_shop.products where htx_code = 'TC' and name = 'Chè Shan Tuyết'")
grep -q 'Chè Shan Tuyết' <<<"$(app_curl -s "$APP_GW$TS/public/TC")" && pass "public page lists the product without a token" || fail "public page does not list the product"
grep -q 'Chè Shan Tuyết' <<<"$(app_curl -s "$APP_GW$TS/public/LB")" && fail "the product of TC shows on the LB public page" || pass "LB's public page does not show TC's product"
LOC=$(post_loc "" $TS/public/TC/order -d "product_id=$PRODUCT" -d quantity=2 --data-urlencode "customer_name=Nguyễn Thị Hoa" -d phone=0912345678 \
  --data-urlencode "address=Xóm Hồng Thái")
CODE=$(sed -n 's/.*[?&]code=\([A-Z0-9]*\).*/\1/p' <<<"$LOC")
[[ "$LOC" == $TS/public/TC/order\?* && -n "$CODE" ]] && pass "guest orders 2 packs without a token -> code $CODE" || fail "order Location wrong: '$LOC'"
assert_eq "$(psql_app "select o.status || ' ' || p.stock from app_tea_shop.orders o, app_tea_shop.products p where o.code = '$CODE' and p.id = '$PRODUCT'")" "NEW 8" \
  "order stored NEW and stock 10 -> 8"
OID=$(psql_app "select id from app_tea_shop.orders where code = '$CODE'")
LOC=$(post_loc "$TM" $TS/orders/$OID/advance -X POST)
[[ "$LOC" == $TS/orders/$OID* ]] && pass "manager confirms the order -> 303" || fail "advance Location wrong: '$LOC'"
assert_eq "$(psql_app "select status from app_tea_shop.orders where id = '$OID'")" CONFIRMED "order is CONFIRMED"
page_ok "$TM" "$TS/orders?status=CONFIRMED&q=Nguy%25" "tea-shop order list (status filter, wildcard search)"
page_ok "$TM" $TS/products "tea-shop product list"
csv_check "$TM" "$TS/orders/export.csv?status=CONFIRMED" "tea-shop order CSV"
page_ok "$TM" $TS/orders/$OID/print "tea-shop delivery note print page"
refused "$TF" $TS/orders/export.csv smoke_farmer_tc
grep -q 'Nguyễn Thị Hoa' <<<"$(app_curl -s "$APP_GW$TS/public/TC/order?code=$CODE&phone=0912345678")" \
  && pass "lookup with code and phone shows the order" || fail "lookup with code and phone shows nothing"
assert_app_http 404 "lookup with the wrong phone -> 404" -- "$APP_GW$TS/public/TC/order?code=$CODE&phone=0987654321"
./dxos remove tea-shop >/dev/null && pass "./dxos remove tea-shop exits 0"
assert_eq "$(psql_app "select count(*) from app_tea_shop.orders where code = '$CODE'")" 1 "remove without --purge keeps the order"
purged tea-shop app_tea_shop

echo "[farm-supply]"
./dxos remove farm-supply --purge >/dev/null 2>&1 || true
./dxos install miniapps/farm-supply && pass "./dxos install miniapps/farm-supply exits 0" || fail "./dxos install miniapps/farm-supply"
fresh_tokens
FS=/apps/farm-supply
wait_http 200 "manager token -> 200 on $FS/" -- -H "Authorization: Bearer $TM" "$APP_GW$FS/"
assert_app_http 200 "farmer token -> 200 on $FS/mine" -- -H "Authorization: Bearer $TF" "$APP_GW$FS/mine"
assert_app_http 401 "no token -> 401 on $FS/" -- "$APP_GW$FS/"
assert_http 404 "published port 9080 -> 404 on $FS/ (R23)" -- -H "Authorization: Bearer $TM" "$GATEWAY$FS/"
refused "$TF" $FS/ smoke_farmer_tc
refused "$TF" $FS/rounds/$NOID smoke_farmer_tc
refused "$TM" $FS/mine smoke_manager_tc
refused "$TO" $FS/ smoke_officer_tc
grep -q 'Nông hộ: ' <<<"$(get_page "$TF" $FS/mine)" && pass "farmer's /mine names the farmer's own household (Hasura, role farmer)" \
  || fail "farmer /mine shows no household"
LOC=$(post_loc "$TM" $FS/rounds --data-urlencode "title=Phân bón vụ xuân" -d "deadline=$(( $(date +%Y) + 1 ))-03-01T17:00")
[[ "$LOC" =~ ^$FS/rounds/[0-9a-f-]{36}$ ]] && pass "manager opens a round -> 303 ($LOC)" || fail "open round Location wrong: '$LOC'"
ROUND="${LOC##*/}"
LOC=$(post_loc "$TM" $FS/rounds/$ROUND/items --data-urlencode "name=Phân NPK" --data-urlencode "unit=bao 50kg" -d price_vnd=450000)
assert_eq "$LOC" "$FS/rounds/$ROUND?notice=saved" "manager adds the first item -> 303"
LOC=$(post_loc "$TM" $FS/rounds/$ROUND/items --data-urlencode "name=Thuốc trừ sâu sinh học" --data-urlencode "unit=chai" -d price_vnd=85000)
assert_eq "$LOC" "$FS/rounds/$ROUND?notice=saved" "manager adds the second item -> 303"
[[ "$(post_loc "$TM" $FS/rounds/$ROUND/items -d name= -d unit=bao -d price_vnd=1)" == HTTP/*\ 400* ]] && pass "an item without a name -> 400" \
  || fail "an item without a name was not refused with 400"
ITEM1=$(psql_app "select id from app_farm_supply.items where name = 'Phân NPK'")
ITEM2=$(psql_app "select id from app_farm_supply.items where name = 'Thuốc trừ sâu sinh học'")
LOC=$(post_loc "$TF" $FS/mine/rounds/$ROUND -d "q_$ITEM1=2" --data-urlencode "q_$ITEM2=1,5")
assert_eq "$LOC" "$FS/mine?notice=saved" "farmer registers 2 bao and 1,5 chai -> 303"
assert_eq "$(psql_app "select household_id || ' ' || count(*) from app_farm_supply.requests group by household_id")" "hh_tc_1 2" "two requests stored for hh_tc_1"
page_ok "$TM" "$FS/?status=open&page=999999" "farm-supply round list (status filter, a page far out)"
csv_check "$TM" $FS/rounds/$ROUND/items/export.csv "farm-supply item CSV"
csv_check "$TM" $FS/rounds/$ROUND/households/export.csv "farm-supply household CSV"
page_ok "$TM" $FS/rounds/$ROUND/print "farm-supply delivery sheet print page"
refused "$TF" $FS/rounds/$ROUND/items/export.csv smoke_farmer_tc
LOC=$(post_loc "$TM" $FS/rounds/$ROUND/close -X POST)
assert_eq "$LOC" "$FS/rounds/$ROUND" "manager closes the round -> 303"
LOC=$(post_loc "$TF" $FS/mine/rounds/$ROUND -d "q_$ITEM1=9")
[ "$LOC" != "$FS/mine?notice=saved" ] && pass "farmer cannot register after the close ($LOC)" || fail "a registration was accepted after the close"
LOC=$(post_loc "$TM" $FS/rounds/$ROUND/settlements/hh_tc_1/delivered -X POST)
assert_eq "$LOC" "$FS/rounds/$ROUND?notice=marked" "manager marks hh_tc_1 delivered -> 303"
assert_eq "$(psql_app "select (delivered_at is not null) || ' ' || (paid_at is not null) from app_farm_supply.settlements where household_id = 'hh_tc_1'")" "true false" \
  "settlement: delivered, not yet paid"
grep -q 'Đã giao' <<<"$(get_page "$TM" $FS/rounds/$ROUND)" && pass "round page shows Đã giao" || fail "round page does not show Đã giao"
./dxos remove farm-supply >/dev/null && pass "./dxos remove farm-supply exits 0"
assert_eq "$(psql_app "select count(*) from app_farm_supply.rounds")" 1 "remove without --purge keeps the round"
purged farm-supply app_farm_supply

echo "[custom-books]"
./dxos remove custom-books --purge >/dev/null 2>&1 || true
./dxos install miniapps/custom-books && pass "./dxos install miniapps/custom-books exits 0" || fail "./dxos install miniapps/custom-books"
fresh_tokens
CB=/apps/custom-books
wait_http 200 "manager token -> 200 on $CB/" -- -H "Authorization: Bearer $TM" "$APP_GW$CB/"
assert_app_http 200 "farmer token -> 200 on $CB/" -- -H "Authorization: Bearer $TF" "$APP_GW$CB/"
assert_app_http 401 "no token -> 401 on $CB/" -- "$APP_GW$CB/"
assert_http 404 "published port 9080 -> 404 on $CB/ (R23)" -- -H "Authorization: Bearer $TM" "$GATEWAY$CB/"
refused "$TF" $CB/books smoke_farmer_tc
refused "$TO" $CB/books/new smoke_officer_tc
assert_eq "$(get_page "$TM" $CB/feed | jq -c '{n: (.entries | length), create: .create.path}')" '{"n":0,"create":"/books/new"}' "feed of an empty HTX: no entries, the manager gets the create link"
assert_eq "$(get_page "$TF" $CB/feed | jq -c 'has("create")')" false "feed: a farmer gets no create link"
page_ok "$TM" $CB/books/new "template chooser"
# A book from the picking template (officer: all, farmer: own, approval on) and one from the cashbook template (farmer: none).
LOC=$(post_loc "$TM" $CB/books -d template=picking)
[[ "$LOC" =~ ^$CB/books/[0-9a-f-]{36}/design$ ]] && pass "manager creates a book from the picking template -> 303 ($LOC)" || fail "create book Location wrong: '$LOC'"
BOOK=$(sed -E 's#.*/books/([0-9a-f-]{36})/design#\1#' <<<"$LOC")
assert_eq "$(get_page "$TM" $CB/feed | jq '.entries | length')" 0 "a draft book is not in the feed"
LOC=$(post_loc "$TM" $CB/books/$BOOK/publish -X POST)
assert_eq "$LOC" "$CB/b/$BOOK" "manager publishes the book -> 303"
LOC=$(post_loc "$TM" $CB/books -d template=cashbook)
CASH=$(sed -E 's#.*/books/([0-9a-f-]{36})/design#\1#' <<<"$LOC")
assert_eq "$(post_loc "$TM" $CB/books/$CASH/publish -X POST)" "$CB/b/$CASH" "manager publishes the cashbook (farmer: none)"
fresh_tokens
FEED_O=$(get_page "$TO" $CB/feed); FEED_F=$(get_page "$TF" $CB/feed)
assert_eq "$(jq -r --arg p "/b/$BOOK" '[.entries[] | select(.path == $p)] | length' <<<"$FEED_O")" 1 "feed: the officer lists the picking book"
assert_eq "$(jq -r --arg p "/b/$CASH" '[.entries[] | select(.path == $p)] | length' <<<"$FEED_O")" 1 "feed: the officer lists the cashbook (level own)"
assert_eq "$(jq -r --arg p "/b/$BOOK" '[.entries[] | select(.path == $p)] | length' <<<"$FEED_F")" 1 "feed: the farmer lists the picking book"
assert_eq "$(jq -r --arg p "/b/$CASH" '[.entries[] | select(.path == $p)] | length' <<<"$FEED_F")" 0 "feed: a role at level none does not list the cashbook"
assert_eq "$(jq -r '.entries[0] | [.label, .icon] | join("|")' <<<"$FEED_F")" "Chấm công hái chè|leaf" "feed entry carries the book's name and icon"
assert_eq "$(jq -c 'has("create")' <<<"$FEED_F")" false "feed: no create link for the farmer"
assert_app_http 403 "farmer token on the cashbook (level none) -> 403 from the app" -- -H "Authorization: Bearer $TF" "$APP_GW$CB/b/$CASH"
# Rows: the farmer's own household, the officer's row for the same household.
MARK_F=12.5; MARK_O=77.7
LOC=$(post_loc "$TF" $CB/b/$BOOK/records -d "f1=$DAY" -d f2=hh_tc_1 -d "f3=$MARK_F" --data-urlencode "f4=Chè búp tươi")
assert_eq "$LOC" "$CB/b/$BOOK?notice=saved" "farmer adds a row -> 303"
LOC=$(post_loc "$TO" $CB/b/$BOOK/records -d "f1=$DAY" -d f2=hh_tc_1 -d "f3=$MARK_O" --data-urlencode "f4=Chè già")
assert_eq "$LOC" "$CB/b/$BOOK?notice=saved" "officer adds a row -> 303"
assert_eq "$(psql_app "select string_agg(status, ',' order by status) from app_custom_books.records where book_id = '$BOOK'")" "PENDING,PENDING" "both rows wait for approval"
OFFICER_ROW=$(psql_app "select id from app_custom_books.records where book_id = '$BOOK' and (data->>'f3')::numeric = $MARK_O" | sed -n 1p)
FARM_ROW=$(psql_app "select id from app_custom_books.records where book_id = '$BOOK' and (data->>'f3')::numeric = $MARK_F" | sed -n 1p)
LIST_F=$(get_page "$TF" $CB/b/$BOOK)
grep -q "12,5" <<<"$LIST_F" && pass "farmer's list shows the farmer's own row" || fail "farmer's list lacks their own row"
grep -q "77,7" <<<"$LIST_F" && fail "farmer (level own) sees the officer's row in the list" || pass "farmer (level own) does not see the officer's row in the list"
assert_app_http 404 "farmer opening the officer's row by its URL -> 404" -- -H "Authorization: Bearer $TF" "$APP_GW$CB/b/$BOOK/r/$OFFICER_ROW/edit"
grep -q "77,7\|77.7" <<<"$(get_page "$TF" $CB/b/$BOOK/export.csv)" && fail "farmer's CSV holds the officer's row" || pass "farmer's CSV holds only their own rows"
grep -q "77,7" <<<"$(get_page "$TF" $CB/b/$BOOK/print)" && fail "farmer's print page holds the officer's row" || pass "farmer's print page holds only their own rows"
grep -q "77,7" <<<"$(get_page "$TF" $CB/b/$BOOK/summary)" && fail "farmer's summary counts the officer's row" || pass "farmer's summary counts only their own rows"
grep -q "12,5" <<<"$(get_page "$TM" $CB/b/$BOOK/summary)" && fail "summary counts a row that is not approved" || pass "summary does not count pending rows"
[[ "$(post_loc "$TF" $CB/b/$BOOK/r/$FARM_ROW/approve -X POST)" == HTTP/*\ 403* ]] && pass "farmer cannot approve a row (403)" || fail "farmer approve was not refused with 403"
LOC=$(post_loc "$TM" $CB/b/$BOOK/r/$FARM_ROW/reject --data-urlencode "reason=Thiếu ghi chú lô chè")
[[ "$LOC" == $CB/b/$BOOK* ]] && pass "manager rejects the farmer's row with a reason ($LOC)" || fail "reject Location wrong: '$LOC'"
assert_eq "$(psql_app "select status from app_custom_books.records where id = '$FARM_ROW'")" REJECTED "the row is REJECTED"
LOC=$(post_loc "$TF" $CB/b/$BOOK/r/$FARM_ROW/edit -d "f1=$DAY" -d f2=hh_tc_1 -d "f3=$MARK_F" --data-urlencode "f4=Chè búp tươi")
[[ "$LOC" == $CB/b/$BOOK* ]] && pass "farmer edits the rejected row ($LOC)" || fail "edit Location wrong: '$LOC'"
assert_eq "$(psql_app "select status from app_custom_books.records where id = '$FARM_ROW'")" PENDING "an edited row is PENDING again"
LOC=$(post_loc "$TM" $CB/b/$BOOK/r/$FARM_ROW/approve -X POST)
[[ "$LOC" == $CB/b/$BOOK* ]] && pass "manager approves the farmer's row ($LOC)" || fail "approve Location wrong: '$LOC'"
assert_eq "$(psql_app "select status from app_custom_books.records where id = '$FARM_ROW'")" APPROVED "the row is APPROVED"
grep -q "12,5" <<<"$(get_page "$TM" $CB/b/$BOOK/summary)" && pass "summary counts the row after approval" || fail "summary lacks the approved row"
LOC=$(post_loc "$TF" $CB/b/$BOOK/r/$FARM_ROW/edit -d "f1=$DAY" -d f2=hh_tc_1 -d "f3=99" --data-urlencode "f4=Chè già")
[[ "$LOC" == $CB/b/$BOOK?notice=saved ]] && fail "an approved row was edited by its author" || pass "an approved row is locked for its author ($LOC)"
csv_check "$TM" $CB/b/$BOOK/export.csv "custom-books CSV"
grep -q "77,7\|77.7" <<<"$(get_page "$TM" $CB/b/$BOOK/export.csv)" && pass "manager's CSV holds every row" || fail "manager's CSV lacks the officer's row"
page_ok "$TM" $CB/b/$BOOK/print "custom-books print page"
page_ok "$TM" $CB/b/$BOOK/summary "custom-books summary"
# Archive: the entry leaves the feed; publish again: it returns.
assert_eq "$(post_loc "$TM" $CB/books/$BOOK/archive -X POST)" "$CB/books" "manager archives the book -> 303"
assert_eq "$(get_page "$TO" $CB/feed | jq -r --arg p "/b/$BOOK" '[.entries[] | select(.path == $p)] | length')" 0 "an archived book leaves the feed"
assert_eq "$(post_loc "$TM" $CB/books/$BOOK/publish -X POST)" "$CB/b/$BOOK" "manager publishes the archived book again"
assert_eq "$(get_page "$TO" $CB/feed | jq -r --arg p "/b/$BOOK" '[.entries[] | select(.path == $p)] | length')" 1 "the book is back in the feed"
[[ "$(post_loc "$TM" $CB/books/$BOOK/delete -X POST)" == HTTP/*\ 409* ]] && pass "a book with rows cannot be deleted (409)" || fail "delete of a book with rows was not refused with 409"
./dxos remove custom-books >/dev/null && pass "./dxos remove custom-books exits 0"
assert_eq "$(psql_app "select count(*) from app_custom_books.records")" 2 "remove without --purge keeps the rows"
purged custom-books app_custom_books

echo "[store queue]"
fresh_tokens
# The App Store page queues rows in platform.app_requests; ./dxos worker installs, enables and removes per HTX.
start_worker() {
  local _
  ./dxos worker >>"$WORKER_OUT" 2>&1 & WORKER_PID=$!
  # Until the worker holds its lock a second ./dxos worker could win it, so wait for the pid file.
  for _ in $(seq 1 60); do [ "$(cat "$RUNTIME/worker.lock/pid" 2>/dev/null)" = "$WORKER_PID" ] && return 0; sleep 0.5; done
  fail "worker did not take its lock within 30 s"
}
stop_worker() {
  local _
  [ -z "$WORKER_PID" ] || kill "$WORKER_PID" 2>/dev/null || true
  for _ in $(seq 1 40); do kill -0 "$WORKER_PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$WORKER_PID" 2>/dev/null && fail "worker did not stop within 40 s after TERM"
  WORKER_PID=""
}
# sed -n 1p, not head -n 1: head closes the pipe early and docker compose exec then exits 255 without a message.
request() { psql_app "insert into platform.app_requests (app_id, htx_code, action, requested_by) values ('$1', '$2', '$3', 'smoke') returning id" | sed -n 1p; }
request_status() { psql_app "select status from platform.app_requests where id = '$1'"; }
# wait_request <id> <status> <msg> [seconds]: poll until the request is closed or has the status.
wait_request() {
  local got="" _
  for _ in $(seq 1 "${4:-60}"); do
    got="$(request_status "$1")"
    case "$got" in "$2"|DONE|FAILED) break;; esac
    sleep 2
  done
  assert_eq "$got" "$2" "$3"
}
enabled_for() { psql_app "select coalesce(string_agg(htx_code, ',' order by htx_code), '') from platform.app_enablements where app_id = '$1'"; }
installed_count() { psql_app "select count(*) from platform.installed_apps where id = '$1'"; }
# Descendants of a pid, the pid first: a crashed host takes the whole install with it, so kill the whole tree.
proc_tree() { local c; echo "$1"; for c in $(pgrep -P "$1" || true); do proc_tree "$c"; done; }
cli_run() { $COMPOSE --profile tools run --rm -T --user "$(id -u):$(id -g)" dxos-cli "$@"; }

cli_run catalog-sync >/dev/null
assert_eq "$(psql_app "select count(*) from platform.app_catalog where id = 'hello'")" 1 "catalog-sync lists hello"
# Store details: catalog-sync copies the store block and the screenshot rows; the manifest is the source of the count.
assert_eq "$(psql_app "select store->>'category' from platform.app_catalog where id = 'tea-shop'")" sales "catalog-sync: tea-shop category is sales"
assert_eq "$(psql_app "select has_database::text from platform.app_catalog where id = 'tea-shop'")" true "catalog-sync: tea-shop has a database"
SHOTS=$(grep -c '^    - { file: ' miniapps/tea-shop/app.yaml)
assert_eq "$(psql_app "select count(*) from platform.app_catalog_screenshots where app_id = 'tea-shop'")" "$SHOTS" \
  "catalog-sync: tea-shop screenshot rows equal the $SHOTS in its manifest"
# A text file declared as a screenshot is refused by validate; the copy without it is the positive control.
rm -r -f miniapps/bad-shot
cp -R miniapps/hello miniapps/bad-shot
./dxos validate miniapps/bad-shot >/dev/null 2>&1 && pass "validate accepts a copy of hello" || fail "validate refused the clean copy of hello"
echo "not an image" > miniapps/bad-shot/notes.txt
printf '  screenshots:\n    - { file: notes.txt, caption: "Không phải ảnh" }\n' >> miniapps/bad-shot/app.yaml
./dxos validate miniapps/bad-shot >/dev/null 2>&1 && rc=0 || rc=$?
assert_eq "$rc" 1 "validate exits 1 for a text file declared as a screenshot"
rm -r -f miniapps/bad-shot
start_worker
OUT=$(./dxos worker 2>&1) && rc=0 || rc=$?
assert_eq "$rc" 1 "a second ./dxos worker exits 1"
grep -q 'Một worker khác đang chạy (pid ' <<<"$OUT" && pass "second worker names the running pid" || fail "second worker message: $OUT"

R1=$(request hello TC ENABLE)
wait_request "$R1" DONE "ENABLE hello for TC -> DONE" 60
assert_eq "$(installed_count hello)" 1 "hello was installed by the worker"
assert_eq "$(enabled_for hello)" TC "hello is enabled for TC only, not for *"
CID=$(hello_container); [ -n "$CID" ] || fail "app-hello not running after the worker installed it"

R2=$(request hello LB ENABLE)
wait_request "$R2" DONE "ENABLE hello for LB -> DONE"
assert_eq "$(hello_container)" "$CID" "second ENABLE did not reinstall: same container"
assert_eq "$(enabled_for hello)" LB,TC "hello is enabled for LB and TC"

R3=$(request hello TC DISABLE)
wait_request "$R3" DONE "DISABLE hello for TC -> DONE"
assert_eq "$(enabled_for hello)" LB "hello stays enabled for LB"
assert_eq "$(hello_container)" "$CID" "container still runs while LB uses it"
R4=$(request hello LB DISABLE)
wait_request "$R4" DONE "DISABLE hello for LB -> DONE"
for _ in $(seq 1 30); do [ "$(app_containers hello)" = 0 ] && break; sleep 2; done
assert_eq "$(app_containers hello)" 0 "container removed once no HTX is left"
for _ in $(seq 1 30); do [ "$(installed_count hello)" = 0 ] && break; sleep 2; done  # remove stops the container, then unregisters
assert_eq "$(installed_count hello)" 0 "hello is no longer installed"
wait_http 404 "removed app route -> 404 after the last DISABLE" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"

# Review focus 2: a failing install fails the request and leaves nothing behind.
cp -R platform/cli/tests/fixtures/broken-health miniapps/broken-health
cli_run catalog-sync >/dev/null
BEFORE=$(sha "$GW_FILE")
R5=$(request broken-health TC ENABLE)
wait_request "$R5" FAILED "ENABLE of the broken app -> FAILED" 90
grep -q 'Cài đặt hỏng' <<<"$(psql_app "select error from platform.app_requests where id = '$R5'")" \
  && pass "request carries the Vietnamese failure message" || fail "request error: $(psql_app "select error from platform.app_requests where id = '$R5'")"
assert_eq "$(psql_app "select phase from platform.app_requests where id = '$R5'")" build "the failed install keeps the phase of the step that failed"
assert_eq "$(installed_count broken-health)" 0 "broken-health is not installed"
assert_eq "$(enabled_for broken-health)" "" "broken-health is enabled for nobody"
assert_eq "$(app_containers broken-health)" 0 "no app-broken-health container left"
assert_eq "$(sha "$GW_FILE")" "$BEFORE" "gateway file sha256 unchanged by the failed request"
rm -r -f miniapps/broken-health
cli_run catalog-sync >/dev/null

# A worker killed in the middle of an install: the next worker fails the request and undoes the half install.
R6=$(request hello TC ENABLE)
for _ in $(seq 1 60); do [ -e "$RUNTIME/apps/hello.pending.json" ] && break; sleep 0.5; done
[ -e "$RUNTIME/apps/hello.pending.json" ] || fail "worker never started installing hello"
# shellcheck disable=SC2046  # pids, one per word
kill -9 $(proc_tree "$WORKER_PID") 2>/dev/null || true
WORKER_PID=""
sleep 3
assert_eq "$(request_status "$R6")" RUNNING "killed worker left the request RUNNING"
start_worker
wait_request "$R6" FAILED "restarted worker fails the half-done request" 90
assert_eq "$(psql_app "select error from platform.app_requests where id = '$R6'")" "Trình cài đặt khởi động lại giữa chừng." \
  "request carries the restart message"
assert_eq "$(installed_count hello)" 0 "half-done hello is not installed"
# The worker marks the request FAILED first and undoes the half install after that, so wait for the undo.
for _ in $(seq 1 30); do [ "$(app_containers hello)" = 0 ] && [ "$(grep -c 'app-hello' "$GW_FILE" || true)" = 0 ] && break; sleep 2; done
assert_eq "$(app_containers hello)" 0 "no app-hello container left after the crash"
assert_eq "$(grep -c 'app-hello' "$GW_FILE" || true)" 0 "no hello route left after the crash"
R7=$(request hello TC ENABLE)
wait_request "$R7" DONE "a new ENABLE after the crash -> DONE"
assert_eq "$(enabled_for hello)" TC "hello enabled for TC after the retry"
R8=$(request hello TC DISABLE)
wait_request "$R8" DONE "DISABLE after the retry -> DONE"
for _ in $(seq 1 30); do [ "$(app_containers hello)" = 0 ] && break; sleep 2; done
assert_eq "$(app_containers hello)" 0 "hello removed again"

# tea-shop through the queue: enablement is per HTX, and a disabled shop keeps its products.
WEB="${E2E_BASE_URL:-http://localhost:3000}"
web_up() { [ -n "$($COMPOSE ps -q --status running web)" ]; }
web_status() { curl -s -o /dev/null -w '%{http_code}' "$WEB$1"; }
./dxos remove tea-shop --purge >/dev/null 2>&1 || true
RS1=$(request tea-shop TC ENABLE)
# Poll the phase while the worker installs. A warm image cache can finish between two polls, so the phases seen are not the only proof:
# a finished request must still carry the last phase, register.
SEEN=""; RS1_STATUS=""; RS1_PHASE=""
for _ in $(seq 1 600); do
  got="$(psql_app "select status || ' ' || coalesce(phase, '') from platform.app_requests where id = '$RS1'")"
  RS1_STATUS="${got%% *}"; RS1_PHASE="${got#* }"
  case "$RS1_PHASE" in prepare|build|register) case " $SEEN " in *" $RS1_PHASE "*) ;; *) SEEN="$SEEN $RS1_PHASE";; esac;; esac
  case "$RS1_STATUS" in DONE|FAILED) break;; esac
  sleep 0.5
done
assert_eq "$RS1_STATUS" DONE "ENABLE tea-shop for TC -> DONE"
if [ -n "$SEEN" ]; then pass "install phases seen while the worker worked:$SEEN"
elif [ "$RS1_PHASE" = register ]; then pass "install finished between polls with phase register"
else fail "no install phase seen and the request ended with phase '$RS1_PHASE'"; fi
assert_eq "$RS1_PHASE" register "a finished install keeps the last phase, register"
fresh_tokens
assert_eq "$(enabled_for tea-shop)" TC "tea-shop is enabled for TC only"
wait_http 200 "manager token -> 200 on /apps/tea-shop/ after the worker installed it" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/tea-shop/"
LOC=$(post_loc "$TM" /apps/tea-shop/products --data-urlencode "name=Chè Oolong" --data-urlencode "pack=Hộp 100g" -d price_vnd=120000 -d stock=5 -d active=on)
assert_eq "$LOC" "/apps/tea-shop/" "manager adds a product to the queue-installed shop"
if web_up; then
  assert_eq "$(web_status /apps/tea-shop/public/TC)" 200 "web proxy: /apps/tea-shop/public/TC -> 200 for the enabled HTX"
  assert_eq "$(web_status /apps/tea-shop/public/LB)" 404 "web proxy: /apps/tea-shop/public/LB -> 404 for an HTX that has not enabled it"
else
  echo "SKIP: web container not running, the proxy checks for tea-shop are left to the browser story"
fi
RS2=$(request tea-shop TC DISABLE)
wait_request "$RS2" DONE "DISABLE tea-shop for TC -> DONE"
for _ in $(seq 1 30); do [ "$(app_containers tea-shop)" = 0 ] && break; sleep 2; done
assert_eq "$(app_containers tea-shop)" 0 "tea-shop container removed once no HTX is left"
wait_http 404 "removed tea-shop public route -> 404" -- "$APP_GW/apps/tea-shop/public/TC"
assert_eq "$(psql_app "select count(*) from app_tea_shop.products where name = 'Chè Oolong'")" 1 "the product survives the disable"
RS3=$(request tea-shop TC ENABLE)
wait_request "$RS3" DONE "ENABLE tea-shop for TC again -> DONE" 120
fresh_tokens
wait_http 200 "tea-shop answers again after the second enable" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/tea-shop/"
# The public route can reach the gateway a moment after the manager route, so poll instead of reading once.
for _ in $(seq 1 15); do
  grep -q 'Chè Oolong' <<<"$(app_curl -s "$APP_GW/apps/tea-shop/public/TC")" && break
  sleep 1
done
grep -q 'Chè Oolong' <<<"$(app_curl -s "$APP_GW/apps/tea-shop/public/TC")" && pass "the product created before the disable is on the public page again" \
  || fail "the product is gone after the second enable"
RS4=$(request tea-shop TC DISABLE)
wait_request "$RS4" DONE "DISABLE tea-shop for TC again -> DONE"
for _ in $(seq 1 30); do [ "$(installed_count tea-shop)" = 0 ] && break; sleep 2; done
purged tea-shop app_tea_shop
stop_worker
pass "worker stops on TERM and frees its lock"
[ ! -e "$RUNTIME/worker.lock" ] && pass "worker lock directory removed" || fail "worker.lock left behind"

# Upgrade from a stack without the store: the first run of 06-app-store.sql gives an installed app '*', later runs do not.
requests_state() { psql_app "select count(*) || ' ' || md5(coalesce(string_agg(id::text || status || coalesce(phase, '-'), ',' order by id), '')) from platform.app_requests"; }
BEFORE_REQUESTS=$(requests_state)
./dxos install miniapps/hello >/dev/null && pass "./dxos install miniapps/hello exits 0 (upgrade check)" || fail "install hello for the upgrade check"
assert_eq "$(requests_state)" "$BEFORE_REQUESTS" "a hand ./dxos install adds no request row and changes no phase"
psql_app "drop table platform.app_catalog_screenshots, platform.app_requests, platform.app_enablements, platform.app_worker, platform.app_catalog" >/dev/null
$COMPOSE run --rm platform-init >/dev/null 2>&1 || fail "platform-init after dropping the store tables"
fresh_tokens
assert_eq "$(psql_app "select app_id || ' ' || htx_code || ' ' || enabled_by from platform.app_enablements")" "hello * dxos-upgrade" \
  "first run of 06-app-store.sql enables the installed app for *"
wait_http 200 "hello still answers after the upgrade" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
# ./dxos upgrade of the installed app: exit 0, the registry version, the same enablement rows, still answering; of an app that is not installed: exit 1.
ENABLEMENTS=$(psql_app "select app_id || '|' || htx_code || '|' || enabled_by from platform.app_enablements order by app_id, htx_code")
./dxos upgrade miniapps/hello >/dev/null && pass "./dxos upgrade miniapps/hello exits 0" || fail "./dxos upgrade miniapps/hello"
assert_eq "$(psql_app "select version from platform.installed_apps where id = 'hello'" | sed -n 1p)" "$(sed -n 's/^version: *"\{0,1\}\([0-9.]*\).*/\1/p' miniapps/hello/app.yaml | sed -n 1p)" "upgrade leaves the registry at the manifest version"
assert_eq "$(psql_app "select app_id || '|' || htx_code || '|' || enabled_by from platform.app_enablements order by app_id, htx_code")" "$ENABLEMENTS" "upgrade keeps the enablement rows"
fresh_tokens
wait_http 200 "hello still answers after ./dxos upgrade" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
if ./dxos upgrade miniapps/leaf-purchase >/dev/null 2>&1; then fail "./dxos upgrade of an app that is not installed exited 0"; else pass "./dxos upgrade of an app that is not installed exits non-zero"; fi
psql_app "delete from platform.app_enablements" >/dev/null
$COMPOSE run --rm platform-init >/dev/null 2>&1 || fail "second platform-init"
assert_eq "$(enabled_for hello)" "" "a later platform-init does not hand a removed enablement back"
cli_run catalog-sync >/dev/null

# A restarted worker must fail a stale request but leave the container of a registered app alone.
CID=$(hello_container); [ -n "$CID" ] || fail "app-hello not running before the stale-request check"
R9=$(psql_app "insert into platform.app_requests (app_id, htx_code, action, requested_by, status, started_at) values ('hello', 'LB', 'ENABLE', 'smoke', 'RUNNING', now()) returning id" | sed -n 1p)
start_worker
wait_request "$R9" FAILED "stale ENABLE of an installed app -> FAILED" 30
fresh_tokens
assert_eq "$(hello_container)" "$CID" "restarted worker kept the container of the installed app"
wait_http 200 "hello still answers after the worker restart" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
stop_worker
./dxos remove hello >/dev/null && pass "hello removed after the upgrade checks" || fail "remove hello after the upgrade checks"
OUT=$(make platform-smoke 2>&1) || { tail -20 <<<"$OUT" >&2; fail "make platform-smoke after remove"; }
assert_eq "$(grep -c '^PASS' <<<"$OUT")" 124 "platform smoke still gives 124 PASS without apps"

echo "apps smoke: all checks passed"
