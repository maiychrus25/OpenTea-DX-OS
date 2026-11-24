<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M2: Telegram base — implementation plan

**Goal:** people linked to Telegram receive the agent's proposals with Approve and Reject buttons, a daily and a weekly report, and system health alerts; approving from Telegram executes through the same web path as the inbox. Milestone M2 of issue #55.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` (Vietnamese, the authority): §5.1 and §5.2 (trust zones, identities), §7 (proposals, decisions), §13.1–§13.4 (Telegram connection, linking, reports, approvals), §14 (failure handling), §15 tests 4, 5, 6. Milestone row M2 in §17.

**Architecture:** `dxos-telegram` is a thin relay. It long-polls the Bot API, forwards every update to the web, sends what the web returns, and drains an outbox the web fills. All decisions live in the web: linking, role checks, callback signatures, reject reasons, message wording. The agent service only computes report numbers and posts them to the web, which renders them. n8n errors land in a table the web turns into health alerts.

## Global constraints

- Repository rules apply: `AGENTS.md`, English Conventional Commits, English identifiers, Vietnamese user-facing text with diacritics, SPDX headers on new files, no secrets or `.env*` files committed.
- No new runtime dependency in `platform/telegram` or `platform/agent`: Python standard library only, as today.
- Messages never contain personal data (spec §8.3): no household names, phone numbers or addresses; parcel codes, counts and dates only. At most about 8 lines per message.
- Telegram is optional: with no bot token configured, `dxos-telegram` idles with a heartbeat and the web works exactly as before.
- Decisions taken in Telegram go through `DecideProposalUseCase`, the same as the inbox; nothing executes in `dxos-telegram`.

## Review focus

1. A person who is no longer an approver (role removed, account disabled, moved cooperative, link removed) taps Approve in an old message: nothing executes (spec test 4).
2. Approve tapped in Telegram and on the web at the same moment: the action runs once; both messages end up showing who decided (spec test 5).
3. A forged or altered `callback_data`, a callback from a group chat, or one from a Telegram account linked to another cooperative: refused (spec test 6).
4. Telegram unreachable or rate limiting (429 with `retry_after`): the outbox keeps the message and retries with backoff; nothing is lost and nothing is sent twice after a lease expires.
5. Link codes: single use, expire after 10 minutes, stored only as a hash.

## Contracts (all tracks)

### C1. Identities and secrets

- Realm role `telegram`. Keycloak client `dxos-telegram` (confidential, service account with role `telegram`, scope `dx-os-core`).
- Keycloak client `dxos-web-roles` (confidential, service account with realm-management `view-users` only). The web uses it to read a user's current realm roles, enabled flag and `htx_code` attribute at decision time.
- `./dxos telegram enable` creates both clients and writes their credentials the same way `./dxos agent enable` does (stdin to a root helper, mode 600, owner 10001): `dxos-telegram-env` volume, file `telegram.env` (`DXOS_TELEGRAM_CLIENT_ID`, `DXOS_TELEGRAM_CLIENT_SECRET`), mounted read-only at `/run/dxos-telegram` in `dxos-telegram`; `dxos-web-env` volume, file `roles.env` (`DXOS_ROLES_CLIENT_ID`, `DXOS_ROLES_CLIENT_SECRET`), mounted read-only at `/run/dxos-web` in `web`. The web reads the file at request time (cache 60 s). `./dxos telegram disable` deletes both clients and files.
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`: environment of `dxos-telegram` (token) and `web` (username, to build `https://t.me/<bot>?start=<code>`), set by the operator in `docker/.env.local`; never stored in the database.
- `DXOS_TELEGRAM_CALLBACK_KEY`: environment of `web` only. Dev default allowed; the release override refuses it when missing or equal to the dev value, like `DXOS_INTERNAL_GATEWAY_SECRET`.
- `TELEGRAM_API_BASE`: environment of `dxos-telegram`, default `https://api.telegram.org`; the smoke test points it at a stub.

### C2. Internal API `/api/internal/telegram/*`

Through APISIX `:9081` like `/api/internal/agent/*`: token of client `dxos-telegram` with realm role `telegram`, gateway header, rate limit per token. The web verifier accepts this client only on these routes (and the agent clients only on theirs). Responses are `{ "data": … }` or `{ "error": { "code", "message" } }`.

