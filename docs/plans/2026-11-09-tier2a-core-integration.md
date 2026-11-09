<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Tier 2a — Core Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Next.js app consume the Tier 1 core with each user's identity and enforce per-HTX isolation on reads and writes, on a database schema that matches Prisma.

**Architecture:** next-auth keeps the Keycloak tokens server-side and refreshes them. `requireTenant()` and `TenantGuard` scope Prisma writes. Five read adapters call Hasura through an internal APISIX port and implement the read half of the existing ports.

**Tech Stack:** Next.js, next-auth v5, Prisma 5.22, Jest, Playwright, APISIX 3.19, Hasura v2.51.4, Keycloak 24.

**Spec:** `docs/specs/2026-11-09-tier2a-core-integration-design.md`

## Global Constraints

- Application code in `apps/web` may change in this plan. Do not touch `apps/web/prisma/migrations/20260828134608_*`.
- No new npm dependencies.
- New files carry `SPDX-License-Identifier: MIT` and `SPDX-FileCopyrightText: 2026 OpenTea Developers` in the file's comment syntax.
- English identifiers and commit messages; Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>`; no `Co-Authored-By`; never push without owner approval.
- User-facing copy is Vietnamese.
- Existing web tests may change only where an interface changed (for example a mocked `findFirst()`); never delete or skip one.
- Never delete the owner's Docker volumes (`docker_*`). A clean-database run is: `make platform-down; COMPOSE_PROJECT_NAME=dxos-clean make platform-up && COMPOSE_PROJECT_NAME=dxos-clean make platform-smoke`, then `COMPOSE_PROJECT_NAME=dxos-clean docker compose -f docker/docker-compose.yml down -v`, and finally `make platform-up`. Realm changes only load on a new Keycloak database, so they need this run.
- Error codes are exactly `NO_HTX` (403) and `CORE_UNAVAILABLE` (503). `CORE_GATEWAY_URL` defaults to `http://apisix:9081`.
- `disease-api` cannot be built on arm64 hosts; do not build it locally.

## Review Focus

- **Two parallel requests refreshing the same expired token**: neither logs the user out — test in Task 3.
- **Refresh token expired while a page is open**: redirect to `/login`, no 500 — test in Task 3.
- **`batch-approve` with one entry from another HTX**: 404, and nothing is approved — test in Task 5.
- **Records with a null `htx_profile_id`, or a parcel whose household has none**: treated as not found, never as a match on a null tenant — test in Task 5.
- **Hasura rows with a null relationship or no crop cycle**: the adapter returns the same shape as Prisma (`null` fields) without throwing — test in Task 6.

---

### Task 1: Internal gateway port

**Files:**
- Modify: `platform/gateway/config.yaml`, `platform/gateway/apisix.yaml`, `platform/tests/smoke-dataops.sh`

**Interfaces:**
- Produces: APISIX listens on `9080` and, inside the compose network only, `9081`.

- [ ] **Step 1: Add failing smoke section `[internal gateway port]`** before `[release guards]`. From a throwaway `curlimages/curl` container on the compose network, or `$COMPOSE exec -T hasura curl`: `POST http://apisix:9081/api/data/graphql` with no token is 401; 310 quick requests to `http://apisix:9081/api/data/graphql` contain no 429; 310 quick requests from the host to `$GATEWAY/api/data/graphql` contain at least one 429. Assert the host cannot reach port `9081`.
- [ ] **Step 2: Run** `make platform-smoke`. Expected: FAIL at the first assertion of the section.
- [ ] **Step 3: Implement.** `node_listen: [9080, 9081]`. In the global rule's `limit-count`, add `_meta: { filter: [["server_port", "~=", "9081"]] }`. Do not publish `9081`.
- [ ] **Step 4: Verify.** `make platform-up && make platform-smoke`. Expected: all PASS. If `_meta.filter` cannot express this, stop and report BLOCKED: the design must be changed by the controller. The 429 check on `9080` must run last in the section so it does not exhaust the window for later sections, or the section must wait out the 60 s window.
- [ ] **Step 5: Commit** `feat(platform): add an internal gateway port for the web app`.

---

### Task 2: Migration drift (#7)

