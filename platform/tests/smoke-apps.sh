#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Mini-app smoke tests: ./dxos install/remove with the hello app. Run from the repo root via `make apps-smoke`
# on a seeded stack (make platform-up + seed), because the last check runs the full platform smoke.
set -euo pipefail
cd "$(dirname "$0")/../.."
source platform/tests/lib.sh
source platform/tests/tokens.sh

command -v jq >/dev/null || { echo "jq is required (brew/apt install jq)"; exit 1; }

GW_FILE=docker/runtime/gateway/apisix.yaml
HELLO="$COMPOSE -f docker/runtime/apps/hello.compose.yml"

# wait_http "codes" msg -- <curl args...>: APISIX reloads the route file within about a second.
wait_http() {
  local codes="$1" msg="$2" got _; shift 3
  for _ in $(seq 1 15); do
    got="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
    case " $codes " in *" $got "*) pass "$msg"; return 0;; esac
    sleep 1
  done
  fail "$msg (expected one of '$codes', got '$got')"
}
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
# Fixed container names are not used for apps, so filter by this project (compose's default is the docker/ dir name).
app_containers() { docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME:-docker}" --filter "label=com.docker.compose.service=app-$1" | wc -l | tr -d ' '; }
hello_container() { $HELLO ps -q --status running app-hello; }

echo "[identity setup]"
kc_wait
ensure_client dxos-smoke dx-os-core,roles,profile
ensure_user smoke_manager_tc manager TC
TM=$(user_token smoke_manager_tc); [ -n "$TM" ] && [ "$TM" != null ] || fail "smoke_manager_tc token empty"
pass "smoke client and user ready"

echo "[install hello]"
./dxos remove hello >/dev/null 2>&1 || true  # start from a stack without hello, so the smoke can be re-run
./dxos install miniapps/hello && pass "./dxos install miniapps/hello exits 0" || fail "./dxos install miniapps/hello"
wait_http 200 "manager token -> 200 on /apps/hello/" -- -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/"
BODY=$(curl -s -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/")
# The name claim is "first last" only while ensure_user has not re-run for an existing user (its update drops the
# names); without it the app falls back to preferred_username.
grep -Eq 'Xin chào smoke_manager_tc( Smoke)?, HTX TC, vai trò manager' <<<"$BODY" && pass "page greets the token's name, HTX and role" \
  || fail "page greeting wrong: $BODY"
grep -q 'href="/dxos-app.css"' <<<"$BODY" && pass "page links /dxos-app.css" || fail "page does not link /dxos-app.css"
grep -q 'action="/apps/hello/echo"' <<<"$BODY" && pass "form posts under the /apps/hello prefix" || fail "form action not prefixed"
assert_http 401 "no token -> 401 on /apps/hello/" -- "$GATEWAY/apps/hello/"

echo "[echo form]"
HDRS=$(curl -s -D - -o /dev/null -X POST -H "Authorization: Bearer $TM" --data-urlencode 'message=<b>chè</b>' "$GATEWAY/apps/hello/echo")
grep -q '^HTTP/[0-9.]* 303' <<<"$HDRS" && pass "POST /apps/hello/echo -> 303" || fail "POST /apps/hello/echo not 303: $HDRS"
LOC=$(grep -i '^location:' <<<"$HDRS" | tr -d '\r' | cut -d' ' -f2)
case "$LOC" in /apps/hello/\?said=*) pass "echo redirects under the prefix ($LOC)";; *) fail "echo Location wrong: '$LOC'";; esac
SAID=$(curl -s -H "Authorization: Bearer $TM" "$GATEWAY$LOC")
grep -q '&lt;b&gt;chè&lt;/b&gt;' <<<"$SAID" && ! grep -q '<b>chè' <<<"$SAID" && pass "echoed message is HTML-escaped" \
  || fail "echoed message not escaped"
got=$($HELLO exec -T app-hello python -c "import urllib.request as u, urllib.error as e
try: u.urlopen(u.Request('http://127.0.0.1:8080/echo', data=b'message=x'))
except e.HTTPError as x: print(x.code)")
assert_eq "$got" 401 "direct POST /echo without a token -> 401"

echo "[registry]"
assert_eq "$(psql_app "select count(*) from platform.installed_apps where id='hello'")" 1 "platform.installed_apps has the hello row"
grep -E '^hello' <<<"$(./dxos list)" | grep -q '(healthy)' && pass "./dxos list shows hello healthy" || fail "./dxos list: $(./dxos list)"
./dxos install miniapps/hello && pass "installing hello again exits 0 (idempotent)" || fail "second install of hello failed"
assert_eq "$(psql_app "select count(*) from platform.installed_apps where id='hello'")" 1 "still one hello row"
assert_http 200 "hello still answers after the second install" -- -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/"

echo "[failed install is undone]"
BEFORE=$(sha "$GW_FILE")
rc=0; ./dxos install platform/cli/tests/fixtures/broken-health || rc=$?
assert_eq "$rc" 1 "install broken-health (healthz answers 500) exits 1"
assert_eq "$(sha "$GW_FILE")" "$BEFORE" "gateway file sha256 equals its value before the failed install"
grep -q broken-health <<<"$(./dxos list)" && fail "./dxos list shows broken-health" || pass "./dxos list does not show broken-health"
assert_eq "$(psql_app "select count(*) from platform.installed_apps where id='broken-health'")" 0 "no broken-health row"
assert_eq "$(find docker/runtime -name 'broken-health*' | wc -l | tr -d ' ')" 0 "no broken-health runtime file left"
assert_eq "$(app_containers broken-health)" 0 "no app-broken-health container left"
assert_http 200 "hello unaffected by the failed install" -- -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/"

echo "[platform-up with hello installed]"
CID=$(hello_container); [ -n "$CID" ] || fail "app-hello not running before platform-up"
make platform-up >/dev/null || fail "make platform-up with hello installed"
pass "make platform-up exits 0 with hello installed"
TM=$(user_token smoke_manager_tc)
wait_http 200 "/apps/hello/ still 200 after platform-up" -- -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/"
assert_eq "$(hello_container)" "$CID" "app-hello container kept running through platform-up"

echo "[remove hello]"
./dxos remove hello && pass "./dxos remove hello exits 0" || fail "./dxos remove hello"
wait_http 404 "removed app route -> 404" -- -H "Authorization: Bearer $TM" "$GATEWAY/apps/hello/"
assert_eq "$(app_containers hello)" 0 "app-hello container removed"
assert_eq "$(psql_app "select count(*) from platform.installed_apps")" 0 "registry empty after remove"
OUT=$(make platform-smoke 2>&1) || { tail -20 <<<"$OUT" >&2; fail "make platform-smoke after remove"; }
assert_eq "$(grep -c '^PASS' <<<"$OUT")" 124 "platform smoke still gives 124 PASS without apps"

echo "apps smoke: all checks passed"
