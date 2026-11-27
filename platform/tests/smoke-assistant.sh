#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Telegram assistant (M5) against the Bot API stub and the LLM stub: a farmer's journal card with a photo (the done-when),
# the card rules (test 11), the role and scope refusals (tests 10 and 12), the two-card harvest approval (test 36) and
# one intent through A7. Sourced by smoke-agentic.sh after smoke-agents.sh, which left the owner linked and the relay up;
# it does not run on its own. It adds no PASS line to make platform-smoke, so smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-assistant.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

echo "[assistant]"
TG_FARMER=900004  # Telegram account linked to smoke_farmer_tc (household hh_tc_1)
AS_T0=$(psql_app "select now()")
AS_PARCEL="pc_tc_1"  # the farmer's parcel; its status is restored at cleanup
AS_CODE_PARCEL=$(psql_app "select parcel_code from parcels where id='$AS_PARCEL'")
AS_CODE_OTHER=$(psql_app "select parcel_code from parcels where id='pc_tc_2'")  # another TC household
AS_CODE_LB=$(psql_app "select parcel_code from parcels where id='pc_lb_1'")      # another cooperative
AS_PARCEL_STATUS=$(psql_app "select status from parcels where id='$AS_PARCEL'")
AS_ASSISTANT_PROVIDER=$(psql_app "select provider from platform.agent_settings where htx_code='TC' and agent='assistant'")

# Issue #80 (chat media): throwaway stand-ins for the disease API and for Piper, on the compose network under the aliases the
# web calls. The real services are stopped while a stub holds their alias and started again by assistant_cleanup.
AS_NET="${COMPOSE_PROJECT_NAME:-docker}_agrimarket-net"
AS_DISEASE_STUB="dxos-smoke-disease-stub"
AS_TTS_STUB="dxos-smoke-tts-stub"
AS_DISEASE_URL="http://127.0.0.1:8084"
AS_DISEASE_WAS_UP=""
AS_PIPER_WAS_UP=""
AS_BULLETIN_ID=""

# Restores what this smoke changed. It runs before the M4 cleanup (which unlinks the owner) and the LLM cleanup.
assistant_cleanup() {
  docker rm -f -v "$AS_DISEASE_STUB" "$AS_TTS_STUB" >/dev/null 2>&1 || true
  if [ -n "$AS_DISEASE_WAS_UP" ]; then $COMPOSE start disease-api >/dev/null 2>&1 || true; $COMPOSE restart apisix >/dev/null 2>&1 || true; fi
  if [ -n "$AS_PIPER_WAS_UP" ]; then $COMPOSE start piper >/dev/null 2>&1 || true; fi
  if [ -n "$AS_BULLETIN_ID" ]; then psql_app "delete from bulletins where id='$AS_BULLETIN_ID'" >/dev/null 2>&1 || true; fi
  psql_app "delete from notifications where title='Báo cáo sâu bệnh mới' and created_at >= '$AS_T0'" >/dev/null 2>&1 || true
  psql_app "delete from disease_reports where parcel_id='$AS_PARCEL' and created_at >= '$AS_T0'" >/dev/null 2>&1 || true
  local rows="select id from journal_entries where (created_at >= '$AS_T0' and parcel_id='$AS_PARCEL') or id in ('je_smoke_asst_tc2','je_smoke_asst_lb')"
  local props="select id from platform.agent_proposals where subject_ids && array(${rows})"
  psql_app "delete from platform.telegram_outbox where proposal_id in ($props) or (chat_id in ($TG_FARMER, $TG_OWNER) and created_at >= '$AS_T0')" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_conversations where telegram_user_id in ($TG_FARMER, $TG_OWNER) and proposal_id is null" >/dev/null 2>&1 || true
  psql_app "delete from platform.assistant_requests where telegram_user_id=$TG_FARMER" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_links where telegram_user_id=$TG_FARMER" >/dev/null 2>&1 || true
  psql_app "delete from platform.telegram_link_codes where code_hash='${AS_HASH:-none}'" >/dev/null 2>&1 || true
  psql_app "delete from platform.agent_proposals where id in ($props)" >/dev/null 2>&1 || true
  psql_app "delete from journal_activities where journal_entry_id in ($rows)" >/dev/null 2>&1 || true
  psql_app "delete from journal_entries where id in ($rows)" >/dev/null 2>&1 || true
  psql_app "update parcels set status='$AS_PARCEL_STATUS' where id='$AS_PARCEL'" >/dev/null 2>&1 || true
  if [ -n "$AS_ASSISTANT_PROVIDER" ]; then
    psql_app "update platform.agent_settings set provider='$AS_ASSISTANT_PROVIDER' where htx_code='TC' and agent='assistant'" >/dev/null 2>&1 || true
  else
    psql_app "delete from platform.agent_settings where htx_code='TC' and agent='assistant'" >/dev/null 2>&1 || true
  fi
}
# The EXIT trap of smoke-agents stays in place: this one runs first, then its cleanups.
trap 'assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

