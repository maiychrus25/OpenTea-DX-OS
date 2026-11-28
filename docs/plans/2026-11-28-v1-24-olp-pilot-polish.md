<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# v1.24.0 — OLP 2026 & Pilot Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the public face of the project up to v1.23, without new business features:
- the OSI-first README and site;
- a closed demo dataset for HTX Tân Cương (TC) with five demo accounts;
- mini-apps that trust only the gateway;
- schema docs that match `schema.prisma`.

**Source of the request:** the owner's message of 2026-11-28 evening (the OLP 2026 national open-source software contest, and the Thái Nguyên pilot). There is no separate spec. This plan states the decisions, and the owner approved the four items as written.

## Global Constraints

- No new business feature, migration or API contract change, except the mini-app gateway header (T3) and the demo commands (T2).
- **Every component named as a core part must be OSI-licensed** (MIT, Apache-2.0, PostgreSQL License, BSD, GPL family):
  - Postgres with PostGIS and pgvector;
  - Keycloak, APISIX, Hasura, SeaweedFS;
  - Ollama with `qwen2.5:0.5b`, Piper, whisper.cpp;
  - `dxos-agent`, `dxos-telegram`, `dxos-zalo`.

  `n8n` (Sustainable Use License, fair-code, not OSI) and the Groq, OpenAI and Anthropic APIs are **optional HTTP integrations** that are never required.
- **Mini-apps advertised:** `tea-shop` 0.4.0 (draws lot stock through the Core Action API), `tea-tour` 0.2.0, `custom-books` 0.3.0, `hello` 0.1.0. `leaf-purchase`, `farm-supply` and `htx-dashboard` are frozen and not advertised; they stay in the repo.
- **Roles:** `platform_admin`, `manager`, `accountant`, `officer`, `farmer`, with role switching for a person who holds several roles.
- **Commits:** identity maiychrus25 / ninhkhuongpl7@gmail.com, English Conventional Commits, no AI attribution. Vietnamese only in user-facing copy and Vietnamese docs.

## Tracks

| Track | Worker | Task |
|---|---|---|
| T1 | Codex | README and site (VI + EN) |
| T2 | Sonnet | TC demo dataset and demo accounts |
| T3 | Sonnet | Mini-app gateway secret |
| T4 | Sonnet | `database-schema.md` vs `schema.prisma` (DEV-016), DEV-015 row |

Merge order: T4, T3, T2, T1. T1 describes the commands that T2 and T3 add, under the names fixed below.

### T1 — README.md and site/ (`index.html`, `en/index.html`)

- **Centre the README on the OSI stack.**
  - Remove the n8n badge, and add badges for the OSI core. The licence section states which parts are OSI and lists the optional, non-OSI integrations, linking `DEPENDENCIES.md`.
  - Update the features to v1.23:
    - GĐ1–GĐ3: weighing station and leaf prices, member ledger and settlement with VietQR, processing batches and lots from batches, certificates, one public `/q` page, the director board, sales from lot stock, the season report.
    - GĐ4: the cross-check agent, the 14-day forecast, the PDF chatbot, the listen buttons, Zalo ZNS, tea pest labels and the model registry.
  - Mermaid: drop NASA POWER and show only live sources. Show `dxos-zalo` and `dxos-telegram` next to `dxos-agent`, with n8n as optional.
  - A five-role table, plus role switching.
  - Install and release commands: GHCR images including `dxos-zalo`, `make demo-seed`, `./dxos demo accounts`.
  - Remove the stale "TOTP bắt buộc" note, and say instead how the demo accounts are prepared (T2).
  - The mini-app list as in Global Constraints. Fix the version-pinned notes (v1.8–v1.11 wording).
- **Site** (`site/index.html`, `site/en/index.html`): the same facts.
  - The sample manifest becomes `requires: { core: ">=1.21.0" }` with `tea-shop`, not the frozen `htx-dashboard`.
  - Keep the look, follow `DESIGN.md`, and keep the injected values (`scripts/inject-site-values.py`).
  - The mini-app count must come from the advertised apps, not from every `app.yaml`. Change the injector to skip apps listed in a `FROZEN_APPS` set inside the script, or add `frozen: true` to their `app.yaml` if `./dxos validate` accepts the key. Pick the smaller change.
