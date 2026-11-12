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

# Whatever fails, leave no app behind (the registry, docker/runtime/<project> and the containers outlive this script).
trap 'rc=$?; ./dxos remove tea-tour --purge >/dev/null 2>&1 || true; ./dxos remove db-app --purge >/dev/null 2>&1 || true; ./dxos remove broken-health >/dev/null 2>&1 || true; ./dxos remove hello >/dev/null 2>&1 || true; exit $rc' EXIT

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
TM=$(user_token smoke_manager_tc); [ -n "$TM" ] && [ "$TM" != null ] || fail "smoke_manager_tc token empty"
TF=$(user_token smoke_farmer_tc); [ -n "$TF" ] && [ "$TF" != null ] || fail "smoke_farmer_tc token empty"
pass "smoke client and users ready"

echo "[install hello]"
./dxos remove hello >/dev/null 2>&1 || true  # start from a stack without hello, so the smoke can be re-run
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

./dxos remove tea-tour && pass "./dxos remove tea-tour exits 0" || fail "./dxos remove tea-tour"
wait_http 404 "removed tea-tour public route -> 404" -- "$APP_GW/apps/tea-tour/public/TC"
assert_eq "$(psql_app "select count(*) from app_tea_tour.bookings where code = '$CODE'")" 1 "remove without --purge keeps the bookings"
./dxos remove tea-tour --purge && pass "./dxos remove tea-tour --purge exits 0" || fail "./dxos remove tea-tour --purge"
assert_eq "$(psql_app "select count(*) from pg_namespace where nspname='app_tea_tour'")" 0 "--purge dropped schema app_tea_tour"
assert_eq "$(psql_app "select count(*) from pg_roles where rolname='app_tea_tour'")" 0 "--purge dropped role app_tea_tour"
[ ! -e "$TEA_ENV" ] && pass "--purge deleted the tea-tour env file" || fail "tea-tour env file left after --purge"

echo "[platform-up with hello installed]"
CID=$(hello_container); [ -n "$CID" ] || fail "app-hello not running before platform-up"
make platform-up >/dev/null || fail "make platform-up with hello installed"
pass "make platform-up exits 0 with hello installed"
TM=$(user_token smoke_manager_tc)
wait_http 200 "/apps/hello/ still 200 after platform-up" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
assert_eq "$(hello_container)" "$CID" "app-hello container kept running through platform-up"

echo "[remove hello]"
./dxos remove hello && pass "./dxos remove hello exits 0" || fail "./dxos remove hello"
wait_http 404 "removed app route -> 404" -- -H "Authorization: Bearer $TM" "$APP_GW/apps/hello/"
assert_eq "$(app_containers hello)" 0 "app-hello container removed"
assert_eq "$(psql_app "select count(*) from platform.installed_apps")" 0 "registry empty after remove"
OUT=$(make platform-smoke 2>&1) || { tail -20 <<<"$OUT" >&2; fail "make platform-smoke after remove"; }
assert_eq "$(grep -c '^PASS' <<<"$OUT")" 124 "platform smoke still gives 124 PASS without apps"

echo "apps smoke: all checks passed"
