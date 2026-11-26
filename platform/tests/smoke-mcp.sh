#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# M14 smoke. Test 38: an MCP client on the stdio bridge lists the tools, reads one, and creates a proposal that the linked
# manager approves on Telegram; nothing runs before that approval. Test 39: the public lot page of a lot whose harvest was
# proposed by an agent and approved by the manager shows the verification line. Sourced by smoke-agentic.sh last, after
# smoke-improvement.sh; it does not run on its own. It adds no PASS line to make platform-smoke, so smoke-apps.sh keeps its
# count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-mcp.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

# The web serves /api/mcp and the lot page, so without it there is nothing to check (as the Telegram smoke).
if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: MCP smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi

echo "[mcp]"
M14_T0=$(psql_app "select now()")
M14_SUBJECT="mcp-smoke-$(python3 -c 'import uuid; print(uuid.uuid4())')"
M14_LOT="TC-M14-$(python3 -c 'import secrets; print(secrets.token_hex(3).upper())')"
M14_HOME="$(mktemp -d)"   # the bridge reads ~/.config/dxos-mcp/token.json; HOME points at this throwaway directory
M14_CLIENT_UUID=""
M14_DIRECT_BEFORE=""
M14_PROPOSAL=""
M14_ROWS="select id from platform.agent_proposals where payload->'subjects' ? '$M14_SUBJECT'"

# Puts back the dxos-mcp direct-grant flag. Runs in a subshell so a failing admin call cannot stop the rest of the cleanup.
mcp_restore_client() {
  (
    ADMIN_T="$(kc_admin_token)"
    body="$(_kc GET "/clients/$M14_CLIENT_UUID" | jq -c --argjson v "$M14_DIRECT_BEFORE" '.directAccessGrantsEnabled = $v')"
    _kc PUT "/clients/$M14_CLIENT_UUID" "$body" >/dev/null
  ) || true
}

# Restores what this smoke changed: the dxos-mcp grant flag, the token file, the proposal and its messages, the lot and the
# Telegram link. The EXIT trap of smoke-improvement is replaced, so this one chains it after its own cleanup.
mcp_cleanup() {
  [ -n "$M14_CLIENT_UUID" ] && [ -n "$M14_DIRECT_BEFORE" ] && mcp_restore_client
  rm -rf "$M14_HOME"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($M14_ROWS)" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where proposal_id in ($M14_ROWS)" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($M14_ROWS)" >/dev/null 2>&1 || true
  psql_app "delete from lot_parcels where id='lp_smoke_m14_tc'" >/dev/null 2>&1 || true
  psql_app "delete from lots where id='lot_smoke_m14_tc'" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_links where telegram_user_id=$TG_OWNER" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_link_codes where code_hash='${TG_HASH:-none}'" >/dev/null 2>&1 || true
  telegram_relay_down >/dev/null 2>&1 || true
}
trap 'mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# Setup: the dxos-mcp client exists (idempotent), and its direct grant is on for this run only. CI has no browser for the
# device grant, so the smoke gets the token with the password grant and restores the flag on exit (the device grant is
# covered by the bridge's unit tests).
make mcp-client >/dev/null || fail "make mcp-client failed"
ADMIN_T="$(kc_admin_token)"
M14_CLIENT_UUID="$(_kc GET "/clients?clientId=dxos-mcp" | jq -r '.[0].id // empty')"
[ -n "$M14_CLIENT_UUID" ] || fail "dxos-mcp client is missing after make mcp-client"
M14_CLIENT_JSON="$(_kc GET "/clients/$M14_CLIENT_UUID")"
M14_DIRECT_BEFORE="$(printf '%s' "$M14_CLIENT_JSON" | jq -r '.directAccessGrantsEnabled')"
_kc PUT "/clients/$M14_CLIENT_UUID" "$(printf '%s' "$M14_CLIENT_JSON" | jq -c '.directAccessGrantsEnabled = true')" >/dev/null