- **Verify:** `bash scripts/build-site.sh` and the site's own checks, the links checked, both pages at 1366 and 390 px in light and dark with no overflow, and the Mermaid diagram parses.

### T2 — Closed demo dataset for TC and demo accounts

- **Command names (fixed):**
  - `npm run demo-seed` in `apps/web`, script `apps/web/prisma/demo-seed.ts`;
  - `make demo-seed`, which runs it in the `migrate` tools image the way `platform-up` runs migrations, so no host Node is needed;
  - `./dxos demo accounts`.
- **Do not change `seed.ts`:** `seed-test.sh` asserts its counts. `demo-seed` runs after `seed` and assumes its households and parcels.
- **Idempotent by fixed natural keys.** Each run brings TC to the demo state:
  - Today's leaf prices for the three grades: an upsert for today's Vietnam date.
  - Fresh-leaf tickets: a handful for today and the last 10 days, on TC-A1, TC-A2, TC-B1 and TC-B2, with fixed `ticket_no`, created only if missing.
  - **TC-A3 stays in withdrawal** (seed.ts already sprays it 3 days ago), so a live weighing on A3 shows the red block.
  - A finished processing batch with fixed `batch_code`:
    - linked tickets;
    - fresh ÷ dry = 4.75, in band;
    - outputs by grade.
  - Lot `TC-CHE-A3-001` with all four `/q` layers: zone, journal and withdrawal, processing batch, certificate.
    - Read `GetLotTraceDataUseCase` and the `PublicTrace` component first, and make the data feed what they read.
    - Add one sample `HtxCertificate` (VietGAP, valid), linked through `LotCertificate`, with a small PDF uploaded to SeaweedFS at its `file_key` through the existing storage adapter.
    - The page `/q/TC-CHE-A3-001` must answer 200 and show all four layers.
  - One settlement period with an advance offset:
    - Seed a pesticide or fertiliser advance for one household.
    - Give the household bank fields (`bank_bin`, `bank_account`, `bank_account_name`; demo values with a visible "DEMO" name) so the slip shows VietQR.
    - Close the period **through `SettlementUseCases`** (not raw SQL), so the ledger and Zalo hooks behave as in production.
    - The ledger is append-only, so if the period already exists it is left as is and the run says so.
  - **A13 seed:**
    - R1: a VALID PESTICIDE advance 15 days ago for Đỗ Thị Hạnh with no spraying.
    - R2: tickets on TC-B2 in one open cycle above 0.27 ha × 1,800 × 1.35.
    - Document how to trigger a cross-check run for the demo. If the agent has no run-once entry, add `python -m dxos_agent --once cross-check --htx TC`. It must reuse the scheduled code path, and the help text must say so.
- **`./dxos demo accounts`:**
  - Acts only on the five usernames `platform_admin`, `manager_tc`, `accountant_tc`, `officer_tc` and `farmer_tc`, and refuses any other name.
  - Through kcadm, like the other `./dxos` Keycloak commands, it ensures each user exists with its realm role (and `htx_code` for TC users).
  - It clears `requiredActions`, and removes OTP credentials only with `--reset-otp`.
  - It never changes a password unless `--password` is given. It prints what it changed.
  - It touches nothing on its own: the owner runs it.
- **Tests:**
  - A Postgres opt-in test (`DEMO_TEST_DATABASE_URL`, the existing pattern): `seed` then `demo-seed` twice. The second run adds nothing, the state assertions hold, `/q` data has four layers, the period is closed with a VietQR-ready line, and the A13 inputs exist.
  - A `test_dxos_script.py` test that `demo accounts` refuses other usernames.
- **Docs:** `docs/dev-setup.md` gets a "Demo sân khấu 10 phút" section with the commands and the click path per role.

