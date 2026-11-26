<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M6: Telegram Mini App — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the bot's menu button opens the web inside Telegram as a Mini App. This covers everything that does not fit a chat: parcel drawing, document upload, the App Store and the mini-apps, partners, the full approval inbox, AI settings, and the detail page of high-risk actions.
- The first time, the person signs in to Keycloak as on the web, and Telegram's webview keeps the session.
- The web accepts the Mini App only when Telegram's signed `initData` names the Telegram account linked to the signed-in person (test 13).
- Inside Telegram, the web follows Telegram's light or dark theme, fits the phone width, and uses Telegram's Back button.
- Chat cards gain the `Sửa` button that opens the matching form prefilled, and the chat menu gains `Mở ứng dụng`.

**Architecture:**
- The relay sets the bot's menu button to the web's HTTPS URL (`setChatMenuButton` with `web_app`).
- The web never holds the bot token. `./dxos telegram enable` writes only the derived Mini App key, `HMAC_SHA256(key="WebAppData", msg=<bot token>)`, which validates `initData` and nothing else.
- A small client script reads `Telegram.WebApp`, posts `initData` once per session to `/api/telegram/webapp/session`, and applies the theme and Back button.
- Pages that are not linked to the session's Telegram account refuse and show the reason.

**Tech Stack:** Next.js 14 + zod (`apps/web`), Python 3.12 standard library (`platform/telegram`), the Telegram Web App script (loaded from `https://telegram.org/js/telegram-web-app.js` only inside Telegram, no npm package).

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §13.1, §13.6, §13.7 (the "Mini App" group), §13.4 (detail page for `high`), §15 test 13, D17, milestone row M6.

## Global Constraints

- **Repository rules:** `AGENTS.md`. No new npm dependency: the Telegram script is loaded at runtime, inside Telegram only.
- **`initData` is never a login.** It only binds the Telegram account to the already signed-in session. With no session, the person signs in to Keycloak first, inside the webview.
- **Validation of `initData`:**
  - the HMAC check uses the derived key;
  - `auth_date` is at most 24 hours old;
  - the `user.id` must equal the `telegram_user_id` of an active link of the session's user.

  Otherwise answer 403 `WEBAPP_NOT_LINKED`, and the page shows `Tài khoản Telegram này chưa liên kết với tài khoản đang đăng nhập.` (test 13).
- **Session flag.** The binding is stored as a signed, `httpOnly` cookie `dxos_tg_webapp` with value `<telegram_user_id>.<user_id>.<expires>.<sig>`, expiring after 12 hours and signed with `AUTH_SECRET`. Mini App-only UI (the Back button, the theme) needs it. Ordinary web use never needs it.
- **Without HTTPS** (no D17 domain yet), the relay skips the menu button and logs once. Chat keeps working.
- **UI:**
  - `DESIGN.md` tokens, with Telegram's theme mapped onto them (light or dark from `Telegram.WebApp.colorScheme`);
  - 390 px width with no horizontal overflow;
  - no text under 11 px.

## Review Focus

1. **Forged or stale `initData`:** a changed field, a wrong hash, an `auth_date` older than 24 h, or a missing `user`. Expected: 403, and nothing is bound. Test: W-1.
2. **Another person's Telegram.** `initData` from a Telegram account linked to someone else → 403 (test 13). Test: W-1.
3. **Signed in on the web and opened in a normal browser.** Nothing changes, and no Telegram script is loaded. Test: W-2 component test.
4. **The derived key is missing.** When Telegram is not enabled, the session route answers 404 `WEBAPP_DISABLED`, and the page shows normal web UI. Test: W-1.
5. **The `Sửa` button for a card whose kind has no form.** The button is not shown. Test: W-3.

---

## Contracts

### C1. Derived key

- `./dxos telegram enable` computes `DXOS_TELEGRAM_WEBAPP_KEY` = hex of `HMAC_SHA256(key=b"WebAppData", msg=<TELEGRAM_BOT_TOKEN>)` and writes it to the web's environment, like `DXOS_TELEGRAM_CALLBACK_KEY` (the compose `web` service reads it). `./dxos telegram disable` removes it.
- The relay gets `DXOS_WEB_PUBLIC_URL`, the web's HTTPS base URL, which is empty by default.

