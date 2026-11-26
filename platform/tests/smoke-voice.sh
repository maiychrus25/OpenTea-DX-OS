#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
# Telegram voice messages (M15) against the Bot API stub and the STT stub (never the real whisper.cpp): the answer with its
# three buttons, Đúng starting the journal flow, test 40 (no journal row before the card's Xác nhận), the 60-second limit,
# an old Đúng, and the fallback when the STT server is down. Sourced by smoke-agentic.sh after smoke-staff.sh and smoke-mcp.sh, which left the
# farmer linked and the relay up (the assistant smoke's helpers and variables are in scope); it does not run on its own.
# It adds no PASS line to make platform-smoke, so smoke-apps.sh keeps its count.

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "smoke-voice.sh runs only from platform/tests/smoke-agentic.sh" >&2
  exit 2
fi

echo "[voice]"
STT_STUB="http://127.0.0.1:8083"
VOICE_HEARD="Em nghe được: “Ghi nhật ký bón phân thửa A3”"
VOICE_TEXT_PY='
import json, sys
uid, sender, duration = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
voice = {"file_id": "smoke-voice-1", "file_unique_id": "smoke-voice", "duration": duration, "mime_type": "audio/ogg", "file_size": 76}
print(json.dumps({"update_id": uid, "message": {"message_id": uid, "chat": {"id": sender, "type": "private"}, "from": {"id": sender}, "voice": voice}}))'

voice_cleanup() {
  psql_app "delete from platform.telegram_conversations where telegram_user_id=$TG_FARMER and proposal_id is null" >/dev/null 2>&1 || true
  $COMPOSE --profile stt-test stop stt-test-stub >/dev/null 2>&1 || true
}
# The EXIT trap of smoke-mcp is replaced, so this one chains every earlier cleanup after its own.
trap 'voice_cleanup; staff_cleanup; mcp_cleanup; improvement_cleanup; campaign_cleanup; assistant_cleanup; m4_cleanup; llm_cleanup' EXIT

tg_voice() { tg_inject_py "$VOICE_TEXT_PY" "$1" "$2"; }  # <chat> <duration in seconds>
stt_posts() { curl -sf "$STT_STUB/control/requests" | python3 -c 'import json, sys; print(len(json.load(sys.stdin)["requests"]))'; }
# Clears the farmer's open conversation so one step's buttons never leak into the next.
voice_clear() { psql_app "delete from platform.telegram_conversations where telegram_user_id=$TG_FARMER and proposal_id is null" >/dev/null; }

# The STT stub answers on the compose network as dxos-stt, where the relay posts by default.
$COMPOSE --profile stt-test up -d --no-deps stt-test-stub >/dev/null
for _ in $(seq 1 30); do curl -sf "$STT_STUB/healthz" >/dev/null 2>&1 || curl -sf "$STT_STUB/" >/dev/null 2>&1 && break; sleep 1; done
curl -sf -X POST "$STT_STUB/control/reset" >/dev/null || fail "stt-test-stub does not answer on $STT_STUB"
voice_clear
V_ROWS=$(as_journal_rows)
V_PROMPTS=$(tg_count "$TG_FARMER" "Chọn thửa:")

# A voice message is transcribed by the STT stub and answered with the text and three buttons; nothing runs yet (test 40).
n=$(tg_count "$TG_FARMER" "$VOICE_HEARD")
tg_voice "$TG_FARMER" 7
tg_expect "$TG_FARMER" "$VOICE_HEARD" "$n" || fail "no 'Em nghe được' answer to the farmer's voice message within 90 s"
pass "a voice message is answered with what the relay heard"
V_OK="$(tg_button "$TG_FARMER" "Đúng")"
for label in "Đúng" "Sửa" "Huỷ"; do
  [ -n "$(tg_button "$TG_FARMER" "$label")" ] && pass "the voice answer offers the button $label" || fail "the voice answer has no $label button"
done
assert_eq "$(stt_posts)" "1" "the STT stub got exactly one post for the voice message"
assert_eq "$(curl -sf "$STT_STUB/control/requests" | python3 -c 'import json, sys; r = json.load(sys.stdin)["requests"][0]; print(r["ogg"], r["multipart"])')" "True True" "the STT stub got the OGG bytes as multipart"
assert_eq "$(as_journal_rows)" "$V_ROWS" "test 40: no journal row after the voice message"
assert_eq "$(tg_count "$TG_FARMER" "Chọn thửa:")" "$V_PROMPTS" "test 40: the voice text starts no flow before Đúng"

# Đúng replays the text as if typed: the journal flow starts, and the write still waits for its card's Xác nhận.
tg_press "$TG_FARMER" "Đúng"
tg_expect "$TG_FARMER" "Chọn thửa:" "$V_PROMPTS" || fail "Đúng did not start the journal flow within 90 s"
pass "Đúng sends the heard text on and the journal flow starts"
assert_eq "$(as_journal_rows)" "$V_ROWS" "test 40: still no journal row before the card's Xác nhận"

# An old Đúng (the conversation is gone) is answered and sends nothing.
voice_clear
V_BEFORE=$(tg_total "$TG_FARMER")
tg_callback "$TG_FARMER" "$TG_FARMER" private "$V_OK" "cq-voice-stale"
wait_stub "any(x['method'] == 'answerCallbackQuery' and x['params'].get('callback_query_id') == 'cq-voice-stale' for x in c)" 30 \
  && pass "an old Đúng is answered" || fail "an old Đúng was not answered"
sleep 4
assert_eq "$(tg_total "$TG_FARMER")" "$V_BEFORE" "an old Đúng sends no message"
assert_eq "$(as_journal_rows)" "$V_ROWS" "an old Đúng writes no journal row"

# Sửa and Huỷ.
n=$(tg_count "$TG_FARMER" "$VOICE_HEARD")
tg_voice "$TG_FARMER" 7
tg_expect "$TG_FARMER" "$VOICE_HEARD" "$n" || fail "no second voice answer"
tg_answer "$TG_FARMER" button "Sửa" "Bạn nhắn lại câu đúng nhé."
voice_clear
n=$(tg_count "$TG_FARMER" "$VOICE_HEARD")
tg_voice "$TG_FARMER" 7
tg_expect "$TG_FARMER" "$VOICE_HEARD" "$n" || fail "no third voice answer"
tg_answer "$TG_FARMER" button "Huỷ" "Đã huỷ"
assert_eq "$(as_journal_rows)" "$V_ROWS" "Sửa and Huỷ write no journal row"

# More than 60 seconds is refused without a download: the STT stub gets no second post.
V_POSTS=$(stt_posts)
tg_answer_voice() { local before; before=$(tg_count "$TG_FARMER" "$1"); tg_voice "$TG_FARMER" "$2"; tg_expect "$TG_FARMER" "$1" "$before" || fail "no answer containing '$1'"; }
tg_answer_voice "Tin thoại dài quá 60 giây" 61
assert_eq "$(stt_posts)" "$V_POSTS" "a 61-second voice message is not sent to the STT server"

# The STT server is down: the fallback text, and the text chat still works.
$COMPOSE --profile stt-test stop stt-test-stub >/dev/null
tg_answer_voice "Chưa nghe được tin thoại lúc này. Bạn nhắn chữ giúp nhé." 7
tg_answer "$TG_FARMER" text "xem nhật ký" "$AS_CODE_PARCEL"
pass "with the STT server down a voice message gets the fallback and text chat still answers"
voice_clear