**Files:**
- Create: `apps/web/prisma/migrations/20261109120000_sync_schema_drift/migration.sql`
- Modify: `apps/web/prisma/schema.prisma`, `platform/tests/smoke-dataops.sh`

- [ ] **Step 1: Add failing smoke section `[migrations]`.** Create database `prisma_shadow` if absent in the `postgres` container. Run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://<user>:<pw>@localhost:5432/prisma_shadow --exit-code` from `apps/web`. Exit code 0 passes; 2 fails.
- [ ] **Step 2: Run it.** Expected: FAIL (exit 2).
- [ ] **Step 3: Write the migration** with exactly the statements in spec §8, every `ADD COLUMN` and `ADD VALUE` using `IF NOT EXISTS`. Backfill `lots.harvest_date = created_at` where null before `SET NOT NULL`.
- [ ] **Step 4: Update `schema.prisma`.** Add optional `packaging_date DateTime?`, `total_weight_kg Float?`, `packaging_spec String?` to `Lot`; `@@index([htx_profile_id, status])` to `Lot`; `@@index([htx_profile_id])` to `Household`. Add nothing else.
- [ ] **Step 5: Prove upgrade safety.** On a throwaway database: apply migrations up to `20260828134608`, insert a `lots` row with a null `harvest_date` and non-null `total_weight_kg`, apply the new migration. Expected: `harvest_date` equals `created_at`, `total_weight_kg` is unchanged. Run the migration a second time by hand on that database. Expected: no error from the `IF NOT EXISTS` statements.
- [ ] **Step 6: Verify.** The smoke section passes; `make test` passes.
- [ ] **Step 7: Commit** `fix(web): bring the migration history in line with the schema`.

---

### Task 3: Session tokens and refresh

**Files:**
- Modify: `apps/web/src/auth.ts`, `apps/web/src/middleware.ts`, `apps/web/src/types/next-auth.d.ts`, `docker/keycloak/realm-agrimarket.json`, `docker/docker-compose.yml`, `platform/tests/test_realm_policy.py`
- Create: `apps/web/src/lib/auth/token-refresh.ts`, `apps/web/src/lib/auth/core-token.ts`, tests beside the existing auth tests

**Interfaces:**
- Produces:
  - `refreshAccessToken(token: JWT, fetchImpl?: typeof fetch): Promise<JWT>` in `token-refresh.ts`
  - `getCoreToken(): Promise<string>` in `core-token.ts`, server-only, throws `CoreUnauthorizedError` (exported from `src/domain/errors`) when the token is missing or `token.error` is set
  - JWT fields `accessToken`, `refreshToken`, `accessTokenExpiresAt` (seconds), `htxCode`, `error?: 'RefreshFailed'`
  - `session.user.htxCode: string | null`, `session.error?: 'RefreshFailed'`

- [ ] **Step 1: Write failing tests**

```ts
test('keeps a token with more than 30 seconds left unchanged')
test('refreshes a token with less than 30 seconds left and updates accessToken, refreshToken, accessTokenExpiresAt, htxCode')
test('sets error RefreshFailed and clears tokens when Keycloak answers 400')
test('two concurrent refreshes both return a usable token')   // Review Focus
test('session callback exposes htxCode and no token field')
test('middleware redirects to /login when session.error is RefreshFailed, including from a page request') // Review Focus
test('getCoreToken throws CoreUnauthorizedError when token.error is set')
```

