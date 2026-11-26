<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M5: Telegram chat assistant — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a linked farmer, officer or manager uses the bot as an assistant in a private chat. They can:
- use a button menu, typed commands or free Vietnamese text, and send photos and a location;
- read answers that come from the web's own use cases, with the asker's rights;
- write only through a confirmation card, with two cards for high-risk actions.

Done when a farmer records a journal entry with a photo using only Telegram.

**Architecture:** the web stays the authority and runs the conversation.
- A deterministic router handles commands, menu buttons, flow input and a fixed keyword table.
- Text it cannot place becomes an assistant request. Agent A7 (`assistant`) in `dxos-agent` turns the request into an intent with the cooperative's provider. The LLM sees only the sentence, today's date and the names of the tools and actions, never business data.
- The web validates the intent and checks the live role. It then does one of two things:
  - runs a read tool as the user and formats the answer itself;
  - starts a flow of steps that ends in a card.
- The relay forwards photos (bytes) and locations.

**Tech Stack:** Next.js 14 + Prisma (raw SQL for `platform.*`) + zod (`apps/web`), Python 3.12 standard library (`platform/agent`, `platform/telegram`), PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` (Vietnamese, the authority): §13.2, §13.4 (two steps), §13.5, §13.7, §9 (A7), §15 tests 10, 11, 12, 17 and 36; milestone row M5 in §17.

## Scope of this milestone

| In M5 | Later (stays in its coverage group, not wired in chat yet) |
|---|---|
| Menu, typed commands, `/huy` | Read-aloud button "Nghe": Telegram needs OGG/Opus or MP3 and `/api/tts` gives WAV, so it needs an audio converter |
| 11 read tools (C5), location → nearest parcel and its weather | Remaining chat-read rows: search, certificates, soil health, latest photo, households, members, officer disease list, profile, documents, partners |
| 4 actions with cards (C6): `journal.create` (photo), `disease.report` (photo), `journal.batch_approve`, `harvest.approve` (two cards) | Remaining chat-confirm rows: announce, notification read/delete, members, profile, households, lots, export QR, start round, harvest scheduling, draft journal edit/delete, officer disease review |
| A7 intent with the cooperative's provider, the keyword router as the always-on fallback | Mini App button and "Sửa" on cards (M6); voice messages (M15); `/chiendich` (M7); `/tuvanhanh`, `/dung` (M12) |
| Coverage table in code and test 17; rate limit; tests 10, 11, 12, 36 | |

Commands of later milestones answer `notYet` (C10). The router only maps to tools and actions that exist.

## Global Constraints

- **Repository rules:** `AGENTS.md`.
  - English Conventional Commits and English identifiers.
  - Vietnamese user-facing text with diacritics.
  - SPDX headers on new files.
  - No secrets and no `.env*` files. No new dependency.
- **Standard library only:** `platform/agent` and `platform/telegram` add nothing else.
- **The web decides everything** (spec §5.1, §13.5).
  - A link is trusted only for who it names. Role, cooperative and enabled flag are read live (`LiveRoleReader`) when the update is handled and again when Confirm is pressed.
  - Role choice follows `roleFromRealmRoles` (`apps/web/src/lib/auth/token-refresh.ts`).
- **Writes need a Confirm press.** A chat write runs only when the same Telegram user presses Confirm on its card.
  - The card expires 10 minutes after it is sent.
  - A `high` action has two cards; the second expires 10 minutes after Continue.
  - Without Confirm nothing is written (test 11).
- **Private chats only.** Menu, flows, cards and assistant requests work only in private chats. Groups keep the M2 behaviour.
- **What the LLM sees.** The user's sentence (redacted by the provider layer when external), today's date in Vietnam, and the tool and action list of C7.
  - Tool results never go to the LLM.
  - The answer text is built by the web.
- **Copy:** exactly as in C10. At most 8 lines per message. Activity labels come from `ACTIVITY_LABEL` (`apps/web/src/application/agent/actions/journal-labels.ts`).
- **Unchanged behaviour:**
  - M2: linking, `/stop`, v1 approve and reject buttons, reject reason, group reports.
  - A1 to A6.
- **New SQL** goes in both places:
  - the init file `platform/postgres/init/09-telegram.sql`, written to be idempotent;
  - a Prisma migration added with `git add -f` (the `*.sql` ignore rule).

  Every new or changed repository method is run once against a throwaway Postgres (M4 lesson 3).

## Review Focus

1. **Old or forged buttons.**
   - Cases: a button from an earlier step, a button pressed by another Telegram user, or edited v2 data.
   - Expected: nothing is done, and the answer is `staleButton`.
   - Test: W1 Task W1-2, `callback v2 refuses an old step token, another presser and a changed signature`.
2. **Role lost between card and Confirm.**
   - Cases: the user is disabled, demoted or moved to another cooperative after the card is sent.
   - Expected: Confirm runs nothing and answers `noPermission`.
   - Test: W1-4, `confirm re-reads the live role and refuses a demoted user`.
3. **A farmer only sees their own household (test 12).**
   - Covers the tools `journal`, `parcels`, `harvest_schedule`, `today` and `nearby` for a farmer.
   - Test: W2-1, `farmer tools are scoped to the household`, with two households and an LB row.
4. **Photo edge cases.**
   - Cases: too large, a download that failed, a photo outside a flow, a photo when the step expects text, text when the step expects a photo.
   - Expected: a clear reply, no crash, nothing written.
   - Tests: W1-3 `photo outside a flow`, `wrong input kind`; I-1 relay `oversized photo is forwarded as photo_error`.
5. **Agent down, slow or wrong.**
   - Cases: the request is not answered within 60 s, or A7 names an unknown tool, an action outside the user's role, or unknown arguments.
   - Expected: the timeout reply with the menu, or `noPermission` with no card; unknown arguments are dropped.
   - Tests: W1-5 `expired request gets the timeout reply`, `out-of-role action intent gets no card`; A-2 scenario `name outside the list becomes unknown`.

---

## Contracts

### C1. Update fields from the relay (relay → web)

`POST /api/internal/telegram/updates`: `message` keeps `message_id`, `chat`, `from` and `text`, and gains:

| Field | When | Shape |
|---|---|---|
| `caption` | photo with a caption | string, also used as the message text by the router |
| `photo` | `message.photo` present and downloaded | `{ "mime_type": "image/jpeg", "data_base64": "<bytes>", "file_unique_id": "<id>" }` |
| `photo_error` | photo present but not forwarded | `"too_large"` (over 5 MB, `5 * 1024 * 1024` bytes) or `"download_failed"` |
| `location` | `message.location` present | `{ "latitude": number, "longitude": number }` |

How the relay gets the photo:
- It picks the largest size in `message.photo` whose `file_size` is at most 5 MB.
- It calls `getFile`, then `GET <api_base>/file/bot<token>/<file_path>`.
- It forwards no other message fields.

### C2. Replies (web → relay)

`OutboxReply` in `TelegramUpdateHandler.ts` becomes:
- `{ op: 'send', chat_id, text, buttons? }`, or
- `{ op: 'edit', chat_id, edit_message_id, text, buttons? }`.

`buttons` is `{ text: string; callback_data: string }[][]`. The relay already sends these (`message_call`); an edit always sends its keyboard, so an edit without buttons removes them. Outbox items keep the M2 shape.

### C3. Callback data v2

The format is `v2|<c>|<s>|<sig>`:
- `c` is `menu`, or the 11-character base64url token of the current step (8 random bytes, stored in `telegram_conversations.token`);
- `s` matches `^[A-Za-z0-9_.-]{1,16}$`;
- `sig` is the first 12 bytes of HMAC-SHA256 with the callback key over `v2|<c>|<s>`, in base64url (16 characters).

Rules:
- The total is at most 48 bytes.
- `signCallbackDataV2(key, c, s)` and `verifyCallbackDataV2(key, data): { c: string; s: string } | null` go in `apps/web/src/domain/telegram/callback-data.ts`. The v1 functions do not change.
- The token rotates on every step. A v2 press is accepted only when the presser's conversation row has that token and has not expired; otherwise the answer is `staleButton`.
- Choice values:
  - menu: `today`, `pending`, `journal`, `disease`, `ask`;
  - choice steps: `o<index>` into the choices saved in the state;
  - photo skip: `skip`;
  - cards: `ok`, `cancel`, `next` (first card of a high action), `final`.

### C4. Tables (SQL in `09-telegram.sql` and migration `20261126120000_telegram_assistant`)

`platform.telegram_conversations`:
- `kind` CHECK becomes `('reject_reason', 'flow')`;
- `proposal_id` becomes nullable, with CHECK `(kind = 'reject_reason') = (proposal_id IS NOT NULL)`;
- new columns:
  - `flow text NULL` (an action name, or `ask`);
  - `step integer NULL` (index into the action's steps, `-1` = first card, `-2` = second card);
  - `state jsonb NOT NULL DEFAULT '{}'`;
  - `token text NULL`;
  - `card_message_id bigint NULL`.
- Expiry:
  - a flow is 30 minutes after its last step;
  - a card is 10 minutes after it is sent;
  - the second card is 10 minutes after Continue.

`platform.telegram_updates_seen` gains `telegram_user_id bigint NULL` and an index on `(telegram_user_id, seen_at)`. `markUpdateSeen(updateId, telegramUserId)` stores it.

New table `platform.assistant_requests`:

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
htx_code text NOT NULL,
telegram_user_id bigint NOT NULL,
chat_id bigint NOT NULL,
user_id text NOT NULL,
role text NOT NULL CHECK (role IN ('farmer','officer','manager')),
text text NOT NULL CHECK (char_length(text) <= 1000),
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','done','failed','expired')),
created_at timestamptz NOT NULL DEFAULT now(),
claimed_at timestamptz NULL,
finished_at timestamptz NULL,
run_id uuid NULL
-- index (htx_code, status, created_at)
```