# The token response is kept in a variable and written to the bridge's token file with mode 0600. It is never printed.
M14_TOKENS="$(curl -sf -d grant_type=password -d client_id=dxos-mcp -d username=smoke_manager_tc \
  -d "password=$SMOKE_PASSWORD" "$KC_REALM_URL/protocol/openid-connect/token")" \
  || fail "no dxos-mcp token for smoke_manager_tc"
mkdir -p "$M14_HOME/.config/dxos-mcp" && chmod 700 "$M14_HOME/.config/dxos-mcp"
M14_TOKENS="$M14_TOKENS" M14_ISSUER="$KC_REALM_URL" M14_SERVER="$GATEWAY" python3 -c '
import json, os, sys, time
tokens = json.loads(os.environ["M14_TOKENS"])
doc = {"issuer": os.environ["M14_ISSUER"], "server": os.environ["M14_SERVER"], "access_token": tokens["access_token"],
       "refresh_token": tokens["refresh_token"], "expires_at": time.time() + int(tokens["expires_in"])}
fd = os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    json.dump(doc, f)' "$M14_HOME/.config/dxos-mcp/token.json" || fail "could not write the bridge token file"
M14_TOKENS=""
pass "dxos-mcp token stored for the bridge (mode 0600, not printed)"
assert_http 401 "MCP tool list without a token is refused (401)" -- "$GATEWAY/api/mcp/tools"

# The linked manager: the Telegram link comes first, so the proposal the MCP client creates is queued to the owner.
psql_app "update platform.telegram_links set unlinked_at = now() where telegram_user_id in ($TG_OWNER, $TG_STRANGER) and unlinked_at is null" >/dev/null
telegram_relay_up
telegram_link_owner
wait_stub "any(x['method'] == 'sendMessage' and x['params'].get('chat_id') == $TG_OWNER for x in c)" \
  && pass "manager's Telegram account linked for the MCP proposal" || fail "no welcome message after /start (MCP)"

# The bridge speaks MCP over stdio: one JSON-RPC message per line. Request 3 reads a tool and request 4 creates a proposal.
M14_RPC="$(M14_SUBJECT="$M14_SUBJECT" python3 -c '
import json, os
payload = {"template": "sensor_silent", "slots": {"parcel_code": "P-TC-002", "sensor": "soil_moisture", "hours": 8},
           "subjects": [os.environ["M14_SUBJECT"]]}
messages = [
  {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {},
    "clientInfo": {"name": "smoke-mcp", "version": "1"}}},
  {"jsonrpc": "2.0", "method": "notifications/initialized"},
  {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
  {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "pending", "arguments": {}}},
  {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "create_proposal", "arguments": {
    "kind": "notification.internal", "payload": payload, "reason_vi": "Kiểm thử MCP M14"}}},
  {"jsonrpc": "2.0", "id": 5, "method": "ping"},
]
for message in messages:
    print(json.dumps(message, ensure_ascii=False))')"
M14_OUT="$(printf '%s\n' "$M14_RPC" | HOME="$M14_HOME" python3 platform/mcp/dxos_mcp.py serve)" \
  || fail "dxos_mcp serve exited with an error"
# Checks the replies by id and prints the names of the checks that fail; the bridge never prints the token.
M14_FAILED="$(printf '%s\n' "$M14_OUT" | python3 -c '
import json, sys
replies = {m["id"]: m for m in (json.loads(line) for line in sys.stdin if line.strip()) if "id" in m}
def result(i):
    return replies[i]["result"]
checks = {
  "initialize": lambda: result(1)["protocolVersion"] == "2025-06-18" and "tools" in result(1)["capabilities"],
  "tools-list": lambda: "create_proposal" in [tool["name"] for tool in result(2)["tools"]],
  "read-tool": lambda: result(3)["isError"] is False and "Nguồn:" in result(3)["content"][0]["text"],
  "create-proposal": lambda: result(4)["isError"] is False,
  "ping": lambda: result(5) == {},
}
for name, check in checks.items():
    try:
        ok = bool(check())
    except (KeyError, IndexError, TypeError):
        ok = False
    if not ok:
        # The reply is safe to show: the bridge never puts the token in a reply.
        print(name + "\t" + json.dumps(replies.get({"initialize": 1, "tools-list": 2, "read-tool": 3, "create-proposal": 4, "ping": 5}[name]), ensure_ascii=False)[:400])' || true)"
