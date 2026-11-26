#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Telegram relay smoke test against the Bot API stub: link by code, a proposal's signed buttons, the decision edit,
# and the refusals (tampered data, group chat, unlinked account). Sourced by smoke-platform.sh after smoke-agent.sh,
# which provides agent_env, client_token and the TC agent credentials.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-telegram.sh runs only from platform/tests/smoke-platform.sh (it reuses the agent smoke helpers)" >&2
  exit 2
fi

echo "[telegram]"
# The relay talks to the web through APISIX, so without the web there is nothing to check (CI runs this after make web-up).
if [ "${WEB_UP:-0}" != "1" ]; then
  echo "SKIP: telegram smoke needs the web (run make web-up && SMOKE_REQUIRE_WEB=1 bash platform/tests/smoke-agentic.sh)"
  return 0
fi
source platform/tests/lib-telegram.sh

# Its own TC agent client: the agent smoke disables TC at its end, so its token must not be reused here.
./dxos agent enable TC >/dev/null
AT_TC=$(client_token TC)
[ -n "$AT_TC" ] || fail "TC agent token empty for the telegram smoke"
psql_app "update platform.telegram_links set unlinked_at = now() where telegram_user_id in ($TG_OWNER, $TG_STRANGER) and unlinked_at is null" >/dev/null
telegram_relay_up

# Link: one-time code, then /start (helpers in lib-telegram.sh).
telegram_link_owner
wait_stub "any(x['method'] == 'sendMessage' and x['params'].get('chat_id') == $TG_OWNER for x in c)" \
  && pass "/start code answered by the web through the relay (welcome sent)" || fail "no welcome message after /start within 60 s"
# Mini App (M6): the relay set the menu button, and the web binds only the linked Telegram account (spec test 13).
wait_stub "any(x['method'] == 'setChatMenuButton' and x['params']['menu_button']['web_app']['url'] == '$TG_WEB_URL/telegram/open' for x in c)" 15 \
  && pass "relay set the Mini App menu button for the HTTPS web address" || fail "no setChatMenuButton with $TG_WEB_URL/telegram/open"
assert_eq "$(webapp_session "$TG_OWNER" valid 2>&1)" "200 - yes $TG_OWNER" "Mini App session accepts initData of the linked account and sets dxos_tg_webapp"
case "$(webapp_session "$TG_STRANGER" valid 2>&1)" in "403 WEBAPP_NOT_LINKED no"*) pass "Mini App session refuses another Telegram account (test 13)";; *) fail "Mini App session did not refuse an unlinked Telegram account";; esac
case "$(webapp_session "$TG_OWNER" tampered 2>&1)" in 400*|403*) pass "Mini App session refuses tampered initData";; *) fail "Mini App session accepted tampered initData";; esac
case "$(webapp_session "$TG_OWNER" nosession 2>&1)" in 401*) pass "Mini App session needs a signed-in session";; *) fail "Mini App session answered without a session";; esac
assert_eq "$(psql_app "select count(*) from platform.telegram_links where telegram_user_id=$TG_OWNER and user_id='$TG_SUB' and unlinked_at is null")" "1" "link stored for the owner's Telegram account"
assert_eq "$(psql_app "select count(*) from platform.telegram_link_codes where code_hash='$TG_HASH' and used_at is not null")" "1" "link code is marked used after one use"

# A proposal created through the agent API reaches the linked manager with signed buttons.
stub_reset
psql_app "insert into journal_entries (id, parcel_id, entry_date, activity_type, performed_by, submitted_role, status, notes, updated_at) values
  ('je_smoke_telegram_tc', 'pc_tc_1', now(), 'SPRAYING', 'Smoke Telegram', 'FARMER', 'PENDING_APPROVAL', 'smoke telegram', now())
  on conflict (id) do update set updated_at = now()" >/dev/null