When a request is done, failed or expired, `text` is set to `''`. The row stays for counts only.

### C5. Read tools (`CHAT_TOOLS` in `apps/web/src/application/telegram/chat/tools/index.ts`)

The shape is `ChatTool` from `chat/types.ts`, committed with this plan.

Each tool calls what the listed GET route calls, with the same role check and the same tenant scoping. A farmer is scoped to `householdId`, an officer or manager to the cooperative. Answers are at most 7 lines; an empty result is the single line `Chưa có dữ liệu.`.

| `name` | `titleVi` | Roles | Routes | Source |
|---|---|---|---|---|
| `today` | Hôm nay | all | `GET /api/weather`, `GET /api/journal`, `GET /api/schedule/harvest` | Tổng quan |
| `pending` | Việc cần duyệt | officer, manager | `GET /api/agent/proposals` | Đề xuất AI |
| `weather` | Thời tiết | all | `GET /api/weather`, `GET /api/weather/forecast` | Thời tiết |
| `market` | Giá thị trường | all | `GET /api/market-data`, `GET /api/market-data/fx` | Giá thị trường |
| `bulletin` | Bản tin | all | `GET /api/bulletin` | Bản tin |
| `notifications` | Thông báo | all | `GET /api/notifications` | Thông báo |
| `journal` | Nhật ký | all | `GET /api/journal` | Nhật ký |
| `harvest_schedule` | Lịch thu hái | all | `GET /api/schedule/harvest` | Lịch thu hái |
| `parcels` | Vùng trồng | all | `GET /api/farm/parcels` | Vùng trồng |
| `lots` | Lô hàng | the roles of `GET /api/lots` | `GET /api/lots` | Lô hàng |
| `nearby` | Thửa gần đây | all | `GET /api/farm/parcels`, `GET /api/weather` | Vùng trồng |

