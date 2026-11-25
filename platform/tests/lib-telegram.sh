#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Telegram relay helpers shared by smoke-telegram.sh and smoke-agents.sh: the Bot API stub, the relay bring-up, the
# owner's link and the callback injection. Sourced, never run on its own; it needs lib.sh and tokens.sh sourced first.

STUB="http://127.0.0.1:8081"
TG_TOKEN_VALUE="123456:smoke-telegram-token"
TG_OWNER=900001      # Telegram account linked to smoke_manager_tc
TG_STRANGER=900002   # Telegram account that never linked
TG_GROUP=-1009000003 # group chat of the same cooperative
TG_UPDATE_ID=$(( $(date +%s) * 10 ))

stub_calls() { curl -sf "$STUB/control/calls"; }
# Client-credentials token of dxos-telegram, read from its volume the way the relay reads it.
telegram_client_token() {
  local creds cid csec
  creds="$($COMPOSE --profile tools run --rm -T --no-deps dxos-telegram-env cat /run/dxos-telegram/telegram.env)"
  cid=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_TELEGRAM_CLIENT_ID=//p')
  csec=$(printf '%s\n' "$creds" | sed -n 's/^DXOS_TELEGRAM_CLIENT_SECRET=//p')
  curl -sf -X POST "$KC_REALM_URL/protocol/openid-connect/token" \
    -d "grant_type=client_credentials" -d "client_id=$cid" -d "client_secret=$csec" | jq -r '.access_token // empty'
}
stub_reset() { curl -sf -X POST "$STUB/control/reset" >/dev/null; }
stub_inject() {  # <update json>
  TG_UPDATE_ID=$((TG_UPDATE_ID + 1))
  curl -sf -X POST "$STUB/control/updates" -H 'Content-Type: application/json' \
    -d "$(printf '%s' "$1" | sed "s/__UPDATE_ID__/$TG_UPDATE_ID/")" >/dev/null
}
# wait_stub <python condition over the list "c" of recorded calls> [tries, 2 s each]
wait_stub() {
  local i
  for i in $(seq 1 "${2:-30}"); do
    stub_calls | python3 -c "import json,sys; c=json.load(sys.stdin); sys.exit(0 if ($1) else 1)" && return 0
    sleep 2
  done
  return 1
}
# The first "approve" button sent to the owner after the last stub reset.
owner_approve_data() {
  stub_calls | python3 -c '
import json, sys
for call in json.load(sys.stdin):
    if call["method"] != "sendMessage" or call["params"].get("chat_id") != '"$TG_OWNER"':
        continue
    for row in call["params"].get("reply_markup", {}).get("inline_keyboard", []):
        for button in row:
            data = button.get("callback_data", "")
            if data.startswith("v1|") and data.split("|")[2] == "a":
                print(data)
                sys.exit(0)
sys.exit(1)'
}
# The approve button signed for one proposal: callback_data carries the proposal id in base64url (see callback-data.ts).
telegram_approve_data_for() {  # <proposal uuid>
  local id64
  id64="$(python3 -c 'import base64, sys; print(base64.urlsafe_b64encode(bytes.fromhex(sys.argv[1].replace("-", ""))).decode().rstrip("="))' "$1")"
  stub_calls | python3 -c '
import json, sys
prefix = "v1|" + sys.argv[1] + "|a|"
for call in json.load(sys.stdin):
    if call["method"] != "sendMessage" or call["params"].get("chat_id") != '"$TG_OWNER"':
        continue
    for row in call["params"].get("reply_markup", {}).get("inline_keyboard", []):
        for button in row:
            if button.get("callback_data", "").startswith(prefix):
                print(button["callback_data"])
                sys.exit(0)
sys.exit(1)' "$id64"
}
tg_callback() {  # <from id> <chat id> <chat type> <callback data> <callback query id>
  stub_inject "{\"update_id\": __UPDATE_ID__, \"callback_query\": {\"id\": \"$5\", \"from\": {\"id\": $1}, \"message\": {\"message_id\": 1, \"chat\": {\"id\": $2, \"type\": \"$3\"}}, \"data\": \"$4\"}}"
}

# Enables the relay for the cooperative, starts the Bot API stub and the relay pointed at it. Stub calls are reset.
telegram_relay_up() {
  ./dxos telegram enable >/dev/null
  $COMPOSE --profile telegram-test up -d --no-deps dxos-telegram-stub >/dev/null
  for _ in $(seq 1 30); do stub_calls >/dev/null 2>&1 && break; sleep 1; done
  stub_reset
  TELEGRAM_BOT_TOKEN="$TG_TOKEN_VALUE" TELEGRAM_API_BASE="http://dxos-telegram-stub:8081" \
    $COMPOSE --profile telegram-test up -d --no-deps dxos-telegram >/dev/null
}

# Links the owner's Telegram account to smoke_manager_tc with a one-time code and /start. The code is stored only as its
# SHA-256 (C4), as the web does. Sets TG_HASH and TG_SUB for the caller; the caller checks the welcome and the link row.
telegram_link_owner() {
  TG_CODE="$(python3 -c 'import secrets; print(secrets.token_hex(4).upper())')"
  TG_HASH="$(python3 -c 'import hashlib, sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())' "$TG_CODE")"
  TG_SUB="$(python3 -c 'import base64, json, sys; p = sys.argv[1].split(".")[1]; p += "=" * (-len(p) % 4); print(json.loads(base64.urlsafe_b64decode(p))["sub"])' "$(user_token smoke_manager_tc)")"
  psql_app "insert into platform.telegram_link_codes (code_hash, kind, user_id, user_name, role, htx_code, expires_at)
    values ('$TG_HASH', 'user', '$TG_SUB', 'Smoke Manager TC', 'manager', 'TC', now() + interval '10 minutes')" >/dev/null
  stub_inject "{\"update_id\": __UPDATE_ID__, \"message\": {\"message_id\": 1, \"chat\": {\"id\": $TG_OWNER, \"type\": \"private\"}, \"from\": {\"id\": $TG_OWNER}, \"text\": \"/start $TG_CODE\"}}"
}

# Turns the relay off the way the smoke leaves it: relay disabled, relay container back in its normal config, stub stopped.
telegram_relay_down() {
  ./dxos telegram disable >/dev/null
  $COMPOSE up -d --no-deps dxos-telegram >/dev/null
  $COMPOSE stop dxos-telegram-stub >/dev/null
}