- [ ] **Step 2: Run** `make test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Decode `htx_code` from `access_token` with the existing base64 decoding; an empty string becomes `null`. `getCoreToken` uses `getToken` from `next-auth/jwt` with `headers()`. The `middleware.ts` matcher must cover pages and API routes that need a session, so a refreshed token is written to the cookie. Keep the existing refresh token if Keycloak returns none.
- [ ] **Step 4: Realm and compose.** Add `"ssoSessionIdleTimeout": 28800` and `"ssoSessionMaxLifespan": 28800` to the realm, with an assertion in `test_realm_policy.py`. In the `web` service set `KEYCLOAK_ISSUER: ${KC_PUBLIC_ISSUER:-http://localhost:8080/realms/agrimarket}` and `CORE_GATEWAY_URL: http://apisix:9081`, and add a dependency on `apisix`.
- [ ] **Step 5: Verify.** `make test`, `make lint`, `python3 platform/tests/test_realm_policy.py`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(web): keep Keycloak tokens server-side and refresh them`.

---

### Task 4: Tenant resolution and account creation

**Files:**
- Create: `apps/web/src/lib/api/tenant.ts` and its test
- Modify: every site below; `apps/web/src/domain/errors.*`, `apps/web/src/lib/api/withErrorHandler.ts`, `apps/web/src/domain/farm/ports/HtxProfilePort.ts`, `apps/web/src/infrastructure/db/auth/keycloak-admin.adapter.ts`, `apps/web/src/application/auth/invite-member.use-case.ts`, `apps/web/src/app/api/register/route.ts`, `apps/web/src/app/api/members/**`, `docker/keycloak/realm-agrimarket.json`

**Interfaces:**
- Consumes: `session.user.htxCode`.
- Produces:
  - `type Tenant = { userId: string; role: 'manager'|'officer'|'farmer'; htxCode: string; htxProfileId: string }`
  - `requireTenant(): Promise<Tenant>`, throwing `UnauthorizedError` or `NoHtxError`
  - `class NoHtxError extends ForbiddenError`, mapped by `withErrorHandler` to 403 code `NO_HTX`
  - `HtxProfilePort.findByCode(htxCode: string): Promise<HtxProfile | null>`, replacing `findFirst()`

Sites to change: `app/api/farm/households/route.ts:26,30,62,66`; `app/api/lots/route.ts:26,59`; `app/api/search/route.ts:28`; `app/api/bulletin/route.ts:27`; `app/officer/dashboard/page.tsx:57`; `application/auth/invite-member.use-case.ts:29`; `infrastructure/db/farm/PrismaHtxProfileRepository.ts:8`; `infrastructure/db/farm/PrismaParcelRepository.ts:93` (use the owning household's HTX); `infrastructure/db/repositories/PrismaHtxProfileRepository.ts:15,34`.

- [ ] **Step 1: Write failing tests**

```ts
test('requireTenant throws UnauthorizedError without a session')
test('requireTenant throws NoHtxError when htxCode is null')
test('requireTenant throws NoHtxError when the code matches no htx_profiles row')
test('requireTenant never returns another HTX when the code is unknown')
test('withErrorHandler maps NoHtxError to 403 NO_HTX')
test('registerUser writes the htx_code attribute and keeps htxId')
test('invite uses the inviter HTX and adds CONFIGURE_TOTP for manager and officer, not farmer')
test('members list returns only users with the caller htx_code')
test('approve and delete of a member from another HTX answer 404')
test('announce notifies only recipients in the caller HTX')
```

- [ ] **Step 2: Run** `make test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Replace each site with `requireTenant()`, or `findByCode` in code below the route layer, removing every "oldest HTX" fallback. Pages call `requireTenant()`; add `error.tsx` where a role segment lacks one, showing a Vietnamese message for `NO_HTX`. Dashboards add `htx_profile_id` filters to their Prisma queries, through `household` where the model has no such column. `farmer1` in the realm gets `htx_code` `MD2`, matching `manager1` and `officer1`.
- [ ] **Step 4: Verify.** `rtk bypass grep -rn 'htxProfile.findFirst\|\.findFirst()' apps/web/src --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -i htx` prints nothing. `make test` and `make lint` pass.
- [ ] **Step 5: Commit** `feat(web): resolve the HTX from the signed-in user`.

---

### Task 5: `TenantGuard` on writes

**Files:**
- Create: `apps/web/src/lib/api/tenant-guard.ts` and its test; `apps/web/src/__tests__/api/tenant-isolation.test.ts`
- Modify: the routes in the table below

**Interfaces:**
- Consumes: `Tenant`.
- Produces: `class TenantGuard` with `constructor(tenant: Tenant, db?: PrismaClient)` and `parcel(id)`, `household(id)`, `lot(id)`, `journalEntry(id)`, `diseaseReport(id)`, `cropCycle(id)`, each `Promise<void>`, throwing `NotFoundError`.

| Route or action | Guard |
| --- | --- |
| `farm/households/[id]` PUT | `household(id)` |
| `farm/parcels/[id]` PUT, DELETE | `parcel(id)` |
| `farm/parcels` POST | `household(body.household_id)` |
| `farm/parcels/[id]/soil-health` GET | `parcel(id)` |
| `parcels/[id]/approve-harvest` POST | `parcel(id)` |
| `parcels/[id]/latest-photo` GET | `parcel(id)` |
| `journal/[id]` PUT, DELETE | `journalEntry(id)` |
| `journal` POST | `parcel(body.parcel_id)` |
| `journal/batch-approve` POST | `journalEntry` for every id, before any write |
| `lots/[id]/export-qr` POST | `lot(id)` |
| `lots` POST | `parcel` for every parcel in the body |
| `officer/diseases/[id]/review` PUT | `diseaseReport(id)` |
| `schedule/harvest/[cycle_id]` PATCH | `cropCycle(cycle_id)` |
| `diagnosis` POST, `farmer/diagnosis/actions.ts` | `parcel(parcelId)` when given |

- [ ] **Step 1: Write failing tests**

```ts
test.each(['parcel','household','lot','journalEntry','diseaseReport','cropCycle'])('%s passes for the caller HTX')
test.each([...])('%s throws NotFoundError for another HTX')
test.each([...])('%s throws NotFoundError for a missing record')
test.each([...])('%s throws NotFoundError when the HTX link is null')   // Review Focus
```

In `tenant-isolation.test.ts`, one table-driven test per row of the table above, in the node Jest environment: the caller is an officer of `TC`, the record belongs to `LB`, and the expected result is status 404 with no repository write called. Add: `batch-approve` with one foreign id approves nothing (Review Focus).

- [ ] **Step 2: Run** `make test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the class and add each guard after the existing role check.
- [ ] **Step 4: Verify.** `make test` and `make lint` pass.
- [ ] **Step 5: Commit** `feat(web): check the HTX of a record before changing it`.

---

### Task 6: Core client and read adapters

**Files:**
- Create: `apps/web/src/infrastructure/core/core-gateway.client.ts`, `gateway-parcel-reader.ts`, `gateway-household-reader.ts`, `gateway-lot-reader.ts`, `gateway-journal-reader.ts`, `gateway-disease-report-reader.ts` in the same folder, with tests
- Modify: `apps/web/src/lib/api/withErrorHandler.ts`, `platform/hasura/metadata/databases/default/tables/*.yaml`, every caller listed in Step 4

**Interfaces:**
- Consumes: `getCoreToken()`, `Tenant`.
- Produces:
  - `class CoreGatewayClient` with `constructor(role: string, getToken?: () => Promise<string>, fetchImpl?: typeof fetch)` and `graphql<T>(query: string, variables?: object): Promise<T>`
  - `CoreUnavailableError`, in `src/domain/errors`, mapped to 503 `CORE_UNAVAILABLE`
  - Readers: `GatewayParcelReader implements Pick<ParcelPort,'findAll'|'findById'>`, `GatewayHouseholdReader implements Pick<HouseholdPort,'findAll'|'findById'>`, `GatewayLotReader implements Pick<LotPort,'findAll'|'findById'>`, `GatewayJournalReader implements Pick<JournalPort,'findAll'|'findById'>`, `GatewayDiseaseReportReader implements Pick<DiseaseReportPort,'findPendingReports'|'findHistoryByFarmer'>`; each takes a `CoreGatewayClient`

- [ ] **Step 1: Write failing tests**

```ts
test('graphql sends Authorization and x-hasura-role to CORE_GATEWAY_URL/api/data/graphql')
test('graphql throws CoreUnavailableError on a network error, timeout, 5xx, and a body with errors')
test('graphql throws CoreUnauthorizedError on 401')
test('graphql never returns partial data when errors is present')
test('withErrorHandler maps CoreUnavailableError to 503 CORE_UNAVAILABLE')
test.each(readers)('%s returns the same shape as its Prisma repository for the same fixture')
test.each(readers)('%s returns null fields for a null relationship and no crop cycle')  // Review Focus
test('journal findAll returns total from the aggregate')
```

- [ ] **Step 2: Run** `make test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** No HTX filter in the readers: Hasura applies it from the token. Date columns from Hasura are ISO strings; convert to whatever the port's type requires.
- [ ] **Step 4: Switch callers.** Every `GET` route and server-component page in `src/app/**` that calls one of the methods above moves to the reader: `api/farm/parcels`, `api/farm/households`, `api/farm/households/[id]`, `api/lots`, `api/lots/[id]`, `api/journal`, `api/officer/diseases`, `manager/zones`, `manager/lots`, `manager/lots/[lot_code]`, `officer/diseases`, `officer/households`, `farmer/diagnosis/actions.ts` (history), plus any others found by grepping those method names. Use cases that read before writing keep the Prisma repository.
- [ ] **Step 5: Hasura metadata.** Add only the array relationships the readers need (at least `parcels` to `parcel_crop_cycles`), and `allow_aggregations: true` on `journal_entries` select permissions for all three roles. Change no `filter`.
- [ ] **Step 6: Verify.** `make test`, `make lint`, `make platform-up && make platform-smoke`. Expected: all pass.
- [ ] **Step 7: Commit** `feat(web): read farm data through the core gateway`.

---

### Task 7: Disease API and chatbot through the gateway

**Files:**
- Modify: `apps/web/src/infrastructure/disease-api/disease-api.adapter.ts`, `apps/web/src/application/chatbot/ChatbotUseCase.ts`, their callers and tests

**Interfaces:**
- Consumes: `getCoreToken()`, `CORE_GATEWAY_URL`.

- [ ] **Step 1: Write failing tests**

```ts
test('predict posts to CORE_GATEWAY_URL/api/ai/disease/predict with the bearer token and a 60 s timeout')
test('chatbot without a Groq key uses CORE_GATEWAY_URL/api/ai/llm/v1 with the user token as API key and model qwen2.5:0.5b by default')
test('chatbot with a Groq key still uses Groq')
```

- [ ] **Step 2: Run** `make test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** The token is passed in by the caller, so the adapter and use case stay testable. Keep the existing response mapping.
- [ ] **Step 4: Verify.** `make test` and `make lint` pass.
- [ ] **Step 5: Commit** `feat(web): call disease detection and the local LLM through the gateway`.

---

### Task 8: Browser verification, CI and docs

**Files:**
- Create: `apps/web/tests/e2e/tenant/core-tenant.spec.ts`
- Modify: `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `docs/specs/2026-11-09-tier2a-core-integration-design.md`

- [ ] **Step 1: Write the spec**, skipped unless `E2E_CORE=1`, against a real `web` container and real Keycloak. Read `tests/e2e/auth.setup.ts` for the login steps; use the `manager_tc` and `manager_lb` users with password `Smoke-Pass-1` that the smoke test creates.

```ts
test('manager_tc sees household fixtures of TC and none of LB')
test('manager_lb sees household fixtures of LB and none of TC')
test('/api/auth/session contains no accessToken or refreshToken')
test('a session cookie survives an expired access token and the page still loads')
test('with Hasura stopped the list page shows the Vietnamese error and no rows')
```

Record the session cookie size in the test output.

- [ ] **Step 2: Run it** after `docker compose -f docker/docker-compose.yml up -d --build --wait web` and `make platform-smoke`, with `E2E_CORE=1 E2E_BASE_URL=http://localhost:3000`. Expected: PASS. The Hasura test must restart Hasura in a `finally` block.
- [ ] **Step 3: CI.** In the `platform-smoke` job, after "Platform Smoke Test", add steps that start `web`, install Chromium and run this spec. Run `actionlint`.
- [ ] **Step 4: Docs.** README: Tier 2 section on the session, `htx_code` and the internal port; note that `9081` must stay unpublished. `CHANGELOG.md` `[Unreleased]`: Added, Changed, Fixed, Upgrade notes (update the SSO session on a running realm, assign `htx_code` to existing accounts, run `migrate`). Spec: status line and "Ghi chú sau triển khai 2a" with differences from the design and measured durations.
- [ ] **Step 5: Full verification, two rounds.** The clean-database sequence twice, then `make test`, `make lint`, dataops and scanner unit tests in `python:3.12.15-slim-bookworm`, and `python3 platform/tests/test_realm_policy.py`. Expected: all pass; the 115 existing smoke assertions and the 405 existing web tests are still present and green.
- [ ] **Step 6: Commit** `docs(web): document Tier 2a and verify tenancy in the browser`.
- [ ] **Step 7: Ask the owner** before opening a PR, merging or tagging `v1.6.0`. Merge locally with `--no-ff`, never with `gh pr merge`.
