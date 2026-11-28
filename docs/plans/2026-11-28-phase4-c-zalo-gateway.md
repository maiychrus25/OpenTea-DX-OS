<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# GĐ4-C Platform Zalo OA/ZNS Gateway — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Members who agreed to receive messages automatically get four kinds of Zalo ZNS messages:
- today's leaf price;
- a weighing receipt;
- "withdrawal ended";
- their settlement result.

Delivery goes through one platform OA. A stub makes every test run end to end without a commercial key.

**Architecture:**
- Mirror `dxos-telegram`. The web owns the outbox, recipients, consent, settings and templates.
- A stdlib Python relay `platform/zalo` leases outbox rows over an internal APISIX route and calls the ZNS API.
- A stub ZNS server records calls and injects failures for tests.
- Event hooks sit in the phase 1 use cases. A relay tick asks the web daily for the parcels whose withdrawal ended.

**Spec:** `docs/specs/2026-11-28-phase4-intelligence-pests-zalo-design.md` §5 and §7.8–§7.10.

## Global Constraints

- **Event kinds and dedupe keys.** The `event_id` per kind is:

  | Event kind | `event_id` |
  |---|---|
  | `PRICE_PUBLISHED` | `<htx>:<day>:<sha256(sorted grade:price)>` |
  | `TICKET_RECEIPT` | `<ticket_id>` |
  | `WITHDRAWAL_ENDED` | `<parcel_id>:<day>` |
  | `SETTLEMENT_CLOSED` | `<settlement_line_id>` |

  The outbox is unique on (`event_kind`, `event_id`, `phone`).
- **A row is written as `skipped` (with `last_error` naming the reason, and never sent) when:**
  - the cooperative's Zalo is off, or the kind is off;
  - the household has no OPTED_IN consent (the latest consent row wins);
  - there is no template mapping;
  - the monthly quota is reached.
- **Quiet hours** are 21:00–06:00 Vietnam time. `next_attempt_at` moves to 06:00. `PRICE_PUBLISHED` and `WITHDRAWAL_ENDED` may go from 05:00.
- **Templates:**
  - `zalo_templates(template_key PK, zns_template_id, params text[])`;
  - only these keys exist: `price_today`, `ticket_receipt`, `withdrawal_ended`, `settlement_closed`;
  - params never include a bank account, a pesticide name or a person's full name other than the household's own.
- **Relay:**
  - lease 20 rows every 2 s, with a 60 s lease;
  - result `{ ok: true, zalo_msg_id }` or `{ ok: false, error, permanent?, retry_after_seconds? }`;
  - at most 10 attempts, with backoff `min(5 × 2^(n−1), 900)` s;
  - permanent errors: invalid template, invalid phone or not a Zalo user, quota exceeded, consent revoked.
- **Auth:**
  - Keycloak client `dxos-zalo` with realm role `zalo`;
  - APISIX route `internal-zalo` on `/api/internal/zalo/*`, port 9081 only, with `azp == dxos-zalo`, role `zalo`, a limit of 120/60 s and `X-Dxos-Gateway`;
  - add `zalo` to the user routes' excluded service roles.
- **Compose:**
  - `dxos-zalo`: mem 128m, read_only, `cap_drop ALL`. Env: `ZALO_API_BASE`, `DXOS_GATEWAY_URL`, `KEYCLOAK_INTERNAL_URL`, and `DXOS_ZALO_ENV_DIR` with the volume `dxos-zalo-env`;
  - `dxos-zalo-env` under profile `tools`;
  - `dxos-zalo-stub` under profile `zalo-test` on `127.0.0.1:8084:8084` (8081 is the Telegram stub, 8082 the LLM stub, 8083 the STT stub).
- **OA tokens:** access and refresh tokens live only in the secret volume. `platform_admin` sets them through `/platform/zalo`; the web writes them to `platform.zalo_credentials`, encrypted with a key from env. The relay reads them through `GET /api/internal/zalo/credentials`. Never log tokens or phones beyond the last 3 digits.
- **Patterns to copy:**
  - relay: `platform/telegram/dxos_telegram/{relay.py,gateway.py,auth.py,stub_bot_api.py}`;
  - schema: `platform/postgres/init/09-telegram.sql`;
  - web notifier: `apps/web/src/application/telegram/TelegramNotifier.ts`;
  - internal routes: `apps/web/src/app/api/internal/telegram/outbox/*`;
  - CLI: the `./dxos` telegram enable flow;
  - tests: `platform/tests/{lib-telegram.sh,smoke-telegram.sh}`.
- Commits: identity maiychrus25 / ninhkhuongpl7@gmail.com, English Conventional Commits, no AI attribution. Before reporting run all suites, `platform/zalo` pytest and `platform/tests` pytest.

## Review Focus

1. Publishing the same prices twice in a day sends one message per member. Changing a price sends a second.
2. A household that opted out after an event was queued is not sent: the relay's lease checks consent again.
3. A ticket voided before its receipt is sent still sends nothing more. No correction message in v1; the receipt says "phiếu có thể bị huỷ nếu cân nhầm".
4. Quiet hours: a ticket weighed at 21:30 is delivered at 06:00, not at night.
5. A permanent ZNS error (not a Zalo user) is not retried, and the row shows the reason in Vietnamese on the manager's delivery page.

## Tracks

| Track | Worker | Tasks |
|---|---|---|
| C-core | Sonnet | C1 → C2 → C3 |
| C-relay | Sonnet | C4 → C5 |
| C-fe | Codex | F1 |

### Task C1: schema and the notifier