JE_VALUES="$(psql_app "$(cat <<'SQL'
select json_build_object(
  'id', e.id, 'parcel_id', e.parcel_id, 'status', e.status,
  'entry_date', to_char(e.entry_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'activity_type', e.activity_type::text, 'notes', e.notes,
  'updated_at', to_char(e.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'activities', coalesce((select json_agg(json_build_object(
      'id', a.id, 'activity_detail', a.activity_detail, 'product_name', a.product_name, 'dosage', a.dosage,
      'withdrawal_days', a.withdrawal_days,
      'safe_harvest_date', to_char(a.safe_harvest_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by a.id collate "C")
    from journal_activities a where a.journal_entry_id = e.id), '[]'::json))
from journal_entries e where e.id = 'je_smoke_telegram_tc'
SQL
)")"
[ -n "$JE_VALUES" ] || fail "could not read evidence values of je_smoke_telegram_tc"
TG_PROPOSAL="$($COMPOSE exec -T web node -e '
const crypto = require("node:crypto");
function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
const sha = (v) => crypto.createHash("sha256").update(canonical(v), "utf8").digest("hex");
async function main() {
  const [atTc, jeValues] = process.argv.slice(1);
  const gw = "http://apisix:9081";
  const headers = { Authorization: "Bearer " + atTc, "Content-Type": "application/json" };
  const values = JSON.parse(jeValues);
  const run = await fetch(gw + "/api/internal/agent/runs", { method: "POST", headers, body: JSON.stringify({ agent: "journal-review", trigger: "manual", provider: "replay" }) });
  if (run.status !== 201) throw new Error("run start answered " + run.status);
  const rows = [{ table: "journal_entries", id: values.id, sha256: sha(values), values }];
  const res = await fetch(gw + "/api/internal/agent/proposals", { method: "POST", headers, body: JSON.stringify({
    run_id: (await run.json()).data.id, agent: "journal-review", kind: "journal.approve",
    payload: { entry_ids: [values.id] }, reason_vi: "Kiểm thử Telegram",
    evidence: { rows, sha256: sha(rows.map((r) => ({ table: r.table, id: r.id, sha256: r.sha256 }))) } }) });
  if (res.status !== 201) throw new Error("proposal answered " + res.status);
  console.log((await res.json()).data.id);
}
main().catch((err) => { console.error(err); process.exit(1); });
' "$AT_TC" "$JE_VALUES")" || fail "agent API refused the smoke proposal"
assert_eq "$(psql_app "select status from platform.agent_proposals where id='$TG_PROPOSAL'")" "proposed" "smoke proposal is open before Telegram acts"

APPROVE=""
for _ in $(seq 1 45); do APPROVE="$(owner_approve_data 2>/dev/null)" && [ -n "$APPROVE" ] && break; sleep 2; done
[ -n "$APPROVE" ] && pass "proposal reached the linked manager with signed approve buttons" \
  || fail "no approve button sent to the owner within 90 s"
case "$APPROVE" in v1\|*) pass "callback_data uses the C3 format";; *) fail "callback_data has the wrong format";; esac

# Refusals: each one must leave the proposal open and be answered without executing (spec tests 4 and 6).
TAMPERED="${APPROVE%?}"
if [ "${APPROVE: -1}" = A ]; then TAMPERED="${TAMPERED}B"; else TAMPERED="${TAMPERED}A"; fi
refuse_check() {  # <label> <from> <chat id> <chat type> <data> <callback id>
  tg_callback "$2" "$3" "$4" "$5" "$6"
  wait_stub "any(x['method'] == 'answerCallbackQuery' and x['params'].get('callback_query_id') == '$6' for x in c)" \
    || fail "$1: callback was not answered"
  assert_eq "$(psql_app "select status from platform.agent_proposals where id='$TG_PROPOSAL'")" "proposed" "$1 refused, proposal still open"
}
refuse_check "tampered callback_data" "$TG_OWNER" "$TG_OWNER" private "$TAMPERED" cq-tampered
refuse_check "callback from a group chat" "$TG_OWNER" "$TG_GROUP" group "$APPROVE" cq-group
refuse_check "callback from an unlinked Telegram account" "$TG_STRANGER" "$TG_STRANGER" private "$APPROVE" cq-stranger

# The valid approval executes through the web and the sent message is edited to show the decision.
tg_callback "$TG_OWNER" "$TG_OWNER" private "$APPROVE" cq-approve
wait_stub "any(x['method'] == 'editMessageText' and x['params'].get('chat_id') == $TG_OWNER and 'duyệt' in x['params'].get('text', '') for x in c)" 45 \
  && pass "approval from Telegram edits the message to the decision" || fail "no decision edit sent to the owner within 90 s"
assert_eq "$(psql_app "select count(*) from platform.agent_proposals where id='$TG_PROPOSAL' and status <> 'proposed'")" "1" "approval from Telegram moved the proposal out of proposed"

# Internal port only: the relay route is closed on 9080 and refuses the agent token on 9081.
assert_http 404 "public port 9080 refuses /api/internal/telegram/updates" -- -X POST "$GATEWAY/api/internal/telegram/updates"
TG_RELAY_TOKEN="$(telegram_client_token)"
$COMPOSE exec -T web node -e '
const [relayToken, agentToken] = process.argv.slice(1);
const url = "http://apisix:9081/api/internal/telegram/updates";
async function status(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return (await fetch(url, { method: "POST", headers, body: JSON.stringify({ update_id: 1 }) })).status;
}
(async () => {
  if (![401, 403].includes(await status(null))) throw new Error("no token must be refused");
  if (![401, 403].includes(await status(agentToken))) throw new Error("agent token must be refused on the relay route");
  if (await status(relayToken) === 401) throw new Error("relay token must be accepted");
})().catch((err) => { console.error(err.message); process.exit(1); });
' "$TG_RELAY_TOKEN" "$AT_TC" && pass "relay route refuses no token and the agent token; accepts the relay token (apisix:9081)" \
  || fail "telegram internal route claim checks"

# Cleanup: remove the relay credentials and the smoke rows; the operator's own relay settings come back.
telegram_relay_down
./dxos agent disable TC >/dev/null
# Messages and reject-reason conversations reference the proposal, so they go first.
psql_app "delete from platform.telegram_outbox where proposal_id='$TG_PROPOSAL' or chat_id in ($TG_OWNER, $TG_STRANGER, $TG_GROUP)" >/dev/null
psql_app "delete from platform.telegram_conversations where proposal_id='$TG_PROPOSAL'" >/dev/null
psql_app "delete from platform.agent_proposals where id='$TG_PROPOSAL'" >/dev/null
psql_app "delete from journal_entries where id='je_smoke_telegram_tc'" >/dev/null
psql_app "delete from platform.telegram_links where telegram_user_id in ($TG_OWNER, $TG_STRANGER)" >/dev/null
psql_app "delete from platform.telegram_link_codes where code_hash='$TG_HASH'" >/dev/null
pass "telegram smoke cleaned up (credentials disabled, stub stopped)"