# Python snippets for the injected updates. Arguments: the update id, then the sender and the text, or the sender.
TG_TEXT_PY='
import json, sys
uid, sender, text = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
print(json.dumps({"update_id": uid, "message": {"message_id": uid, "chat": {"id": sender, "type": "private"}, "from": {"id": sender}, "text": text}}, ensure_ascii=False))'
TG_PHOTO_PY='
import json, sys
uid, sender = int(sys.argv[1]), int(sys.argv[2])
sizes = [{"file_id": "smoke-photo-s", "file_unique_id": "smoke-s", "file_size": 2048, "width": 90, "height": 90},
         {"file_id": "smoke-photo-l", "file_unique_id": "smoke-l", "file_size": 4096, "width": 180, "height": 180}]
print(json.dumps({"update_id": uid, "message": {"message_id": uid, "chat": {"id": sender, "type": "private"}, "from": {"id": sender}, "photo": sizes}}))'

# tg_inject_py <snippet> <args...>: queues one private update built by the snippet.
tg_inject_py() {
  local code="$1"
  shift
  TG_UPDATE_ID=$((TG_UPDATE_ID + 1))
  curl -sf -X POST "$STUB/control/updates" -H 'Content-Type: application/json' \
    -d "$(python3 -c "$code" "$TG_UPDATE_ID" "$@")" >/dev/null
}
TG_CAPTION_PY='
import json, sys
uid, sender, caption = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
sizes = [{"file_id": "smoke-photo-l", "file_unique_id": "smoke-l", "file_size": 4096, "width": 180, "height": 180}]
print(json.dumps({"update_id": uid, "message": {"message_id": uid, "chat": {"id": sender, "type": "private"}, "from": {"id": sender}, "photo": sizes, "caption": caption}}, ensure_ascii=False))'
tg_text() { tg_inject_py "$TG_TEXT_PY" "$1" "$2"; }  # <chat> <text>
tg_photo() { tg_inject_py "$TG_PHOTO_PY" "$1"; }      # <chat>
tg_photo_caption() { tg_inject_py "$TG_CAPTION_PY" "$1" "$2"; }  # <chat> <caption>

