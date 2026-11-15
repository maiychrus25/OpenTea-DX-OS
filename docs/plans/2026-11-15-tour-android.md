<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Android Tour App and Tea-tour API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Android app in which guests browse and book tea-hill tours, pay by VietQR and keep offline tickets, and in which guides and managers sign in with their DX-OS account to see schedules and check guests in by scanning the ticket QR; backed by a JSON API inside the `tea-tour` mini-app.

**Architecture:** The API is two more routers in `tea-tour` (public under `/public/{htx}/api/v1`, protected under `/api/v1`) calling the existing store and domain layers. The web proxy forwards a mobile bearer token to the gateway on protected paths; two small public endpoints tell the app which cooperatives run the app and where Keycloak is. The Android app is one Gradle module (Kotlin, Compose, manual dependency container) with `data`, `domain` and `ui` packages; it decodes the same JSON fixtures the API tests emit.

**Tech Stack:** FastAPI (Python 3.12); Next.js 14 route handlers, jest; Keycloak 24 realm JSON and `kcadm`; Kotlin, Jetpack Compose (Material 3), OkHttp, kotlinx.serialization, Coil, AppAuth-Android, ZXing core, CameraX, DataStore; JUnit, Robolectric, Roborazzi, MockWebServer; GitHub Actions.

**Spec:** `docs/specs/2026-11-15-tour-android-design.md` (Vietnamese; the authority). Business rules: `docs/specs/2026-11-15-tea-tour-system-design.md` §7.

## Global Constraints