### T3 — Mini-apps trust only the gateway

**Design** (chosen over JWT verification: it protects public routes too, needs no Keycloak on `dxos-apps-net` and no new library, and a per-app secret keeps one compromised app from forging calls to another):

- At install (and for existing installs, at `gateway-sync`), `dxos-cli` creates a random per-app secret: 32 bytes, base64url.
  - It writes the secret to the app's env file `runtime/<project>/apps/<id>.env` as `DXOS_APP_GATEWAY_SECRET`, mode 0600. Today that file exists only for apps with a database; it now exists for every app, and `compose.py` always passes it.
  - It writes the same value into every route of that app as a `proxy-rewrite` `headers.set` `X-Dxos-App-Gateway: <secret>`, keeping the existing `remove` list. This covers protected, public and actor routes, and old fragments too.
- **`platform/appkit/appkit.py`:** an ASGI middleware or a dependency used by every route refuses with 403 any request whose `X-Dxos-App-Gateway` does not match `DXOS_APP_GATEWAY_SECRET` (`hmac.compare_digest`).
  - Health endpoints used by Docker healthchecks stay open on `/healthz` only.
  - When the env var is missing, the app refuses every non-health request (fail closed) and logs the reason once.
  - Run `make appkit-sync` for the synced apps.
- **`hello`** does not use appkit. Add the same few-line check there.
- **Upgrade path:**
  - `make platform-up` (gateway-sync) creates the secrets for apps already installed and recreates their containers so they read the env file.
  - A test proves that an install made before this change works after one `make platform-up`.
- **Tests:**
  - The CLI tests for routes and env.
  - The appkit tests: a missing header gives 403, a wrong one 403, the right one passes, health is open.
  - The apps smoke: a direct request on `dxos-apps-net` without the header is refused.
  - The compose tests.
- **Docs:** `docs/miniapps.md`, ADR 0002 (a short "Ghi chú" under the decision; do not rewrite the body), the R24 limitation notes, and `docs/rules-and-limits.md`.

### T4 — Schema docs and deviation register

- **`docs/database-schema.md` vs `apps/web/prisma/schema.prisma`:**
  - Every `@@map` table has a section, and every column, type, nullability, default, unique and FK matches. Add the missing ones (at least `chat_history`), remove stale rows such as the `users` table and the "FK → users" notes, and keep the Vietnamese style.
  - The raw-SQL `platform` schema sections stay.
  - Add `scripts/check-schema-doc.py`, a small checker:
    - it parses `schema.prisma` (models, `@@map`, fields with `@map`);
    - it fails when a table or column is missing from the doc, or when the doc names one that does not exist;
    - it runs in CI next to `validate-structure.sh`.
- **`docs/deviation-register.md`:**
  - DEV-016 is "Fixed (v1.24.0)" for the schema drift. Keep the freeze part as it stands, or split it into a sentence saying the freeze is done in GĐ0 (v1.18.0).
  - DEV-015 is "Partially fixed (v1.19.0, v1.23.0)", with a note:
    - the label list, consent, field manifest, registry and field training pipeline shipped in v1.23.0;
    - the v2 model awaits 150 field photos per class.

## Verification (controller)

- **Suites:**
  - web: tsc, lint, jest, `next build`;
  - Python: platform, cli, appkit and app tests, zalo, agent, disease-api, ai-models;
  - `scripts/check-schema-doc.py`;
  - the site build.
- **Throwaway stack** (1.17.0 backup and all migrations):
  - `seed`, then `demo-seed` twice;
  - each role's demo click path;
  - `/q/TC-CHE-A3-001` shows four layers;
  - the weighing on A3 is blocked;
  - the slip shows VietQR;
  - a cross-check run gives the two alerts.
- **Mini-app hardening:** proven by CI's apps smoke (a direct call refused); locally by the CLI and appkit tests.
- **Two UI rounds:** README and site pages plus the demo pages, desktop and mobile, light and dark.
- **Release:** release PR v1.24.0.