# Messages the bot sent or edited to <chat> (the stub records every call), and how many contain <needle>.
tg_total() {
  stub_calls | python3 -c '
import json, sys
chat = int(sys.argv[1])
print(sum(1 for c in json.load(sys.stdin) if c["method"] in ("sendMessage", "editMessageText") and c["params"].get("chat_id") == chat))' "$1"
}
tg_count() {  # <chat> <needle>
  stub_calls | python3 -c '
import json, sys
chat, needle = int(sys.argv[1]), sys.argv[2]
print(sum(1 for c in json.load(sys.stdin) if c["method"] in ("sendMessage", "editMessageText")
          and c["params"].get("chat_id") == chat and needle in c["params"].get("text", "")))' "$1" "$2"
}
tg_last_text() {  # <chat>: text of the newest message the bot sent or edited to <chat>
  stub_calls | python3 -c '
import json, sys
chat = int(sys.argv[1])
sent = [c["params"].get("text", "") for c in json.load(sys.stdin) if c["method"] in ("sendMessage", "editMessageText") and c["params"].get("chat_id") == chat]
print(sent[-1] if sent else "")' "$1"
}
# Waits until the chat has more messages containing <needle> than <before>: tg_expect <chat> <needle> <before>
tg_expect() {
  local i
  for i in $(seq 1 45); do
    [ "$(tg_count "$1" "$2")" -gt "$3" ] && return 0
    sleep 2
  done
  return 1
}
# Whether the newest message with <needle> sent to <chat> has no "Xác nhận" button (a refusal carries no card).
tg_no_confirm() {  # <chat> <needle>
  stub_calls | python3 -c '
import json, sys
chat, needle = int(sys.argv[1]), sys.argv[2]
hits = [c for c in json.load(sys.stdin) if c["method"] in ("sendMessage", "editMessageText")
        and c["params"].get("chat_id") == chat and needle in c["params"].get("text", "")]
buttons = [b.get("text") for row in (hits[-1]["params"].get("reply_markup") or {}).get("inline_keyboard", []) for b in row] if hits else []
sys.exit(0 if hits and "Xác nhận" not in buttons else 1)' "$1" "$2"
}
# callback_data of the button labelled <label> on the newest keyboard sent or edited to <chat> that has it; empty if absent.
# The owner's chat can also get proposal messages from the agents, so the newest keyboard is not always the flow's.
tg_button() {  # <chat> <label>
  stub_calls | python3 -c '
import json, sys
chat, label = int(sys.argv[1]), sys.argv[2]
for call in reversed(json.load(sys.stdin)):
    if call["method"] in ("sendMessage", "editMessageText") and call["params"].get("chat_id") == chat and "reply_markup" in call["params"]:
        for row in call["params"]["reply_markup"].get("inline_keyboard", []):
            for button in row:
                if button.get("text") == label:
                    print(button["callback_data"])
                    sys.exit(0)
sys.exit(1)' "$1" "$2" 2>/dev/null
}
# Presses a button as the chat's own user. The callback data comes from the stub, which recorded the signed keyboard.
tg_press() {  # <chat> <label>
  local data="" i
  for i in $(seq 1 30); do
    data="$(tg_button "$1" "$2")" && [ -n "$data" ] && break
    data=""
    sleep 2
  done
  [ -n "$data" ] || fail "button '$2' was not offered to chat $1 within 60 s (assistant smoke)"
  tg_callback "$1" "$1" private "$data" "cq-asst-$TG_UPDATE_ID"
}
# One answer in a flow (a typed text, a button label or a photo), then the wait for the next message containing <needle>.
tg_answer() {  # <chat> <text|button|photo> <value> <needle>
  local before
  before=$(tg_count "$1" "$4")
  case "$2" in
    text) tg_text "$1" "$3" ;;
    button) tg_press "$1" "$3" ;;
    photo) tg_photo "$1" ;;
  esac
  tg_expect "$1" "$4" "$before" || fail "assistant flow did not reach '$4' after '$3'"
}
# /nhatky to the card: the parcel, the activity Phun thuốc, product, dosage and withdrawal 7, then a photo or Bỏ qua.
farmer_journal_card() {  # <photo|skip>
  tg_answer "$TG_FARMER" text "/nhatky" "Chọn thửa:"
  tg_answer "$TG_FARMER" button "$AS_CODE_PARCEL" "Chọn hoạt động:"
  tg_answer "$TG_FARMER" button "Phun thuốc" "Tên thuốc hoặc phân bón:"
  tg_answer "$TG_FARMER" text "Regent 800WG" "Liều lượng, ví dụ"
  tg_answer "$TG_FARMER" text "20 ml" "Số ngày cách ly"
  tg_answer "$TG_FARMER" text "7" "Gửi một ảnh minh chứng"
  if [ "$1" = photo ]; then
    tg_answer "$TG_FARMER" photo "" "Không bấm Xác nhận"
  else
    tg_answer "$TG_FARMER" button "Bỏ qua" "Không bấm Xác nhận"
  fi
}
# Journal rows the farmer's flow wrote for the smoke parcel since the smoke began.
as_journal_rows() {
  psql_app "select count(*) from journal_entries where parcel_id='$AS_PARCEL' and submitted_role='FARMER' and created_at >= '$AS_T0'"
}

# The agent stays stopped while the rows are seeded (lesson 5); it is started with the stub provider after the seeds.
$COMPOSE stop dxos-agent >/dev/null
./dxos agent enable TC >/dev/null
psql_app "insert into platform.agent_settings (htx_code, agent, provider) values ('TC', 'assistant', 'anthropic')
  on conflict (htx_code, agent) do update set provider = 'anthropic'" >/dev/null