Tool details:
- `today`:
  - farmer: today's weather, their entries returned for changes or pending, their next harvest date;
  - officer and manager: today's weather, pending journal count, open proposal count.
- `pending`: lists at most 5 open proposals the user may approve, and returns their ids in `proposalIds`.
- `nearby`:
  - args `latitude` and `longitude`;
  - answers with the nearest parcel that has a centroid among the parcels the user may see: its code, the distance in km with one decimal, and the weather there;
  - with no parcel that has a centroid, the answer is `locationNoParcel`.

### C6. Actions (`CHAT_ACTIONS` in `apps/web/src/application/telegram/chat/actions/index.ts`)

The shape is `ChatAction` from `chat/types.ts`. `execute` calls the same use case as the route, with the same checks.

**`journal.create`** (titleVi `Ghi nhật ký`)
- Risk `medium`; roles farmer, officer; routes `POST /api/journal`, `POST /api/journal/upload`.
- Steps:
  1. `parcel_id`: choice of the parcels the user may write for, labels = parcel codes. Prompt `Chọn thửa:`, or `Nhập mã thửa, ví dụ TC-A1:` when there are more than 8.
  2. `activity_type`: choice of `ACTIVITY_LABEL` in the order SPRAYING, FERTILIZING, IRRIGATION, HARVEST, SOWING, OTHER. Prompt `Chọn hoạt động:`.
  3. `product_name`: text, maximum 200; only when the activity is SPRAYING or FERTILIZING. Prompt `Tên thuốc hoặc phân bón:`.
  4. `dosage`: text, maximum 100; same condition. Prompt `Liều lượng, ví dụ 20 ml cho bình 16 lít:`.
  5. `withdrawal_days`: integer 0 to 365; only for SPRAYING. Prompt `Số ngày cách ly ghi trên bao bì (0 đến 365):`.
  6. `photo_key`: optional photo with key `${journalPhotoRoot(htxCode)}${yyyy}/${uuid}-telegram.jpg` (it must pass `assertJournalPhotoKey`). Prompt `Gửi một ảnh minh chứng, hoặc bấm Bỏ qua.`.
- Card lines:
  - `Thửa: <code>`;
  - `Ngày: <dd/MM/yyyy>` (today in Vietnam);
  - `Hoạt động: <label>`;
  - `Thuốc/phân: …`, `Liều: …`, `Cách ly: <n> ngày` when set;
  - `Ảnh: có` or `Ảnh: không`.
- Execute: `CreateJournalEntryUseCase` with entry date today and one activity. Result: `Đã ghi nhật ký. Nhật ký đang chờ duyệt.`.

**`disease.report`** (titleVi `Gửi ảnh bệnh`)
- Risk `low`; role farmer; route `POST /api/diagnosis`.
- Steps:
  1. `parcel_id`: as above.
  2. `photo_key`: required photo with key `telegram/<htxCode>/<yyyy>/<uuid>.jpg`. Prompt `Gửi ảnh lá chè bị bệnh, chụp rõ một lá.`.
- Card lines: `Thửa: <code>`, `Ảnh: có`.
- Execute: `deps.photos.get(photo_key)`, then `SubmitDiagnosisUseCase` as the route does.
- Result:
  - `Đã gửi ảnh. AI nhận định: <disease name> (<percent>%). Cán bộ sẽ xem lại.`;
  - `Đã gửi ảnh. Cán bộ sẽ xem lại.` when the AI gave no result.

**`journal.batch_approve`** (titleVi `Duyệt nhật ký đang chờ`)
- Risk `medium`; roles officer, manager; route `POST /api/journal/batch-approve`.
- `start`: loads up to 50 pending entries of the cooperative, oldest first, into `entry_ids`. With none, it replies `Không có nhật ký nào đang chờ duyệt.`.
- No steps.
- Card lines:
  - `Số nhật ký: <n>`;
  - up to 5 lines `• <code> · <activity label> · <dd/MM>`;
  - then `… và <n-5> nhật ký khác` when there are more than 5.
- Execute: the batch-approve use case. Result: `Đã duyệt <n> nhật ký.`.

**`harvest.approve`** (titleVi `Duyệt thu hoạch`)
- Risk `high`; role manager; route `POST /api/parcels/[id]/approve-harvest`.
- Step `parcel_id`: choice of the cooperative's parcels in `TENDING`. Prompt `Chọn thửa cần duyệt thu hoạch:`, or the typed-code prompt when there are more than 8.
- Card line: `Thửa: <code>`.
- `consequenceVi`: `Thửa <code> sẽ được phép thu hái. Hệ thống kiểm tra lại thời gian cách ly trước khi duyệt.`.
- Execute: `ApproveHarvestUseCase`. Result: `Đã duyệt thu hoạch thửa <code>.`.