- `POST /updates` — body: `{ "update_id", "message"?: { "message_id", "chat": { "id", "type" }, "from": { "id" }, "text"? }, "callback_query"?: { "id", "from": { "id" }, "message": { "message_id", "chat": { "id", "type" } }, "data" } }` (the relay strips every other field). Answer: `{ "data": { "replies": [OutboxMessage], "answer_callback"?: { "text", "show_alert" } } }`. The relay sends `answer_callback` first (if any), then the replies in order. Idempotent per `update_id`.
- `GET /outbox?limit=20` — leases up to `limit` due messages for 60 s and returns them: `{ "data": [ { "id", ...OutboxMessage } ] }`.
- `POST /outbox/{id}/result` — `{ "ok": true, "telegram_message_id" }` or `{ "ok": false, "error", "retry_after_seconds"?, "permanent"? }`.
- `POST /heartbeat` — `{ "version" }`.
- `OutboxMessage = { "op": "send" | "edit", "chat_id", "text", "buttons"?: [[ { "text", "callback_data" } | { "text", "url" } ]], "edit_message_id"? }`. Plain text (no `parse_mode`), at most 4096 characters.

### C3. `callback_data`

`v1|<proposal id as 22-char base64url>|<op>|<sig>`; `op` is `a` (approve) or `r` (reject, then ask for a reason); `sig` is the first 12 bytes of `HMAC-SHA256(DXOS_TELEGRAM_CALLBACK_KEY, "v1|<id>|<op>")` in base64url (16 characters). Total under 64 bytes. Room for later ops (`c`, `f` for two-step confirmation in M5).

### C4. Tables (schema `platform`, new init file `platform/postgres/init/09-telegram.sql`, idempotent; row audit on `telegram_links` and `system_alerts` only, see the note in the SQL)

- `telegram_links`: `id uuid`, `kind` (`user` | `group`), `user_id` (Keycloak sub; null for groups), `user_name`, `role` (at link time, used only to choose recipients), `htx_code`, `telegram_user_id bigint` (null for groups), `chat_id bigint`, `linked_at`, `unlinked_at`. One active link per Telegram account and per user.
- `telegram_link_codes`: `code_hash` (sha256 hex, primary key), `kind`, `user_id`, `user_name`, `role`, `htx_code`, `expires_at`, `used_at`.
- `telegram_outbox`: `id uuid`, `htx_code`, `chat_id`, `op`, `text`, `buttons jsonb`, `edit_message_id bigint`, `proposal_id uuid`, `purpose` (`proposal` | `result` | `report` | `health` | `reply`), `status` (`pending` | `leased` | `sent` | `failed`), `attempts`, `next_attempt_at`, `lease_until`, `telegram_message_id bigint`, `last_error`, `created_at`, `sent_at`.
- `telegram_conversations`: `telegram_user_id bigint` primary key, `kind` (`reject_reason`), `proposal_id`, `expires_at` (10 minutes).
- `telegram_updates_seen`: `update_id bigint` primary key, `seen_at` (rows older than 2 days may be deleted).
- `service_heartbeats`: `service` primary key, `last_seen_at`, `version`.
- `system_alerts`: `id uuid`, `source` (`n8n` | `agent` | `web`), `htx_code` (nullable), `title`, `detail`, `created_at`, `notified_at`.
- `agent_reports`: `htx_code`, `kind` (`daily` | `weekly`), `period_start date`, `created_at`; primary key `(htx_code, kind, period_start)`.

### C5. Reports from the agent

`POST /api/internal/agent/reports` (agent token): `{ "kind": "daily" | "weekly", "period_start": "YYYY-MM-DD", "period_end": "YYYY-MM-DD", "figures": { "journals_new", "journals_approved", "journals_pending", "proposals_open", "proposals_decided", "disease_reports", "sensor_alerts", "lots_created" } }` (integers; any figure the agent cannot compute is left out). The web renders the Vietnamese text and enqueues it once per `(htx, kind, period_start)` to linked managers, officers and the cooperative's group. `POST /api/internal/agent/heartbeat` (agent token) every 5 minutes.

## Tasks

Three tracks run in parallel from the same base; each owns its files.

### Track W — web (`apps/web/**`, `platform/postgres/init/09-telegram.sql`, `docs/api-contract.md`, `docs/database-schema.md`)