**Files:**
- `platform/postgres/init/10-zalo.sql`: `zalo_outbox`, `zalo_templates`, `zalo_settings`, `zalo_consents` (append-only with audit trigger), `zalo_credentials`, and indexes; plus the compose mount line;
- `apps/web/src/domain/zalo/*`: event kinds, the skip-reason enum, and pure functions for quiet hours and the price hash;
- `apps/web/src/application/zalo/ZaloNotifier.ts`: `enqueue(event)`, `recordResult`, `lease` with a consent re-check;
- `apps/web/src/infrastructure/db/zalo/PrismaZaloRepository.ts` (raw SQL on the `platform` schema, as the Telegram repository does);
- tests (unit and Postgres opt-in `ZALO_TEST_DATABASE_URL`).

Commit: `feat(zalo): outbox, consents, settings and templates for the platform Zalo channel`.

### Task C2: event hooks

**Files:**
- `PublishDailyPricesUseCase`: price event after a publish that changed prices;
- `CreateFreshLeafTicketUseCase`: receipt event inside the ticket transaction;
- `CloseSettlementPeriodUseCase`: one event per line after the close commits;
- `apps/web/src/application/zalo/WithdrawalEndedScan.ts`: parcels whose latest counted spraying's `safe_harvest_date` is today (Vietnam day), using rule (a) helpers;
- tests for every hook, including no event when the feature is off for the cooperative.

Commit: `feat(zalo): queue price, receipt, withdrawal-ended and settlement messages`.

### Task C3: internal routes and settings APIs

**Files:**
- `apps/web/src/app/api/internal/zalo/{outbox,outbox/[id]/result,tick,heartbeat,credentials}/route.ts` with `requireZaloCaller` (`lib/api/internal-zalo-auth.ts`, a `KeycloakZaloTokenVerifier`);
- `platform/gateway/apisix.yaml` (route `internal-zalo` and the excluded-role lists);
- user APIs:
  - `GET/PUT /api/zalo/settings` (manager);
  - `GET /api/zalo/deliveries?status=&kind=` (manager, accountant);
  - `POST /api/households/[id]/zalo-consent` with `{ status, source }`. The officer and manager may record OPTED_IN or OPTED_OUT for any household of their cooperative. A farmer may record only `OPTED_OUT` (source `MEMBER`), and only for a household linked to their own account (`keycloak_user_id`); anything else is 403. Every call records `recorded_by`;
  - `PUT /api/platform/zalo/templates` and `PUT /api/platform/zalo/credentials` (`platform_admin`);
- tests, and `platform/tests/test_compose_files.py` route checks.

Commit: `feat(zalo): internal relay routes and cooperative settings`.

### Task C4: relay and stub

**Files:**
- `platform/zalo/{Dockerfile,requirements.txt,dxos_zalo/{__main__.py,config.py,auth.py,gateway.py,zns_api.py,relay.py,stub_zns_api.py},tests/*}`;
- compose services and volumes in `docker/docker-compose.yml` and `docker/docker-compose.release.yml`;
- `./dxos zalo enable|disable`, mirroring telegram;
- `Makefile`: add `dxos-zalo` to `EXTRAS_AGENT` (so `up-agent`, `platform-up` and `stop-extras` start and stop it with `dxos-telegram`);
- idle when unconfigured: with no OA token in the credential file the relay only touches its heartbeat and stays healthy, as `dxos-telegram` does without `TELEGRAM_BOT_TOKEN`. A test covers it;
- the image matrix in `.github/workflows/{docker-publish.yml,release.yml}`.

The stub mimics:
- `POST /message/template`, with `phone`, `template_id`, `template_data` and `tracking_id`; it returns `{ error: 0, data: { msg_id } }` or the Zalo error codes;
- `POST /oa/access_token` for refresh;
- `/control/{calls,reset,fail-next}`.

`fail-next` takes `{ code, times }` to inject: quota (-124), invalid template (-118), not a Zalo user (-108) and a 5xx. The codes go in one table in `zns_api.py` and are verified against Zalo's public docs at implementation; the stub uses the same table.

Commit: `feat(zalo): relay service and a ZNS stub for tests`.

### Task C5: smoke

**Files:** `platform/tests/{lib-zalo.sh,smoke-zalo.sh}`, the hook in `smoke-platform.sh`, and a CI job step after the telegram smoke.

The smoke runs these steps through the stub:
1. Turn the feature on and record consent for one household.
2. Publish a price, then weigh a ticket, then close a period, then trigger the withdrawal scan through `tick` with a back-dated spraying.
3. Check four stub calls with the right template ids and params.
4. Check that re-publishing the same prices adds no call.
5. Revoke consent, then check that the next event is `skipped`.
6. Inject a permanent error, then check one call and status `failed`.

Commit: `test(zalo): smoke the four messages through the stub`.

### Task F1 (Codex): Zalo screens

**Files:** `apps/web/src/app/platform/zalo/*` (templates and token), `apps/web/src/app/manager/zalo/*` (settings and the deliveries list), the consent control on the household detail for officer and manager, the farmer profile showing "Nhận tin Zalo: Đang nhận" with "Tắt nhận tin" (it posts `OPTED_OUT` for the farmer's own household through the C3 route), a menu entry, and tests.

- Never show tokens back after saving: show the last 4 characters only.
- Phones are masked to the last 3 digits in lists.
- Run `next build` before reporting.

## Verification (controller)

- All suites, `platform/zalo` pytest, and the smoke on a throwaway stack with the stub.
- Two UI rounds for the new pages.
- No real OA key is needed. The owner adds the OA and the approved ZNS template ids when going live (a setup step for him).
