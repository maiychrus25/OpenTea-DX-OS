#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Keycloak admin helpers for smoke tests (idempotent). Source after lib.sh.
KC="${KC:-http://localhost:8080}"
KC_REALM_URL="$KC/realms/agrimarket"
KC_ADMIN_API="$KC/admin/realms/agrimarket"
SMOKE_PASSWORD="Smoke-Pass-1"

kc_wait() {
  local i
  for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "$KC_REALM_URL/.well-known/openid-configuration")" = 200 ] && return 0
    sleep 2
  done
  fail "keycloak realm not ready after 120s"
}

# kc_ready: after a legitimate restart the realm document answers while Keycloak's database pool is still broken, so
# wait (bounded, 60 x 2s) until the admin API itself answers 200, not only the realm page.
kc_ready() {
  local i t
  kc_wait
  for i in $(seq 1 60); do
    t="$(curl -sf -d client_id=admin-cli -d grant_type=password \
      -d "username=${KEYCLOAK_ADMIN:-admin}" -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
      "$KC/realms/master/protocol/openid-connect/token" | jq -r '.access_token // empty')" || t=""
    if [ -n "$t" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $t" "$KC_ADMIN_API/clients?max=1")" = 200 ]; then return 0; fi
    sleep 2
  done
  fail "keycloak admin API not ready after 120s"
}

# Bounded retry (3 x 2s): Keycloak admin occasionally answers a transient 400/5xx right after startup.
kc_admin_token() {
  local i t
  for i in 1 2 3; do
    t="$(curl -sf -d client_id=admin-cli -d grant_type=password \
      -d "username=${KEYCLOAK_ADMIN:-admin}" -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
      "$KC/realms/master/protocol/openid-connect/token" | jq -r '.access_token // empty')" || t=""
    if [ -n "$t" ] && [ "$t" != null ]; then printf '%s' "$t"; return 0; fi
    sleep 2
  done
  fail "keycloak admin token empty after 3 attempts"
}

# _kc method path [json body]; uses $ADMIN_T. Fails loudly on non-2xx; ALLOW_409=1 accepts 409 (already exists).
_kc() {
  local args=(-sS -X "$1" -H "Authorization: Bearer $ADMIN_T" -H 'Content-Type: application/json' -w $'\n%{http_code}')
  [ -n "${3:-}" ] && args+=(-d "$3")
  local out code body i
  for i in 1 2 3; do
    out="$(curl "${args[@]}" "$KC_ADMIN_API$2")" || fail "keycloak admin $1 $2: curl failed"
    code="${out##*$'\n'}"; body="${out%$'\n'*}"
    # Retry only idempotent reads on a transient 400/5xx.
    case "$1:$code" in GET:400|GET:5??) [ "$i" -lt 3 ] && { sleep 2; continue; } ;; esac
    break
  done
  case "$code" in
    2??) printf '%s' "$body" ;;
    409) if [ "${ALLOW_409:-}" = 1 ]; then printf '%s' "$body"; else echo "keycloak admin $1 $2 -> 409: $body" >&2; fail "keycloak admin $1 $2 failed"; fi ;;
    *) echo "keycloak admin $1 $2 -> $code: $body" >&2; fail "keycloak admin $1 $2 failed" ;;
  esac
}

# ensure_client <client_id> <default_scopes_csv>
ensure_client() {
  local cid="$1" scopes="$2" ADMIN_T uuid sid s
  ADMIN_T="$(kc_admin_token)"
  uuid="$(_kc GET "/clients?clientId=$cid" | jq -r '.[0].id // empty')"
  if [ -z "$uuid" ]; then
    ALLOW_409=1 _kc POST /clients "{\"clientId\":\"$cid\",\"publicClient\":true,\"directAccessGrantsEnabled\":true,\"standardFlowEnabled\":false}" >/dev/null
    uuid="$(_kc GET "/clients?clientId=$cid" | jq -r '.[0].id')"
  fi
  for s in $(echo "$scopes" | tr , ' '); do
    sid="$(_kc GET /client-scopes | jq -r --arg n "$s" '.[] | select(.name==$n) | .id')"
    [ -n "$sid" ] || fail "client scope $s missing"
    _kc PUT "/clients/$uuid/default-client-scopes/$sid" >/dev/null
  done
}

user_id() { ADMIN_T="$(kc_admin_token)"; _kc GET "/users?username=$1&exact=true" | jq -r '.[0].id // empty'; }

# ensure_user <username> <role> [htx_code]: resets the password and required actions, so only smoke_ users.
ensure_user() {
  local u="$1" role="$2" htx="${3:-}" ADMIN_T id attrs='{}'
  case "$u" in smoke_*) ;; *) fail "ensure_user manages only smoke_ users, not $u (demo users keep their password and TOTP)" ;; esac
  ADMIN_T="$(kc_admin_token)"
  [ -n "$htx" ] && attrs="{\"htx_code\":[\"$htx\"]}"
  id="$(_kc GET "/users?username=$u&exact=true" | jq -r '.[0].id // empty')"
  if [ -z "$id" ]; then
    ALLOW_409=1 _kc POST /users "{\"username\":\"$u\",\"email\":\"$u@example.test\",\"firstName\":\"$u\",\"lastName\":\"Smoke\",\"enabled\":true,\"emailVerified\":true,\"requiredActions\":[],\"attributes\":$attrs}" >/dev/null
    id="$(_kc GET "/users?username=$u&exact=true" | jq -r '.[0].id')"
  else
    _kc PUT "/users/$id" "{\"enabled\":true,\"emailVerified\":true,\"requiredActions\":[],\"attributes\":$attrs}" >/dev/null
  fi
  _kc PUT "/users/$id/reset-password" "{\"type\":\"password\",\"value\":\"$SMOKE_PASSWORD\",\"temporary\":false}" >/dev/null
  local role_json; role_json="$(_kc GET "/roles/$role")"
  [ "$(printf '%s' "$role_json" | jq -r .name)" = "$role" ] || fail "role $role lookup did not return a role object: $role_json"
  _kc POST "/users/$id/role-mappings/realm" "[$role_json]" >/dev/null
}

# user_token <username> [client_id]
user_token() {
  curl -sf -d grant_type=password -d "client_id=${2:-dxos-smoke}" -d "username=$1" -d "password=$SMOKE_PASSWORD" \
    "$KC_REALM_URL/protocol/openid-connect/token" | jq -r .access_token
}
