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

kc_admin_token() {
  curl -sf -d client_id=admin-cli -d grant_type=password \
    -d "username=${KEYCLOAK_ADMIN:-admin}" -d "password=${KEYCLOAK_ADMIN_PASSWORD:-admin}" \
    "$KC/realms/master/protocol/openid-connect/token" | jq -r .access_token
}

_kc() { # method path [json body]; uses $ADMIN_T
  curl -s -X "$1" -H "Authorization: Bearer $ADMIN_T" -H 'Content-Type: application/json' \
    ${3:+-d "$3"} "$KC_ADMIN_API$2"
}

# ensure_client <client_id> <default_scopes_csv>
ensure_client() {
  local cid="$1" scopes="$2" ADMIN_T uuid sid s
  ADMIN_T="$(kc_admin_token)"
  uuid="$(_kc GET "/clients?clientId=$cid" | jq -r '.[0].id // empty')"
  if [ -z "$uuid" ]; then
    _kc POST /clients "{\"clientId\":\"$cid\",\"publicClient\":true,\"directAccessGrantsEnabled\":true,\"standardFlowEnabled\":false}" >/dev/null
    uuid="$(_kc GET "/clients?clientId=$cid" | jq -r '.[0].id')"
  fi
  for s in $(echo "$scopes" | tr , ' '); do
    sid="$(_kc GET /client-scopes | jq -r --arg n "$s" '.[] | select(.name==$n) | .id')"
    [ -n "$sid" ] || fail "client scope $s missing"
    _kc PUT "/clients/$uuid/default-client-scopes/$sid" >/dev/null
  done
}

user_id() { ADMIN_T="$(kc_admin_token)"; _kc GET "/users?username=$1&exact=true" | jq -r '.[0].id // empty'; }

# ensure_user <username> <role> [htx_code]
ensure_user() {
  local u="$1" role="$2" htx="${3:-}" ADMIN_T id attrs='{}'
  ADMIN_T="$(kc_admin_token)"
  [ -n "$htx" ] && attrs="{\"htx_code\":[\"$htx\"]}"
  id="$(_kc GET "/users?username=$u&exact=true" | jq -r '.[0].id // empty')"
  if [ -z "$id" ]; then
    _kc POST /users "{\"username\":\"$u\",\"email\":\"$u@example.test\",\"firstName\":\"$u\",\"lastName\":\"Smoke\",\"enabled\":true,\"emailVerified\":true,\"requiredActions\":[],\"attributes\":$attrs}" >/dev/null
    id="$(_kc GET "/users?username=$u&exact=true" | jq -r '.[0].id')"
  else
    _kc PUT "/users/$id" "{\"enabled\":true,\"emailVerified\":true,\"requiredActions\":[],\"attributes\":$attrs}" >/dev/null
  fi
  _kc PUT "/users/$id/reset-password" "{\"type\":\"password\",\"value\":\"$SMOKE_PASSWORD\",\"temporary\":false}" >/dev/null
  _kc POST "/users/$id/role-mappings/realm" "[$(_kc GET "/roles/$role")]" >/dev/null
}

# user_token <username> [client_id]
user_token() {
  curl -sf -d grant_type=password -d "client_id=${2:-dxos-smoke}" -d "username=$1" -d "password=$SMOKE_PASSWORD" \
    "$KC_REALM_URL/protocol/openid-connect/token" | jq -r .access_token
}