### C2. Relay

- At start, when `DXOS_WEB_PUBLIC_URL` starts with `https://`, the relay calls `setChatMenuButton` with `{menu_button: {type: "web_app", text: "Mở ứng dụng", web_app: {url: <URL>/telegram/open}}}`.
- Otherwise it logs `Mini App needs an HTTPS web address; the menu button is not set.` once.

### C3. Web

**`POST /api/telegram/webapp/session`** (session required) with body `{ "init_data": "<raw initData>" }`:
- validates it as in Global Constraints;
- sets the `dxos_tg_webapp` cookie;
- answers 200 `{ "telegram_user_id": n }`;
- refusals: 401 (no session), 403 `WEBAPP_NOT_LINKED`, 400 `WEBAPP_INVALID`, 404 `WEBAPP_DISABLED`.

**`/telegram/open` page:**
- signs the person in if needed (return URL kept);
- runs the binding;
- redirects to the role's home (`/farmer/dashboard`, `/officer/dashboard`, `/manager/dashboard`), or to `?to=<path>` when the path is a same-origin web path from the C4 list.

**`TelegramWebAppShell` (client):** mounted in the root layout. It does nothing outside Telegram. Inside, it:
- loads the script;
- calls `ready()` and `expand()`;
- maps `themeParams` onto the design tokens;
- shows the Back button when `history.length > 1` and wires it to `router.back()`.

**Coverage rows:** `POST /api/telegram/webapp/session` goes to the `none` group (test 17).

### C4. Deep links from chat

- The chat menu gains `Mở ứng dụng` (all roles) as a `web_app` button with `<URL>/telegram/open`. It is only shown when `DXOS_WEB_PUBLIC_URL` is HTTPS.
- Cards gain `Sửa` (`web_app` button) with `?to=` the form for the kind:
  - `journal.create` → `/farmer/journal/new?parcel=<id>&activity=<type>&product=<…>&dosage=<…>&withdrawal=<n>` for farmers, and the officer journal form for officers;
  - `harvest.approve` → the parcel detail page.

  Kinds with no form get no `Sửa`.
- The proposal message `Mở chi tiết` button for `high` kinds opens `/manager/ai?proposal=<id>` in the Mini App.

---

## Tracks

| Track | Owns |
|---|---|
| W web | `apps/web/**`, `docs/api-contract.md` |
| R relay, CLI, compose | `platform/telegram/**`, `dxos` (the telegram enable and disable part), `docker/docker-compose.yml` (the web and relay env lines) |
| I smoke and docs | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

### Track W

**W-1: `initData` validation and the session route.**
- Validation follows Telegram's published algorithm:
  1. parse the query string;
  2. build the data-check-string (`key=value` lines sorted by key, without `hash`);
  3. compute HMAC-SHA256 with the derived key;
  4. compare in constant time.
- [ ] Tests:
  - a valid fixture built in the test with a fake token;
  - each field changed;
  - an old `auth_date`;
  - no `user`;
  - another person's link;
  - disabled.

**W-2: the shell, the open page and the theme mapping.**
- [ ] Component tests: nothing happens outside Telegram; inside, the theme and the Back button.
- [ ] Headless check at 390 px, light and dark, by simulating `window.Telegram.WebApp`.

**W-3: chat buttons (C4).** The engine and notifier changes, with tests (Review Focus 5). Then the whole Jest suite, lint, `tsc`.

### Track R

**R-1.** `setChatMenuButton` at relay start (C2), with stub support and tests.

**R-2.** `./dxos telegram enable` and `disable` write and remove `DXOS_TELEGRAM_WEBAPP_KEY` (C1). The compose env lines.
- [ ] A test that the derived key equals the known HMAC for a fixed fake token, and that the token itself is never written to the web's environment.

### Track I

**I-1.** Smoke: with the stub, build a valid `initData` for the linked owner (the smoke knows the stub's fake token), sign in as `smoke_manager_tc`, and assert:
- the session route accepts it;
- another Telegram id is refused with 403 (test 13);
- the stub got `setChatMenuButton` when the URL is HTTPS (set a fake HTTPS URL for the run).

**I-2.** Docs: the D17 HTTPS requirement, how to set `DXOS_WEB_PUBLIC_URL`, and what works without it.