psql_app "update parcels set status='TENDING' where id='$AS_PARCEL'" >/dev/null
# Journal rows of the other household and the other cooperative, for test 12.
psql_app "insert into journal_entries (id, parcel_id, entry_date, activity_type, performed_by, submitted_role, status, notes, updated_at) values
  ('je_smoke_asst_tc2', 'pc_tc_2', now(), 'SPRAYING', 'Smoke Assistant TC2', 'FARMER', 'PENDING_APPROVAL', 'smoke assistant other household', now()),
  ('je_smoke_asst_lb', 'pc_lb_1', now(), 'SPRAYING', 'Smoke Assistant LB', 'FARMER', 'PENDING_APPROVAL', 'smoke assistant other cooperative', now())
  on conflict (id) do nothing" >/dev/null

# The farmer's link: a one-time code, stored as its SHA-256 only (C4), then /start, as telegram_link_owner does.
AS_FARMER_TOKEN="$(user_token smoke_farmer_tc)"
[ -n "$AS_FARMER_TOKEN" ] || fail "no token for smoke_farmer_tc (assistant smoke)"
AS_FARMER_SUB="$(python3 -c 'import base64, json, sys; p = sys.argv[1].split(".")[1]; p += "=" * (-len(p) % 4); print(json.loads(base64.urlsafe_b64decode(p))["sub"])' "$AS_FARMER_TOKEN")"
AS_CODE="$(python3 -c 'import secrets; print(secrets.token_hex(4).upper())')"
AS_HASH="$(python3 -c 'import hashlib, sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())' "$AS_CODE")"
psql_app "insert into platform.telegram_link_codes (code_hash, kind, user_id, user_name, role, htx_code, expires_at)
  values ('$AS_HASH', 'user', '$AS_FARMER_SUB', 'Smoke Farmer TC', 'farmer', 'TC', now() + interval '10 minutes')" >/dev/null
n=$(tg_count "$TG_FARMER" "Đã kết nối tài khoản")
tg_text "$TG_FARMER" "/start $AS_CODE"
tg_expect "$TG_FARMER" "Đã kết nối tài khoản" "$n" || fail "the farmer's /start code was not answered (assistant smoke)"
assert_eq "$(psql_app "select count(*) from platform.telegram_links where telegram_user_id=$TG_FARMER and user_id='$AS_FARMER_SUB' and unlinked_at is null")" "1" "farmer's Telegram account linked to smoke_farmer_tc"

# The agent starts with the stub as its provider for assistant, and the web needs a recent agent heartbeat (10 min).
llm_stub up
ANTHROPIC_API_KEY="$LLM_KEY" ANTHROPIC_API_BASE="http://llm-test-stub:8082" $COMPOSE up -d --no-deps --force-recreate dxos-agent >/dev/null
wait_psql "select exists(select 1 from platform.service_heartbeats where service='agent:TC' and last_seen_at >= now() - interval '2 minutes')" "t" 60 \
  || fail "agent:TC has no recent heartbeat for the assistant smoke"

# Done-when: the farmer records a journal entry with a photo, using only Telegram.
farmer_journal_card photo
tg_answer "$TG_FARMER" button "Xác nhận" "Đã ghi nhật ký. Nhật ký đang chờ duyệt."
assert_eq "$(as_journal_rows)" "1" "one journal row for the farmer's parcel after Xác nhận"
assert_eq "$(psql_app "select count(*) from journal_entries where parcel_id='$AS_PARCEL' and submitted_role='FARMER' and created_at >= '$AS_T0' and status='PENDING_APPROVAL' and photo_minio_key like 'para/TC/Areas/Journal/%'")" "1" "the row is PENDING_APPROVAL with a photo under the TC journal root"

# Test 11: a cancelled card and a confirm after the card expired write nothing.
farmer_journal_card skip
tg_answer "$TG_FARMER" button "Huỷ" "Đã huỷ. Không có gì được ghi."
assert_eq "$(as_journal_rows)" "1" "test 11: a cancelled journal card writes no row"
farmer_journal_card skip
psql_app "update platform.telegram_conversations set expires_at = now() - interval '1 minute' where telegram_user_id=$TG_FARMER" >/dev/null
tg_answer "$TG_FARMER" button "Xác nhận" "Thẻ đã hết hạn. Không có gì được thực hiện."
assert_eq "$(as_journal_rows)" "1" "test 11: a confirm after the card expired writes no row"