Intent arguments (`args`) use the slot names. A7 gives the parcel as its code, and the engine matches it against the choice labels. A value that does not match, is too long or is out of range is dropped and asked for.

### C7. Intent and assistant routes (web ↔ agent)

**Intent** (`Intent` in `chat/types.ts`), as JSON:
- `{"type": "tool", "name": "<tool>", "args": {}}`
- `{"type": "action", "name": "<action>", "args": {"<slot>": value}}`
- `{"type": "unknown"}`

**`POST /api/internal/agent/assistant/claim`**
- Agent token; the cooperative comes from the token.
- Body `{ "limit": 1..5 }`, default 3.
- Claims the oldest `pending` requests of the cooperative (`FOR UPDATE SKIP LOCKED`) and sets `claimed` and `claimed_at`.
- Answers:

  ```json
  {"requests": [{
    "id": "...", "text": "...", "role": "farmer", "today": "2026-11-26",
    "tools":   [{"name": "...", "title_vi": "...", "args": [ArgHint]}],
    "actions": [{"name": "...", "title_vi": "...", "args": [ArgHint]}]
  }]}
  ```

  `tools` and `actions` are the full lists, not only the role's, so an out-of-role request is recognised and refused by the web (test 10).

**`POST /api/internal/agent/assistant/requests/{id}/result`**
- Body `{ "intent": Intent, "run_id": uuid | null }`.
- Answers:
  - 200 `{ "ok": true }` for a `claimed` request of the token's cooperative;
  - 404 for another cooperative or an unknown id;
  - 409 when the request is not `claimed`.
- The web validates the intent with zod. A bad intent counts as `unknown`.

**Expiry:** the outbox lease (`GET /api/internal/telegram/outbox`) first marks `pending` or `claimed` requests older than 60 s as `expired`, and queues `assistantTimeout` with the menu buttons to their chat.

**Agent run:** each claimed request is one run with `agent: 'assistant'` and `trigger: 'message'`. `KNOWN_AGENTS` gains `'assistant'`, and the runs route trigger enum gains `'message'`.

### C8. Router (web, `apps/web/src/application/telegram/chat/router.ts`)

**Normalisation:**
- lower case;
- NFD with the combining marks removed, and `đ` → `d`;
- every non-letter or non-digit becomes a space;
- spaces collapsed, then padded with one space on each side.

A phrase matches when ` <phrase> ` is a substring. The longest matching phrase wins; on a tie, the first row wins.

| Phrases | Target |
|---|---|
| `ghi nhat ky` | action `journal.create` |
| `bao benh` | action `disease.report` |
| `duyet thu hoach` | action `harvest.approve` |
| `duyet het`, `duyet tat ca`, `duyet nhat ky` | action `journal.batch_approve` |
| `can duyet`, `cho duyet` | tool `pending` |
| `thoi tiet`, `du bao` | tool `weather` |
| `gia che`, `gia thi truong`, `ty gia` | tool `market` |
| `ban tin` | tool `bulletin` |
| `thong bao` | tool `notifications` |
| `lich hai`, `lich thu hoach` | tool `harvest_schedule` |
| `thua cua toi`, `danh sach thua`, `vung trong` | tool `parcels` |
| `lo hang` | tool `lots` |
| `hom nay`, `tom tat` | tool `today` |
| `nhat ky` | tool `journal` |

**Commands** (private chat, also with `@<bot>` suffix):

| Command | Effect |
|---|---|
| `/menu`, or `/start` with no code when linked | menu |
| `/huy` | cancels a reject reason (M2) or a flow; with neither, `nothingToCancel` |
| `/tomtat` | tool `today` |
| `/cho` | tool `pending` |
| `/nhatky` | action `journal.create` |
| `/benh` | action `disease.report` |
| `/hoi` | `askPrompt` and a conversation `flow = 'ask'` whose next text goes straight to A7 |
| `/chiendich`, `/tuvanhanh`, `/dung` | `notYet` |

**Order for a private text message from a linked user:**
1. M2 `/start`, `/stop`.
2. Rate limit (C9).
3. `/huy`.
4. The reject reason (M2).
5. The active flow step.
6. Other commands.
7. The router.
8. The assistant request.

A user who is not linked keeps the M2 replies.

**Menu buttons by role, two per row:**
- farmer: Hôm nay, Ghi nhật ký, Báo bệnh, Hỏi;
- officer: Hôm nay, Việc cần duyệt, Ghi nhật ký, Hỏi;
- manager: Hôm nay, Việc cần duyệt, Hỏi.

### C9. Limits

- 60 private messages and button presses per Telegram user per rolling hour, counted from `telegram_updates_seen`.
  - The 61st gets `rateLimited` once.
  - Later ones in the same hour get no reply.
- Assistant requests are sent only when the cooperative has an `agent:<HTX>` heartbeat in the last 10 minutes. Otherwise the reply is `notUnderstood` with the menu.
- Text kept in a flow state or a request is at most 1000 characters.
- A photo is at most 5 MB.
- Per-user flow: one at a time. Starting a new flow or opening the menu replaces the old one.

### C10. Copy (`apps/web/src/application/telegram/messages.ts`, `TELEGRAM_TEXT`)