1. Tables of C4 (SQL file and Prisma models or raw SQL repository, following how `platform.agent_*` are accessed today).
2. Internal API of C2 and C5 with tests: verifier generalised per client kind; `/updates` handles `/start <code>` (link, welcome text that says messages go through Telegram's servers), `/stop` (unlink), `/nhom <code>` in a group (group link, reports only), callbacks (C3 signature, private chat only, active link, live roles from Keycloak through `dxos-web-roles`, cooperative match, then `DecideProposalUseCase` with channel `telegram`), and the reject reason conversation (ask with a force-reply; the next private text of that user within 10 minutes is the reason; `/huy` cancels).
3. Producers: proposal created → one `send` per linked approver of that cooperative (approver roles of the kind); decision or execution (from any channel) → `edit` of every message sent for that proposal ("Đã được <tên> duyệt lúc HH:mm, đã thực hiện", "Đã từ chối: <lý do>", "Thực hiện lỗi"); reports of C5 rendered and queued; health: on `GET /outbox`, at most once a minute, check stale heartbeats (agent 10 min, telegram 3 min), unnotified `system_alerts` and three failed agent runs in a row, and queue one health message per condition per 6 hours to managers.
4. Profile pages (manager, officer, farmer): "Kết nối Telegram" with the link (or a note that Telegram is not configured), linked state and "Gỡ liên kết". Manager also gets "Kết nối nhóm Telegram của HTX" (a group code to send as `/nhom <code>`). Inbox shows a small banner when the agent or Telegram heartbeat is stale.
5. Tests for the review focus 1–3 and 5 and for every route; docs.

### Track T — relay, identities, gateway, compose (`platform/telegram/**`, `platform/gateway/apisix.yaml`, `docker/**`, `dxos`, `docker/keycloak/realm-agrimarket.json`, `platform/tests/**` except agent unit tests, `.github/workflows/release.yml` notes, `README.md`)

1. `dxos-telegram`: long polling `getUpdates` (timeout 30 s, `allowed_updates` message and callback_query), forward each update stripped to C2's shape, send `answer_callback` and replies; outbox loop every 2 s; Telegram 429 honours `retry_after`; network errors back off; client-credentials token cached; heartbeat to the web every minute; no token → idle with a log line. Unit tests with a fake Bot API.
2. C1: realm role, `./dxos telegram enable|disable`, volumes and mounts, env variables, release refusals for `DXOS_TELEGRAM_CALLBACK_KEY`.
3. APISIX route `/api/internal/telegram/*` on 9081 (claim: role `telegram`, azp `dxos-telegram`), rate limit; user routes refuse the `telegram` role like they refuse `agent`.
4. A stub Bot API for tests (stdlib HTTP server, a compose service under a test profile): `getUpdates`, `sendMessage`, `editMessageText`, `answerCallbackQuery`, plus control endpoints to inject an update and list what was sent.
5. Smoke on the real stack (`platform/tests/smoke-telegram.sh`, sourced by the platform smoke): link with a code inserted as its hash, a proposal created through the agent API reaches the stub with signed buttons, the returned `callback_data` approves it and the stub receives the edit, a tampered `callback_data` and a group-chat callback are refused, an unlinked account is refused.
6. Mount `09-telegram.sql` like the others.

### Track G — agent reports and n8n (`platform/agent/**`, `workflows/**`)

1. A6 `digest` in `dxos-agent`: at the cooperative's report time (default 18:00 Vietnam time, `agent_settings` row for agent `digest`) and Monday 07:00, compute the C5 figures from Hasura (agent role, counts only) and post them; idempotent per period; heartbeat every 5 minutes. Tests with fixed clocks.
2. `workflows/system-error-alert.json` with id `system-error-alert`: an Error Trigger that inserts a row into `platform.system_alerts` (`source` `n8n`, title with the failed workflow's name, short detail, no secrets); set `settings.errorWorkflow` of the 12 existing workflows to `system-error-alert`. Check how the workflows are imported and keep that path working.

## Done when

- Every track's tests pass, the whole web suite, lint and type check are clean, and the platform smoke passes in CI including `smoke-telegram.sh`.
- With a real bot token, the owner links a phone, receives an A1 proposal with buttons, approves it, sees the message turn into "Đã được … duyệt", and receives the 18:00 summary. This needs the owner to create a bot with BotFather; the stub proves the same path in CI.