# Test 10: a farmer cannot batch-approve; the refusal carries no card.
tg_answer "$TG_FARMER" text "duyệt hết nhật ký" "Tài khoản của bạn không có quyền: Duyệt nhật ký đang chờ."
tg_no_confirm "$TG_FARMER" "Tài khoản của bạn không có quyền: Duyệt nhật ký đang chờ." \
  && pass "test 10: a farmer's batch approval is refused and has no Xác nhận button" \
  || fail "test 10: the refusal carries a card"

# Test 12: a farmer's journal shows their own parcel only, never another household or cooperative.
n=$(tg_total "$TG_FARMER")
tg_text "$TG_FARMER" "xem nhật ký"
for _ in $(seq 1 30); do [ "$(tg_total "$TG_FARMER")" -gt "$n" ] && break; sleep 2; done
REPLY="$(tg_last_text "$TG_FARMER")"
assert_eq "$(python3 -c '
import sys
text, own, other, lb = sys.argv[1:5]
print("ok" if own in text and other not in text and lb not in text else "bad")' "$REPLY" "$AS_CODE_PARCEL" "$AS_CODE_OTHER" "$AS_CODE_LB")" "ok" \
  "test 12: the journal reply has the farmer's parcel and no other household's or cooperative's parcel"

# Test 36: a manager's harvest approval takes two cards; the second one expires and nothing is executed.
tg_answer "$TG_OWNER" text "duyệt thu hoạch" "Chọn thửa cần duyệt thu hoạch:"
tg_answer "$TG_OWNER" button "$AS_CODE_PARCEL" "Không bấm Xác nhận"
tg_answer "$TG_OWNER" button "Tiếp tục" "Nút hết hạn sau 10 phút."
psql_app "update platform.telegram_conversations set expires_at = now() - interval '1 minute' where telegram_user_id=$TG_OWNER" >/dev/null
tg_answer "$TG_OWNER" button "Xác nhận lần cuối" "Thẻ đã hết hạn. Không có gì được thực hiện."
assert_eq "$(psql_app "select status from parcels where id='$AS_PARCEL'")" "TENDING" "test 36: the parcel is unchanged after the expired second card"

# A7: a free sentence goes to the assistant agent, the LLM stub names the weather tool, and the web answers with its source.
n=$(tg_count "$TG_FARMER" "Nguồn: Thời tiết")
tg_text "$TG_FARMER" "mai có nên đi hái không"
tg_expect "$TG_FARMER" "Nguồn: Thời tiết" "$n" || fail "A7 weather answer was not sent to the farmer within 90 s"
pass "A7 answers a free sentence with the weather tool (Nguồn: Thời tiết)"

# ---- issue #80: a caption read as text, a disease photo in chat, and Nghe ------------------------------------------------------
echo "[assistant: chat media]"
as_clear_flow() { psql_app "delete from platform.telegram_conversations where telegram_user_id in ($TG_FARMER, $TG_OWNER) and proposal_id is null" >/dev/null; }

# C5: a photo's caption is read as the message text when no flow waits for a photo.
as_clear_flow
n=$(tg_total "$TG_FARMER")
tg_photo_caption "$TG_FARMER" "xem nhật ký"
for _ in $(seq 1 30); do [ "$(tg_total "$TG_FARMER")" -gt "$n" ] && break; sleep 2; done
assert_eq "$(python3 -c 'import sys; print("ok" if sys.argv[2] in sys.argv[1] else "bad")' "$(tg_last_text "$TG_FARMER")" "$AS_CODE_PARCEL")" "ok" \
  "a photo caption 'xem nhật ký' is answered like the typed sentence (the farmer's journal)"

# C3: the farmer's disease photo reaches the disease API stub through apisix:9081, with the web service token, and is answered.
AS_DISEASE_WAS_UP="$($COMPOSE ps -q disease-api 2>/dev/null)"
[ -z "$AS_DISEASE_WAS_UP" ] || $COMPOSE stop disease-api >/dev/null
docker rm -f -v "$AS_DISEASE_STUB" >/dev/null 2>&1 || true
docker run -d --name "$AS_DISEASE_STUB" --network "$AS_NET" --network-alias disease-api -p 127.0.0.1:8084:8000 \
  -v "$PWD/platform/tests/stub_disease.py:/app/stub_disease.py:ro" -e DXOS_DISEASE_STUB_PORT=8000 \
  python:3.12.15-slim-bookworm python -u /app/stub_disease.py >/dev/null