| Key | Text |
|---|---|
| `welcome(name)` (changed) | `Đã kết nối tài khoản ${name}. Tin nhắn từ hệ thống sẽ được gửi qua máy chủ của Telegram. Nếu HTX bật nhà cung cấp AI bên ngoài cho trợ lý, câu bạn nhắn cũng được gửi tới nhà cung cấp đó. Gửi /menu để bắt đầu.` |
| `menuPrompt` | `Bạn cần gì? Chọn một mục bên dưới, hoặc nhắn câu hỏi bằng tiếng Việt.` |
| `askPrompt` | `Bạn muốn hỏi gì? Ví dụ: Giá chè hôm nay thế nào?` |
| `thinking` | `Đang tìm câu trả lời…` |
| `assistantTimeout` | `Chưa trả lời kịp. Bạn chọn một mục trong menu nhé.` |
| `notUnderstood` | `Chưa hiểu câu này. Bạn chọn một mục trong menu, hoặc nhắn lại ngắn hơn.` |
| `noPermission(title)` | `Tài khoản của bạn không có quyền: ${title}.` |
| `notYet` | `Việc này chưa làm được qua Telegram. Bạn dùng trang web nhé.` |
| `flowCancelled` | `Đã huỷ. Không có gì được ghi.` |
| `nothingToCancel` | `Không có việc nào đang làm dở.` |
| `flowExpired` | `Phiên nhập đã hết hạn. Gửi /menu để bắt đầu lại.` |
| `staleButton` | `Nút này đã cũ. Gửi /menu để bắt đầu lại.` |
| `cardFooter` | `Thẻ hết hạn sau 10 phút. Không bấm Xác nhận thì không có gì được ghi.` |
| `secondCardTitle` | `Xác nhận lần cuối` |
| `secondCardFooter` | `Nút hết hạn sau 10 phút.` |
| `cardExpired` | `Thẻ đã hết hạn. Không có gì được thực hiện.` |
| `expectChoice` | `Bạn chọn một nút bên trên nhé.` |
| `expectText` | `Bước này cần nhắn chữ.` |
| `expectPhoto` | `Bước này cần một ảnh.` |
| `invalidNumber(min, max)` | `Nhập một số nguyên từ ${min} đến ${max}.` |
| `tooLong(max)` | `Tối đa ${max} ký tự.` |
| `noMatch` | `Không có trong danh sách. Bạn nhập lại nhé.` |
| `photoTooLarge` | `Ảnh lớn hơn 5 MB. Bạn gửi ảnh nhỏ hơn nhé.` |
| `photoFailed` | `Chưa nhận được ảnh. Bạn gửi lại nhé.` |
| `photoOutsideFlow` | `Đã nhận ảnh. Muốn ghi nhật ký hoặc báo bệnh, bạn chọn trong menu rồi gửi lại ảnh.` |
| `locationNoParcel` | `Không tìm thấy thửa nào có toạ độ.` |
| `rateLimited` | `Bạn đã gửi 60 tin trong một giờ. Vui lòng thử lại sau.` |
| `executeFailed(message)` | `Chưa thực hiện được: ${message}` |

**Button labels:**
- menu: `Hôm nay`, `Việc cần duyệt`, `Ghi nhật ký`, `Báo bệnh`, `Hỏi`;
- `Xác nhận`, `Huỷ`, `Tiếp tục`, `Xác nhận lần cuối`, `Bỏ qua`.

**Card text:**
- First card: the title (`titleVi`), the preview lines, then `cardFooter`.
- Second card: `secondCardTitle`, `consequenceVi`, then `secondCardFooter`.
- After Confirm, Cancel or expiry, the card is edited in place to its result, `flowCancelled` or `cardExpired`, with no buttons.

### C11. Coverage table (`apps/web/src/application/telegram/coverage.ts`, test 17)

`TELEGRAM_COVERAGE` has four groups: `chatRead`, `chatConfirm`, `miniApp` and `none`. Each is a `readonly string[]` of rows `METHOD /api/<path>`, with dynamic segments written as in the folder name (`[id]`).

- Every route file under `apps/web/src/app/api` except `/api/internal/**` gets its exported HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) listed exactly once.
- Classification follows spec §13.7. Routes added since:
  - `GET /api/agent/proposals` goes to `chatRead` (tool `pending`);
  - the rest of `/api/agent/**` (decisions and AI settings) goes to `miniApp`. Approving in chat keeps the M2 buttons;
  - Telegram link management (`/api/telegram/**`) goes to `none`.
- Every `CHAT_TOOLS[].routes` row is in `chatRead`, and every `CHAT_ACTIONS[].routes` row is in `chatConfirm`.

---

## Tracks

Four parallel Codex sessions start from the commit of this plan. Each works in its own worktree and branch, then they merge into `feat/55-agentic-m5`.

- Keep to your files.
- Follow C1–C11 exactly: names, routes, copy, limits.
- If a contract cannot work as written, build the closest version and say exactly what differs in the report.
- Three files are committed with this plan:
  - `apps/web/src/application/telegram/chat/types.ts`: do not edit it; ask for a change in the report instead;
  - `chat/tools/index.ts` and `chat/actions/index.ts`: empty `CHAT_TOOLS` and `CHAT_ACTIONS` lists. W2 fills them; W1 imports them and never edits them.