for check in initialize tools-list read-tool create-proposal ping; do
  line="$(grep -E "^$check	" <<<"$M14_FAILED" || true)"
  if [ -n "$line" ]; then fail "MCP bridge check failed: $check (reply: ${line#*	})"; fi
done
pass "MCP bridge answers initialize, tools/list (create_proposal), a read tool with its source, create_proposal and ping"

# Test 38: the proposal is the MCP client's, open, and nothing has decided it.
M14_PROPOSAL="$(psql_app "$M14_ROWS order by created_at desc limit 1")"
[ -n "$M14_PROPOSAL" ] || fail "create_proposal left no proposal for the smoke subject"
assert_eq "$(psql_app "select kind || ':' || status || ':' || origin || ':' || agent || ':' || (requested_by = '$TG_SUB')::text || ':' || (decided_at is null)::text from platform.agent_proposals where id='$M14_PROPOSAL'")" \
  "notification.internal:proposed:user:mcp:true:true" "test 38: the MCP proposal is open, from the user, for the person, and undecided"

# The linked manager approves it on Telegram, from the button the stub recorded for this proposal.
approve_by_telegram mcp "$M14_PROPOSAL"
assert_eq "$(psql_app "select status || ':' || decision_channel from platform.agent_proposals where id='$M14_PROPOSAL'")" \
  "executed:telegram" "test 38: the proposal is executed only after the Telegram approval"

# Test 39: the lot is created after the harvest decision, for a parcel whose harvest an agent proposed and the manager approved.
[ "$(psql_app "select count(*) from platform.agent_proposals where htx_code='TC' and kind='harvest.approve' and status='executed' and payload->>'parcel_id'='pc_tc_2'")" -ge 1 ] \
  || fail "no executed harvest.approve for pc_tc_2 (the M4 smoke must run first)"
# POST /api/lots is officer-only and reads a browser session (requireTenant), which a bash smoke cannot hold, so the lot row
# and its parcel link are inserted as the two-htx fixture does.
psql_app "insert into lots (id, lot_code, commodity, harvest_date, htx_profile_id, status, updated_at) values
  ('lot_smoke_m14_tc', '$M14_LOT', 'Chè', now(), (select id from htx_profiles where htx_code = 'TC'), 'READY', now())" >/dev/null
psql_app "insert into lot_parcels (id, lot_id, parcel_id) values ('lp_smoke_m14_tc', 'lot_smoke_m14_tc', 'pc_tc_2')" >/dev/null
M14_PAGE="$($COMPOSE exec -T web node -e '
fetch(process.argv[1]).then(async (res) => {
  if (!res.ok) { console.error("status " + res.status); process.exit(1); }
  process.stdout.write(await res.text());
}).catch((err) => { console.error(err); process.exit(1); });' "http://127.0.0.1:3000/lot/$M14_LOT")" || fail "public lot page did not answer"
printf '%s' "$M14_PAGE" | python3 -c '
import re, sys
text = re.sub(r"<[^>]+>", " ", sys.stdin.read())
sys.exit(0 if re.search(r"AI đề xuất, trưởng HTX đã duyệt ngày \d{2}/\d{2}/\d{4}, kiểm chứng trong sổ audit", text) else 1)' \
  && pass "public lot page shows the verification line (test 39)" || fail "public lot page has no 'kiểm chứng trong sổ audit' line (test 39)"
printf '%s' "$M14_PAGE" | python3 -c 'import re, sys; sys.exit(1 if "Smoke Manager" in re.sub(r"<[^>]+>", " ", sys.stdin.read()) else 0)' \
  && pass "the lot page shows the role and no name" || fail "the lot page shows the manager's name"