- Everything in the Global Constraints of `docs/plans/2026-11-15-tea-tour-system.md` still holds (commit identity, no AI mention, no push, SPDX headers, forbidden files, the owner's stack is never touched, no JavaScript in mini-app pages).
- Android dependencies: only the libraries named in spec §6, all Apache-2.0 or MIT, no Google Play services, no Firebase, no ML Kit. Exact versions are the latest stable set that works together, looked up in the official documentation at implementation time and pinned in `gradle/libs.versions.toml`.
- `minSdk 26`, `compileSdk 35`, `targetSdk 35`, JDK 17. Application id `vn.opentea.dxos.tour`.
- No secret, keystore or signing password in the repository.
- All app text is Vietnamese in `strings.xml`; no hard-coded user-facing string in Kotlin.
- Tokens and booking access keys never reach a log line.
- Versions: web `1.14.0` (Task W), `tea-tour` `1.1.0` with `requires.core: ">=1.14.0"` (Task A).
- No regression: every check of `v1.13.0` keeps its count and passes.

## Review Focus

1. A forged or expired bearer token, a token of a cooperative that did not enable the app, and a bearer sent to a public path must not reach the app as an authenticated request — Task W tests `bearer is forwarded untouched on protected paths`, `bearer is ignored on public paths`, `token without htx_code is 404`.
2. A guide must never receive a phone number or a pending booking through the API, and must be refused on another guide's departure — Task A tests `guide payload has no phone`, `checkin on another guide's departure is NOT_YOUR_DEPARTURE`.
3. A lost response followed by a retry must not create a second booking or a second payment — Task A tests `same request_key returns the first booking`, `same payment request_key records once`; Task M2 test `booking retries with the same key after a timeout`.
4. A stored ticket whose booking was cancelled while the phone was offline must stop showing its QR once the app is online — Task M2 test `cancelled booking hides the QR`.
5. A server answering with a plain-text 429 or 503, or with JSON the app cannot decode, must give a readable message and never a crash — Task M1 tests `non-JSON error maps to a status message`, `unknown JSON fields are ignored`.

---

### Task W: Core — bearer forwarding, tenant directory, mobile config, Keycloak client

**Files:**
- Modify: `apps/web/src/application/apps/forward-to-app.ts`, `apps/web/src/app/apps/[id]/[[...path]]/route.ts`, tests beside them
- Create: `apps/web/src/app/api/apps/[id]/tenants/route.ts`, `apps/web/src/app/api/mobile/config/route.ts`, their jest tests; the repository method that lists enabled cooperatives in `apps/web/src/infrastructure/db/repositories/prisma-installed-app-repository.ts`
- Modify: `apps/web/src/middleware.ts` only if these two paths are not already public
- Modify: `docker/keycloak/realm-agrimarket.json` (client `dxos-mobile`), `platform/tests/test_realm_policy.py`, `Makefile` (`mobile-client`), `docs/miniapps.md`, `CHANGELOG.md`, web version `1.14.0`

**Interfaces — Produces:**
- Proxy: on a protected path, `Authorization: Bearer <jwt>` replaces the session token; `htx_code` is read from the token payload without verification.
- `GET /api/apps/{id}/tenants` → `{"items": [{"htx_code": "...", "name": "...", "address": "..."}]}`.
- `GET /api/mobile/config` → `{"oidc": {"issuer": "...", "client_id": "dxos-mobile", "redirect_uri": "vn.opentea.dxos.tour:/oauth2redirect"}, "core_version": "1.14.0"}`. The issuer is the public Keycloak issuer the web app already uses for sign-in.

- [ ] **Step 1:** failing jest tests: Review Focus 1; the order of checks in spec §5.1; the session path is unchanged when no header is present; gateway 401 and 403 pass through; a bearer request is not counted by the public limiters.
- [ ] **Step 2:** implement the proxy change.
- [ ] **Step 3:** tenants endpoint (tests: app without public routes → 404; unknown app → 404; enabled for one cooperative; enabled for all; capped at 200 and sorted by name; rate limited by the public read limiter) and config endpoint (test: values come from the environment the web app already reads for Keycloak; no secret in the answer).
- [ ] **Step 4:** realm client and `test_realm_policy.py` tests `mobile client is public with PKCE S256`, `mobile client has no password grant`, `mobile client uses the core scope and roles`; `make mobile-client` (idempotent `kcadm` inside the keycloak container, credentials from the container's own environment; never reads an env file).
- [ ] **Step 5:** version, docs, CHANGELOG; `make test`, `make lint`, `npx tsc --noEmit`, `python -m pytest platform/tests/test_realm_policy.py`. Commit `feat(web): mobile sign-in through the mini-app proxy and a tenant directory`.

### Task A: Tea-tour JSON API

**Files:**
- Create: `miniapps/tea-tour/tea_tour/routes/api_public.py`, `routes/api_staff.py`, `tea_tour/api_schema.py` (serialisers), `migrations/003_payment_request_key.sql`, `tests/test_api_public.py`, `tests/test_api_staff.py`, `tests/api_fixtures/*.json`
- Modify: `tea_tour/main.py` (register the routers), `tea_tour/store/core.py` (`record_payment(..., request_key=None)`), the payment form of the sales admin (hidden `request_key`), `app.yaml` (protected prefix `/api/` for `manager` and `farmer`, version `1.1.0`, `requires.core`), `miniapps/tea-tour/README.md`

**Interfaces — Consumes:** the store and domain layers of tea-tour 1.0. **Produces:** the endpoints of spec §4, and one fixture file per response shape, named `<area>-<name>.json` (for example `public-tour-detail.json`, `staff-checkin-already.json`).

- [ ] **Step 1:** migration 003 and `record_payment` idempotency, test first.
- [ ] **Step 2:** public API, one test per endpoint for the success shape (written to the fixture file by the test) and one per refusal; Review Focus 3; wrong key and unknown code give the same 404.
- [ ] **Step 3:** staff API; Review Focus 2; a guide on a manager endpoint is 403; another cooperative's ids are 404; every check-in error of spec §4.2.
- [ ] **Step 4:** manifest, README, `python -m dxos_cli validate miniapps/tea-tour`, `pytest`. Commit `feat(tea-tour): JSON API for the mobile app`.

### Task M1: Android foundation

**Files:** `apps/tour-android/**` (new), `scripts/tour-fixtures-sync.sh` (copies `miniapps/tea-tour/tests/api_fixtures/` into `apps/tour-android/app/src/test/resources/api/`; `--check` compares), `Makefile` (`android-build`, `android-test`, the check inside `lint`), `.github/workflows/ci.yml` (job `android`), `DEPENDENCIES.md`.

**Interfaces — Produces** (written with final signatures to `.superpowers/sdd/2026-11-15-tour-android/task-M1-interfaces.md`):
- `ApiResult<T>`: `Ok(value)`, `Failure(code, message, httpStatus)`, `Offline`.
- `PublicApi` and `StaffApi`: one `suspend` function per endpoint of spec §4; models decoded with unknown fields ignored.
- `TicketStore` (stored tickets as a `Flow`, save, refresh, remove, the 100-ticket rule), `SettingsStore` (server address, cooperative, theme), `AuthSession` (signed-out or signed-in state as a `StateFlow`, `signIn`, `signOut`, `freshToken()`).
- `AppContainer` (manual wiring), the navigation graph with every route of spec §6.1 registered to a placeholder screen, the theme (brand colours, Be Vietnam Pro, light and dark), shared components (loading, error with retry, empty), `FakePublicApi` and `FakeStaffApi` in the test source set, and the Roborazzi screenshot helper.

- [ ] **Step 1:** project scaffold that builds: `./gradlew assembleDebug` on JDK 17 with the SDK in `~/Library/Android/sdk` (`local.properties` is not committed).
- [ ] **Step 2:** models and API client, test first against the fixture files; Review Focus 5; timeouts and `Offline`.
- [ ] **Step 3:** stores and `AuthSession` (AppAuth with the configuration from `/api/mobile/config`; token refresh; encrypted storage), with JVM tests on fakes.
- [ ] **Step 4:** theme, navigation, shared components, cooperative picker and settings screens, with Roborazzi images in light and dark.
- [ ] **Step 5:** CI job (wrapper validation, tests, debug APK and unsigned release build, artifacts), make targets, fixture check, `DEPENDENCIES.md`. Commit `feat(android): tour app foundation`.

### Task M2: Guest screens (parallel with M3)

**Files:** `apps/tour-android/app/src/main/java/vn/opentea/dxos/tour/ui/guest/**`, matching tests, strings with the prefix `guest_`.

- [ ] **Step 1:** home, tour list (filters, paging), tour detail (pager gallery, itinerary, departures, reviews) — ViewModel tests on `FakePublicApi`, then screens.
- [ ] **Step 2:** booking form, review step (`/quote`), submit with `request_key`; `PRICE_CHANGED` returns to the review step with the new quote; Review Focus 3.
- [ ] **Step 3:** booking screen (state, VietQR rendered with ZXing from the server's payload, copy account and content, report paid, cancel, review), tickets list, ticket screen (large QR, screen brightness), lookup, inquiry; Review Focus 4.
- [ ] **Step 4:** Roborazzi images of every screen in light and dark, reviewed and fixed. Commit `feat(android): guest booking, payment and tickets`.

### Task M3: Staff screens (parallel with M2)

**Files:** `…/ui/staff/**`, matching tests, strings with the prefix `staff_`.

- [ ] **Step 1:** sign-in, departures (upcoming, past), departure with the guest list — ViewModel tests on `FakeStaffApi`, role-dependent content.
- [ ] **Step 2:** scan screen (CameraX preview, ZXing decode off the main thread, manual code entry, result sheet with the guest name, party, amount to collect and the check-in button), every error of spec §4.2 with its own message, the offline message with the cached guest name, undo.
- [ ] **Step 3:** manager to-do (confirm, record payment with `request_key`).
- [ ] **Step 4:** Roborazzi images, reviewed and fixed. Commit `feat(android): staff schedule, ticket scanning and check-in`.

### Task J: Integration and release preparation

Brief written from the merged tree. Scope: end-to-end run on the emulator against a clean stack (spec §7), `platform/tests/smoke-apps.sh` checks for the API and the bearer path, release workflow step for the APK (signed when the secrets exist), README (build from source, phone and LAN set-up, known limits), CHANGELOG, two clean rounds.