| Track | Branch | Owns |
|---|---|---|
| W1 engine | `feat/55-agentic-m5-engine` | `apps/web/src/application/telegram/**` except `chat/tools/**`, `chat/actions/**` and `coverage.ts`; `apps/web/src/domain/telegram/**`; `apps/web/src/infrastructure/db/telegram/**`; `apps/web/src/infrastructure/storage/**` (photo store); `apps/web/src/app/api/internal/telegram/**`; `apps/web/src/app/api/internal/agent/assistant/**`; the migration; `platform/postgres/init/09-telegram.sql`; `docs/api-contract.md`; `docs/database-schema.md` |
| W2 tools | `feat/55-agentic-m5-tools` | `apps/web/src/application/telegram/chat/tools/**`, `chat/actions/**`, `coverage.ts`; `apps/web/src/domain/agent/settings.ts`, `apps/web/src/domain/agent/proposal.ts` (`KNOWN_AGENTS`); `apps/web/src/app/api/internal/agent/runs/route.ts` (trigger); `apps/web/src/components/features/agent/AgentSettingsPanel.tsx` |
| A agent | `feat/55-agentic-m5-agent` | `platform/agent/**` |
| I relay, smoke, docs | `feat/55-agentic-m5-infra` | `platform/telegram/**`, `platform/tests/**` except `platform/agent/tests`, `docs/rules-and-limits.md`, `README.md` |

Shared tests live with their owner: web tests under `apps/web/src/__tests__/` in a folder named after the owned path.

### Track W1 — conversation engine

**W1-1: tables and repository**
- Files: `platform/postgres/init/09-telegram.sql`, `apps/web/prisma/migrations/20261126120000_telegram_assistant/migration.sql`, `apps/web/src/domain/telegram/ports/TelegramRepository.ts`, `apps/web/src/infrastructure/db/telegram/PrismaTelegramRepository.ts`, new `PrismaAssistantRequestRepository.ts` and its port `apps/web/src/domain/telegram/ports/AssistantRequestRepository.ts`.
- Interfaces:
  - `setFlow(row: FlowRow)`, `activeConversation(telegramUserId, now)` (now returning both kinds), `deleteConversation`;
  - `markUpdateSeen(updateId, telegramUserId)`, `countRecentUpdates(telegramUserId, since): Promise<number>`;
  - `AssistantRequestRepository`: `create`, `claim(htxCode, limit, now)`, `finish(id, htxCode, status, runId)`, `expireOlderThan(cutoff): Promise<ExpiredRequest[]>`.
- [ ] Write repository tests (mocked Prisma, the M2 pattern) for every new method, including the CHECK `(kind = 'reject_reason') = (proposal_id IS NOT NULL)`.
- [ ] Implement the SQL (idempotent: `ADD COLUMN IF NOT EXISTS`, drop and recreate the named CHECK) and the methods. Constant SQL fragments use `Prisma.raw`.
- [ ] Throwaway Postgres: init files, `prisma migrate deploy`, init again. Run every method once with a scratch Jest config. Report the commands and the output.
- [ ] Commit.

**W1-2: callback data v2**
- Files: `apps/web/src/domain/telegram/callback-data.ts` and its test.
- [ ] Tests:
  - `signCallbackDataV2` output is at most 48 bytes and verifies;
  - a changed `c`, `s` or `sig` returns null;
  - v1 data is not accepted as v2, and v2 data is not accepted as v1;
  - `s` outside the pattern throws when signing.
- [ ] Implement as C3. Commit.

**W1-3: engine, menu, commands, flows, photos, location**
- Files: `apps/web/src/application/telegram/chat/ChatEngine.ts`, `chat/router.ts`, `chat/normalize.ts`, `TelegramUpdateHandler.ts`, `messages.ts`, `telegram-services.ts` (wiring), `apps/web/src/infrastructure/storage/telegram-photo-store.ts` (`PhotoStore` over the existing MinIO document adapter: `uploadDocument` to put, a read method to get).
- Interfaces:
  - `ChatEngine.onText(user, text, now)`, `onPhoto(user, photo, now)`, `onLocation(user, lat, lng, now)`, `onCallback(user, c, s, messageId, now)` → `UpdateResponse`;
  - `applyIntent(user, intent, now)`, used by W1-5.
  - `ChatUser` is built in the handler from the link, `LiveRoleReader`, `roleFromRealmRoles`, `htxProfileId` and, for farmers, the household use case the journal route uses.
- [ ] Tests, with fakes for tools and actions:
  - `/menu` shows the role's buttons;
  - router table cases, including `duyệt hết nhật ký` → `journal.batch_approve` and `xem nhật ký` → `journal`;
  - a choice step with more than 8 choices takes a typed code;
  - an optional photo step shows `Bỏ qua`;
  - `wrong input kind` covers text at a photo step and a photo at a text step;
  - `photo outside a flow` → `photoOutsideFlow`;
  - `photo_error` → `photoTooLarge` or `photoFailed`;
  - a flow idle for 30 minutes → `flowExpired`;
  - `/huy` in a flow → `flowCancelled`, and the M2 reject reason still works;
  - location → tool `nearby`;
  - rate limit: the 61st update gets `rateLimited` once and the 62nd gets nothing;
  - unlinked users and group chats get exactly the M2 replies.
- [ ] Implement. Tools that the user's role does not have answer `noPermission(titleVi)`. Commit.

**W1-4: cards, two steps, confirm**
- [ ] Tests:
  - card text and buttons for medium and high;
  - Cancel edits the card to `flowCancelled` and executes nothing (test 11);
  - Confirm after 10 minutes → `cardExpired`, nothing executed;
  - high: `next` sends the second card, and `final` after 10 minutes → `cardExpired` (test 36). `final` on a first card's token is refused;
  - `confirm re-reads the live role and refuses a demoted user`;
  - a `DomainError` from `execute` → `executeFailed`;
  - success edits the card to the result line and writes one audit event `telegram.action.executed` with `{kind, htx_code, actor, channel: 'telegram'}` through the audit writer the proposal decisions use.
- [ ] Implement. Commit.