for _ in $(seq 1 30); do curl -sf "$AS_DISEASE_URL/health" >/dev/null 2>&1 && break; sleep 1; done
curl -sf -X POST "$AS_DISEASE_URL/control/reset" >/dev/null || fail "the disease stub does not answer on $AS_DISEASE_URL"
# apisix resolved disease-api once and keeps that address; restart it so the stub's address is used.
$COMPOSE restart apisix >/dev/null
for _ in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$GATEWAY/api/ai/disease/health")" != 000 ] && break; sleep 2; done
as_clear_flow
tg_answer "$TG_FARMER" text "/benh" "Chọn thửa có cây bị bệnh:"
tg_answer "$TG_FARMER" button "$AS_CODE_PARCEL" "Gửi ảnh lá chè bị bệnh"
tg_answer "$TG_FARMER" photo "" "Gửi ảnh thửa $AS_CODE_PARCEL để chẩn đoán"
tg_answer "$TG_FARMER" button "Xác nhận" "Cán bộ sẽ xác nhận kết quả này."
assert_eq "$(tg_count "$TG_FARMER" "Phồng lá chè (91.0%)")" "1" "the farmer's disease photo is answered with the stub's label and confidence"
assert_eq "$(curl -sf "$AS_DISEASE_URL/control/requests" | python3 -c 'import json, sys; r = json.load(sys.stdin)["requests"]; print(len(r), r[0]["bearer"], r[0]["multipart"], r[0]["jpeg"])')" "1 True True True" \
  "the disease stub got one multipart JPEG with a bearer token, through the gateway's internal web route"
assert_eq "$(psql_app "select count(*) from disease_reports where parcel_id='$AS_PARCEL' and created_at >= '$AS_T0' and ai_disease_name='Phồng lá chè'")" "1" "one disease report row for the parcel"

# C4: Nghe on the bulletin. Without a voice service it answers the fallback line; with the Piper stub it sends ban-tin.wav.
AS_BULLETIN_ID="$(psql_app "insert into bulletins (commodity, bulletin_vi, sources_json, model_used, is_latest, status, htx_code)
  values ('Tea', E'Giá chè hôm nay ổn định.\\nTồn kho thấp.', '[]', 'smoke', true, 'published', 'TC') returning id" | head -n 1)"
AS_PIPER_WAS_UP="$($COMPOSE ps -q piper 2>/dev/null)"
[ -z "$AS_PIPER_WAS_UP" ] || $COMPOSE stop piper >/dev/null
as_clear_flow
tg_answer "$TG_OWNER" text "bản tin hôm nay" "Nguồn: Bản tin"
tg_answer "$TG_OWNER" button "Nghe" "Chưa đọc được bản tin lúc này."
assert_eq "$(stub_calls | python3 -c 'import json, sys; print(sum(1 for c in json.load(sys.stdin) if c["method"] == "sendDocument"))')" "0" "without a voice service Nghe sends no document"
docker rm -f -v "$AS_TTS_STUB" >/dev/null 2>&1 || true
docker run -d --name "$AS_TTS_STUB" --network "$AS_NET" --network-alias piper \
  -v "$PWD/platform/tests/stub_tts.py:/app/stub_tts.py:ro" -e DXOS_TTS_STUB_PORT=10200 \
  python:3.12.15-slim-bookworm python -u /app/stub_tts.py >/dev/null
sleep 2
tg_press "$TG_OWNER" "Nghe"
wait_stub "any(x['method'] == 'sendDocument' and x['params'].get('chat_id') == $TG_OWNER and x['params'].get('caption', '').startswith('Bản tin ') and x['files'][0]['filename'] == 'ban-tin.wav' and x['files'][0]['size'] > 44 for x in c)" 45 \
  && pass "with the voice stub Nghe sends the bulletin as the WAV document ban-tin.wav" \
  || fail "Nghe did not send ban-tin.wav to the owner within 90 s"
as_clear_flow