**W1-5: assistant requests**
- Files: `apps/web/src/application/telegram/assistant/AssistantRequests.ts`, `apps/web/src/app/api/internal/agent/assistant/claim/route.ts`, `.../assistant/requests/[id]/result/route.ts`, the outbox lease route (expiry hook).
- [ ] Tests:
  - an unmatched text with a recent agent heartbeat creates a request and replies `thinking`; with no heartbeat, `notUnderstood` with the menu;
  - the claim answers the C7 shape with every tool and action and claims only the token's cooperative;
  - a result for another cooperative → 404, and a second result → 409;
  - intent `tool` runs the tool as the user;
  - intent `action` starts the flow with valid arguments prefilled;
  - `out-of-role action intent gets no card` → `noPermission`;
  - an unknown name or bad shape → `notUnderstood`;
  - `expired request gets the timeout reply`, and the text is blanked on finish and on expiry;
  - `/hoi` then a text that matches a router phrase still goes to A7.
- [ ] Implement. The agent route guard is the existing internal-agent one. Commit.

**W1-6: docs and checks**
- [ ] Add the update fields (C1), replies (C2), callback v2 (C3) and assistant routes (C7) to `docs/api-contract.md`, and the tables (C4) to `docs/database-schema.md`.
- [ ] Run the whole Jest suite, lint, `tsc --noEmit` and `prisma validate`. Report the counts before and after. Commit.

### Track W2 — tools, actions, coverage, settings

**W2-1: read tools**
- Files: `apps/web/src/application/telegram/chat/tools/*.ts`, `index.ts` exporting `CHAT_TOOLS: readonly ChatTool[]` in C5 order.
- [ ] Tests per tool:
  - roles equal the C5 table;
  - the empty result is `Chưa có dữ liệu.`;
  - at most 7 lines;
  - `farmer tools are scoped to the household`: the use case is called with the farmer's household, and the answer has no row of another household or of LB;
  - `nearby` picks the nearest parcel with a centroid and formats the distance with one decimal;
  - `pending` returns at most 5 `proposalIds`, only for kinds whose `approverRoles` include the user's role.
- [ ] Implement by calling the same use cases and repositories as the routes. Any new repository method gets a throwaway Postgres check. Commit.

**W2-2: actions**
- Files: `chat/actions/*.ts`, `index.ts` exporting `CHAT_ACTIONS` in C6 order.
- [ ] Tests:
  - steps, prompts and card lines as C6;
  - `journal.create` steps skip product, dosage and withdrawal for IRRIGATION;
  - the photo key passes `assertJournalPhotoKey`;
  - `execute` calls `CreateJournalEntryUseCase` with submitted role, household and photo key;
  - `disease.report` reads the photo and calls `SubmitDiagnosisUseCase`;
  - `journal.batch_approve.start` with no pending entries replies `Không có nhật ký nào đang chờ duyệt.`, and with 7 shows 5 lines and `… và 2 nhật ký khác`;
  - `harvest.approve` is `high` with `consequenceVi` set;
  - every `high` action has `consequenceVi`, and no other action does.
- [ ] Implement. Commit.

**W2-3: coverage table and test 17**
- Files: `apps/web/src/application/telegram/coverage.ts`, `apps/web/src/__tests__/application/telegram/coverage.test.ts`.
- [ ] Test 17 walks `src/app/api/**/route.ts` (excluding `internal`), reads the exported HTTP methods, and asserts:
  - the set equals the union of the four groups;
  - no row is listed twice;
  - every tool and action route is in its group (C11).
- [ ] Fill the table from spec §13.7 plus the routes added since. Commit.

**W2-4: the assistant as a configurable agent**
- [ ] Tests:
  - `CONFIGURABLE_AGENTS` gains `'assistant'`, labelled `Trợ lý Telegram (A7)`;
  - the share text is `Câu bạn nhắn cho trợ lý (đã che số điện thoại, e-mail và số giấy tờ). Không gửi ảnh, vị trí hay dữ liệu trả lời.`;
  - `KNOWN_AGENTS` gains `'assistant'`;
  - the runs route accepts `trigger: 'message'`;
  - the settings panel shows the new row at 390 px width with no horizontal overflow (existing panel test pattern).
- [ ] Implement. Run the whole Jest suite, lint, `tsc --noEmit`. Report counts. Commit.

### Track A — agent A7

**A-1: gateway calls**
- [ ] Tests in `platform/agent/tests/test_client.py`: `claim_assistant_requests(limit)` posts to `/api/internal/agent/assistant/claim`, and `post_assistant_result(request_id, intent, run_id)` posts to the result route. A 409 is not raised as a failure of the loop.
- [ ] Implement in `client.py`. Commit.

**A-2: intent agent**
- Files: `platform/agent/dxos_agent/agents/assistant.py`, `platform/agent/tests/test_assistant.py`, `platform/agent/tests/scenarios/a7_assistant.json`.
- Interface: `run_assistant_once(gateway, providers, settings, now) -> int` (requests handled).
- Schema: `{"type": enum tool|action|unknown, "name": string, "args": object}`. After the LLM:
  - a `name` not in the request's lists → `unknown`;
  - `args` keys not in that entry's hints are dropped;
  - a provider or schema error → `unknown`, and the run is finished `failed` with the error.
- Prompt (system, Vietnamese): choose exactly one tool or action from the lists for the user's sentence, or `unknown`. Do not answer the question, do not invent names, and give the parcel as its code.
- [ ] Scenarios with the replay provider, at least:
  - a weather question → tool `weather`;
  - `ghi nhật ký phun Regent 800WG thửa TC-A1` → action `journal.create` with `parcel_id`, `activity_type` and `product_name`;
  - `duyệt hết nhật ký` from a farmer → action `journal.batch_approve` (the web refuses it);
  - gibberish → `unknown`;
  - `name outside the list becomes unknown`;
  - unknown arguments dropped;
  - provider error → `unknown`.
- [ ] Implement. Runs: `start_run(agent='assistant', trigger='message')` and `finish_run` with tokens and cost, like A1. Commit.

**A-3: loop**
- [ ] Tests:
  - a separate daemon thread polls every `ASSISTANT_POLL_SECONDS = 1.5` for every cooperative with credentials;
  - the provider chain comes from settings agent `'assistant'` (default `ollama`) through `_local_unless_busy`;
  - a failure for one cooperative does not stop the others;
  - the main loop and A1 to A6 are unchanged (existing tests stay green).
- [ ] Implement in `__main__.py`. The external provider timeout for this agent is 45 s, so a result lands before the web's 60 s expiry. Commit.

**A-4: checks**
- [ ] `PYTHONPATH=platform/agent pytest platform/agent/tests -W error`. Report the counts before and after. Commit.

### Track I — relay, smoke, docs

**I-1: relay forwards photos and locations**
- Files: `platform/telegram/dxos_telegram/relay.py`, `bot_api.py` (`download(file_path) -> bytes`, the token never in errors), `stub_bot_api.py` (`getFile`, `GET /file/bot<token>/<path>` serving a fixed small JPEG, and `/control/updates` taking a photo update), `platform/telegram/tests/*`.
- [ ] Tests:
  - photo → C1 `photo` with base64 bytes;
  - `oversized photo is forwarded as photo_error`, and a failed download gives `download_failed`;
  - caption and location are forwarded;
  - other fields are still dropped.
- [ ] Implement. Commit.

**I-2: LLM stub**
- [ ] `platform/tests/stub_llm.py` answers an intent when the system message asks for the `type`/`name`/`args` keys. Its rule: a sentence containing `mai` gives `{"type": "tool", "name": "weather", "args": {}}`, otherwise `{"type": "unknown"}`. Earlier answers do not change. Test in `platform/tests/test_stub_llm.py`. Commit.

**I-3: smoke `platform/tests/smoke-assistant.sh`**

Sourced by `smoke-agentic.sh` after `smoke-agents.sh`. It adds no PASS line to `make platform-smoke`.

- Setup:
  - stop `dxos-agent` before seeding (lesson of #79);
  - link `smoke_farmer_tc` (household `hh_tc_1`) and `smoke_manager_tc` through link codes, as `telegram_link_owner` does;
  - set the TC `assistant` provider to `anthropic` (the stub) and restart the agent with the stub env;
  - restore everything on exit.
- Assertions:
  - **Done-when:**
    - the farmer runs `/nhatky` → parcel button → `Phun thuốc` → product → dosage → `7` → a photo → `Xác nhận`;
    - one new `journal_entries` row for the farmer's parcel with `PENDING_APPROVAL`, `submitted_role = 'FARMER'`, and a `photo_minio_key` under the TC journal photo root;
    - the card is edited to `Đã ghi nhật ký. Nhật ký đang chờ duyệt.`.
  - **Test 11:** a second journal card cancelled gives no new row. A third card, with `expires_at` moved into the past, then confirmed, gives `Thẻ đã hết hạn. Không có gì được thực hiện.` and no new row.
  - **Test 10:** the farmer sends `duyệt hết nhật ký` and gets `Tài khoản của bạn không có quyền: Duyệt nhật ký đang chờ.`, with no `Xác nhận` button after it.
  - **Test 12:** the farmer sends `xem nhật ký`. The reply has the farmer's parcel code and neither the code of a seeded entry of another TC household nor an LB code.
  - **Test 36:**
    - the manager sends `duyệt thu hoạch`, chooses a seeded `TENDING` parcel and presses `Tiếp tục`;
    - the second card has `Xác nhận lần cuối`;
    - with its `expires_at` in the past, `Xác nhận lần cuối` gives `cardExpired` and the parcel status is unchanged.
  - **A7:** the farmer sends `mai có nên đi hái không`. A7, through the stub, returns `weather`, and the reply ends with `Nguồn: Thời tiết`.
- [ ] Check ordering and cleanup in `platform/tests/test_smoke_scripts.py`:
  - the agent stops before seeding;
  - the smoke is sourced after `smoke-agents.sh`;
  - it is not in `smoke-platform.sh`.
- [ ] Commit.

**I-4: docs and checks**
- [ ] `docs/rules-and-limits.md`: a new section on the Telegram assistant with C9 limits, card and two-step expiry, private chats only, and what the LLM sees.
- [ ] `README.md`: the menu, the commands and photo journaling in the Telegram part.
- [ ] Run `pytest platform/cli/tests platform/tests platform/telegram/tests -W error` and `bash -n` on changed scripts. Report counts. Commit.

## Integration (main session)

1. Merge W1, W2, A and I into `feat/55-agentic-m5`. Resolve the wiring in `telegram-services.ts` (W1 imports `CHAT_TOOLS` and `CHAT_ACTIONS`).
2. Cross-track check against a throwaway Postgres:
   - A7's scenario intents go through the real `applyIntent`;
   - a journal card confirms into a real `journal_entries` row.
3. Update the spec status line and add "Ghi chú sau phát hành" with the scope table above. Update the M5 row in issue #55.
4. Open the PR. CI green on the exact head (Platform Smoke runs the new smoke), no AI trailers. Merge with `--no-ff`. Release v1.15.0 with M4 and M5.
