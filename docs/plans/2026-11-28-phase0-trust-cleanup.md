<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Phase 0 Trust Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenTea DX-OS honest before real tea cooperatives use it. Remove every fake screen and every fake data source, close the known tenant and security holes, keep food-safety and money decisions human-only, freeze the out-of-scope features behind one switch, and replace rice wording with tea wording.

**Architecture:**
- Removal means deleting the code.
- Freezing means one server-side switch `DXOS_LABS` (off by default), read by the web and by `dxos-agent`.
- Security fixes live in route handlers and use cases, each with a regression test.
- Four tracks with mostly disjoint files run in parallel, each in its own worktree branched from `feat/phase0-trust-cleanup`. The main session merges them, then one docs task and verification follow.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma 5, Jest and RTL, Playwright, Python 3 (`platform/agent`, `miniapps/custom-books`), n8n workflow JSON, Docker Compose, GitHub Actions.

**Spec:** `docs/specs/2026-11-28-phase0-trust-cleanup-design.md`. Read §4 and §7 of it before your track: §7 holds binding decisions.

## Global Constraints

- **Identifiers:** English only. Vietnamese appears only in user-facing copy.
- **Styling:**
  - No new inline `style={{...}}`.
  - Colours only through tokens.
  - Light and dark mode stay consistent.
  - No page-level horizontal overflow at 390 px. No text overlap.
- **Tests:** never delete or skip a test of a feature that stays. Tests of deleted code are deleted with it.
- **Freeze, don't delete:** do not delete code of a frozen feature (app factory, autopilot, strategy agent, MCP, staff sync).
- **Assets:** delete a static file under `apps/web/public` only when `grep -r` finds no remaining reference outside tests.
- **Migrations:** additive only, except the listed `market_data` deletions. Never run a migration against the owner's stack (compose project `docker`).
- **Commits:**
  - Small Conventional Commits in English, as `git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`.
  - No `Co-Authored-By` line and no AI mention.
  - Chain test, commit and push with `&&`.
- **Shared docs:** tracks A to D do not edit `CHANGELOG.md` or anything in `docs/`. Task E owns them.
- **Secrets:** never open or print `.env*` files or `docker/.env*`.
- **Docker:** do not start, stop or remove containers of compose project `docker`. Throwaway containers need unique names and ports on 127.0.0.1, and must be removed with `docker rm -f -v` afterwards.
- **Web checks from a track worktree:**
  - Run `cd apps/web && npx jest <path>` for focused runs.
  - Run `npm test -- --ci`, `npm run lint` and `npx tsc --noEmit` before reporting.
  - Python: `cd platform/agent && python -m pytest -q`; `cd miniapps/custom-books && python -m pytest -q`.

## Review Focus

1. **A bookmark to a deleted page** (`/farmer/reels`, `/forgot-pin`, `/officer/orders/ABC`, `/farmer/ai`, `/officer/assistant`) shows the normal 404 page, not a 500 and not a redirect loop. The middleware public-path list no longer names deleted pages. Owner: Task B5 adds a middleware unit test; the verification round loads each path.
2. **Server reads `DXOS_LABS` at request time.** The flag must change behaviour without a rebuild, so it is never inlined at build time and never `NEXT_PUBLIC_`. Owner: Task C2, test `isLabsEnabled reads the environment on every call`.
3. **The agent does not call frozen routes.** With `DXOS_LABS` unset, the agent never calls the autopilot tick, the strategy routes, the app-builder routes or the staff routes, so no 404 error spam and no health alerts. Owner: Task C3, Python test `test_frozen_cycles_do_not_run_without_labs`.
4. **Partner backfill when HTX `TC` is missing:**
   - several HTXs exist and none is `TC`: rows stay `NULL` and are invisible;
   - exactly one HTX: rows go to it.
   Owner: Task A2, checked by running the migration SQL on a throwaway Postgres in Task A2 Step 6.
5. **A `REQUEST_CHANGES` spraying journal still blocks harvest approval and lot creation; a `REJECTED` one does not.** Owner: Task A4 tests.

---

## Track A — Security and withdrawal rule (worktree branch `p0/a-security`)

### Task A1: Lock members and search for farmers

**Files:**
- Modify: `apps/web/src/app/api/members/route.ts` and every other `apps/web/src/app/api/members/**/route.ts` (check each one's role gate)
- Modify: `apps/web/src/app/api/search/route.ts`
- Modify: `apps/web/src/components/layout/TopBar/TopBar.tsx` (do not render `GlobalSearchInput` for role `farmer`; get the role the way TopBar or its parent already does)
- Test: `apps/web/src/__tests__/api/members-search-roles.test.ts` (new); extend `apps/web/src/__tests__/ui/` TopBar test if one exists, else add `topbar-farmer-search.test.tsx`

**Interfaces:** Consumes `requireTenant(): Promise<{ userId, role, htxCode, htxProfileId }>` from `@/lib/api/tenant`. On a wrong role, respond with the existing error envelope `{ error: { code: 'FORBIDDEN', message } }` and status 403, the way other routes do.

- [ ] **Step 1: Write the failing tests.** Mock the session the way `tenant-isolation.test.ts` does.
  - `GET /api/members as farmer answers 403 FORBIDDEN and never calls KeycloakAdminAdapter`.
  - `GET /api/members as officer of TC lists only TC members`.
  - `GET /api/search as farmer answers 403`.
  - `TopBar for a farmer renders no search input`.
- [ ] **Step 2:** Run `npx jest src/__tests__/api/members-search-roles.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement. Allowed roles: `manager`, `officer` for members GET and for search. Keep the existing roles on invite and approve routes; if any of them lacks a role gate, add the narrowest one the UI uses.
- [ ] **Step 4:** Run the tests. Expect PASS.
- [ ] **Step 5: Commit** `fix(api): keep the member list and search away from farmers`.

### Task A2: Partners belong to one cooperative

**Files:**
- Modify: `apps/web/prisma/schema.prisma`. Model `Partner` gets `htx_profile_id String?`, the relation `htx_profile HtxProfile? @relation(fields: [htx_profile_id], references: [id])`, and `@@index([htx_profile_id])`. `HtxProfile` gets the back-relation `partners Partner[]`.
- Create: `apps/web/prisma/migrations/20261128100000_partners_tenant/migration.sql`
- Modify: `apps/web/src/app/api/partners/route.ts`, `apps/web/src/app/api/partners/[id]/route.ts`, any partner geocode route under `app/api/partners/**`
- Modify: `apps/web/src/application/telegram/chat/tools/partners.ts`
- Modify: `apps/web/prisma/seed.ts` (seed partners get the TC profile id)
- Test: add rows to `apps/web/src/__tests__/api/tenant-isolation.test.ts`; new `apps/web/src/__tests__/api/partners-roles.test.ts`; extend the chat tool test for `partners` if one exists

**Interfaces:** Every partner query filters `where: { htx_profile_id: htxProfileId }`, with `htxProfileId` from `requireTenant()`. It never comes from the request body. A row with another or `NULL` `htx_profile_id` returns 404 `NOT_FOUND`.

- [ ] **Step 1: Write the failing tests.**
  - `tenant-isolation` rows: officer of TC reads and updates an LB partner, gets 404, and nothing is written. Do the same for DELETE as manager.
  - `partners-roles`:
    - `GET as farmer answers 403`;
    - `POST as officer answers 403`;
    - `POST as manager stores htx_profile_id of the caller even when the body names another`;
    - `GET as officer lists only partners of the caller's HTX`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3: Write `migration.sql`:**

```sql
ALTER TABLE "partners" ADD COLUMN "htx_profile_id" TEXT;
CREATE INDEX "partners_htx_profile_id_idx" ON "partners"("htx_profile_id");
ALTER TABLE "partners" ADD CONSTRAINT "partners_htx_profile_id_fkey"
  FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing partners were demo data: give them to HTX TC, or to the only HTX if there is exactly one.
UPDATE "partners" SET "htx_profile_id" = COALESCE(
  (SELECT "id" FROM "htx_profiles" WHERE "htx_code" = 'TC'),
  (SELECT "id" FROM "htx_profiles" WHERE (SELECT count(*) FROM "htx_profiles") = 1)
) WHERE "htx_profile_id" IS NULL;
```

  Check the real table and column names in `schema.prisma` (`@@map`) before running.
- [ ] **Step 4:** Implement the route and chat-tool filters and role gates: read is `manager` or `officer`; create, update, delete and geocode are `manager` only. Update the seed.
- [ ] **Step 5:** Run `npx prisma validate`, `npx prisma generate`, then the tests. Expect PASS.
- [ ] **Step 6: Check the migration on a throwaway database.** Start Postgres 16 with `docker run -d --name p0-pg-$RANDOM -p 127.0.0.1:55432:5432`. Apply all migrations with `DATABASE_URL=... npx prisma migrate deploy`. Insert 2 HTX rows (none `TC`) and 1 partner with `NULL`, re-run the `UPDATE`, and expect it to stay `NULL`. With exactly one HTX, expect the partner to get it. Remove the container with `docker rm -f -v`.
- [ ] **Step 7: Commit** `fix(partners): scope partners to the caller's cooperative`.

### Task A3: Remove the status override on `/q`

**Files:**
- Modify: `apps/web/src/app/q/[lot_code]/page.tsx` (remove `searchParams.status` and the override at lines 27 and 50-51)
- Test: an existing `/q` page test, or a new one under `apps/web/src/__tests__/app/`

- [ ] **Step 1: Write the failing test:** `ignores ?status=revoked and shows the lot's real status`.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expect PASS.
- [ ] **Step 5: Commit** `fix(trace): stop reading lot status from the URL`.

### Task A4: Rejected journals do not count toward the withdrawal period

**Files:**
- Create: `apps/web/src/domain/journal/withdrawal-status.ts`
- Modify:
  - `apps/web/src/application/farm/approve-harvest-usecase.ts`
  - `apps/web/src/application/lot/CreateLotUseCase.ts`
  - `apps/web/src/infrastructure/db/farm/PrismaCropCycleRepository.ts`
  - `apps/web/src/app/farmer/dashboard/page.tsx` (only the `withdrawalRows` query near line 121)
  - `apps/web/src/infrastructure/db/agent/PrismaCampaignCandidateSource.ts` (`withdrawalRows`)
  - `platform/agent/dxos_agent/agents/harvest_ready.py`
- Test:
  - `apps/web/src/__tests__/domain/withdrawal-status.test.ts` (new);
  - extend the existing tests of approve-harvest and CreateLot;
  - `platform/agent/tests/` test of `harvest_ready`.

**Interfaces (Produces):**
```ts
export const WITHDRAWAL_EXCLUDED_STATUSES = ['DRAFT', 'REJECTED'] as const
export function countsTowardWithdrawal(status: string): boolean
```
Prisma filters use `status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] }`. Python uses `status: {_nin: ["DRAFT", "REJECTED"]}` in the GraphQL query and the same set in the loop filter.

- [ ] **Step 1: Write the failing tests.**
  - `countsTowardWithdrawal` returns false for `DRAFT` and `REJECTED`, and true for `PENDING_APPROVAL`, `APPROVED` and `REQUEST_CHANGES`.
  - Approve-harvest:
    - `a REJECTED spraying entry with a future safe date does not block approval`;
    - `a REQUEST_CHANGES one still blocks`.
  - CreateLot: the same pair.
  - Python: `test_rejected_spraying_does_not_hold_back_harvest_ready`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement in all six places. Replace the comment at `approve-harvest-usecase.ts:28` with one stating the new rule.
- [ ] **Step 4:** Run them, plus `npx jest src/__tests__/application` and `python -m pytest -q` in `platform/agent`. Expect PASS.
- [ ] **Step 5: Commit** `fix(journal): leave rejected entries out of the withdrawal period`.

---

## Track B — Fake UI purge (worktree branch `p0/b-purge`)

Every task in this track runs the same check at the end:
- `npx jest` passes for the touched areas;
- `npx tsc --noEmit` and `npm run lint` are clean;
- `grep` finds no import of a deleted path.

### Task B1: Remove Reels from all roles

**Files:**
- Delete:
  - `apps/web/src/app/{farmer,officer,manager}/reels/`
  - `apps/web/src/components/features/reels/`
  - `apps/web/public/videos/shorts/` (only files with no remaining reference)
- Modify: menu entry "Reels" in `apps/web/src/app/{farmer,officer,manager}/layout.tsx`; any test, e2e or visual spec listing reels pages.

- [ ] **Step 1:** Delete the files and the menu entries.
- [ ] **Step 2:** Run the check. `grep -rn -i reels apps/web/src apps/web/tests` finds nothing outside history.
- [ ] **Step 3: Commit** `feat(web): remove the sample short-video feed`.

### Task B2: Officer shop and tour sample pages; one officer chatbot

**Files:**
- Delete:
  - `apps/web/src/app/officer/{products,orders,payments,tours,bookings}/`
  - `apps/web/src/app/officer/assistant/`
  - `apps/web/src/components/features/officer-web/sample.ts`
  - `apps/web/public/images/officer/products/` (only unreferenced files)
- Modify:
  - `apps/web/src/app/officer/layout.tsx`: drop the group "Gian hàng & tour" (Sản phẩm, Đơn hàng, Tour, Lượt đặt tour, Doanh thu) and the entry "Trợ lý TT"; keep "Chatbot".
  - `apps/web/src/app/officer/dashboard/page.tsx`: drop the "Gian hàng & Tour" panel and every `SampleTag`. If the "Bản đồ vùng chè" panel shows invented content, remove that content and keep only a link panel.
  - `apps/web/src/components/features/officer-web/parts.tsx`: drop the sample note.
  - Remove members of `officer-web/` that only the deleted pages used.

- [ ] **Step 1:** Delete and modify as above.
- [ ] **Step 2:** Update the tests that render the officer layout or dashboard: menu labels, absence of the panel.
- [ ] **Step 3:** Run the check.
- [ ] **Step 4: Commit** `feat(officer): remove the sample shop, tour and market assistant pages`.

### Task B3: Farmer screens show only real data

**Files:**
- Delete:
  - `apps/web/src/components/features/disease/CameraWatch.tsx` (and its CSS module if unused)
  - `apps/web/src/components/features/disease/sample-detections.ts`
  - `apps/web/src/components/features/farmer-web/TodayTasks.tsx`
  - `apps/web/src/app/farmer/ai/`
- Modify:
  - `apps/web/src/app/farmer/diagnosis/_components/DiagnosisClient.tsx`: drop `<CameraWatch />`.
  - `apps/web/src/app/farmer/dashboard/page.tsx`: drop `TodayTasks`, the "Báo cáo sâu bệnh" sample block, the `DETECTIONS` import and every chatbot invitation. Do not touch the `withdrawalRows` query, which Task A4 owns.
  - `apps/web/src/app/farmer/bulletin/page.tsx`, `apps/web/src/app/farmer/bulletin/[id]/page.tsx`, `apps/web/src/app/farmer/bulletin/_components/Newsroom.tsx`: real bulletins only, with an empty state. Remove the "Giá chè hôm nay" and "Đọc nhiều nhất" sample sections. `[id]` reads a real bulletin by id or calls `notFound()`; remove the sample articles.
  - `apps/web/src/app/farmer/handbook/_components/Handbook.tsx`: drop `SampleTag`; replace "biên soạn bởi cán bộ HTX" with "Tổng hợp từ tài liệu của cơ quan bảo vệ thực vật và các tạp chí khoa học (nguồn ghi ở từng bài)."; render the monthly advice block only when the current month has an entry.
  - `apps/web/src/app/farmer/layout.tsx`: drop the menu entry "Chatbot".
  - Every remaining farmer-facing link to `/farmer/ai`: `grep -rn "/farmer/ai" apps/web/src` must find none.

- [ ] **Step 1:** Delete and modify as above.
- [ ] **Step 2:** Update the farmer dashboard, diagnosis, bulletin and handbook tests. Add a test `farmer bulletin list shows the empty state when there is no bulletin`.
- [ ] **Step 3:** Run the check.
- [ ] **Step 4: Commit** `feat(farmer): remove sample tasks, cameras, detections, prices and the closed chatbot`.

### Task B4: Manager and shared sample blocks; delete the sample kit

**Files:**
- Delete:
  - `apps/web/src/components/features/sample/` (the whole folder)
  - `apps/web/src/components/features/certificate/CertificateManager.tsx`, if unused after the edits below
- Modify:
  - `apps/web/src/app/manager/dashboard/page.tsx`: drop `SampleYieldChart` and the action "Tạo lô hàng" (line 271). Keep "In tem QR".
  - `apps/web/src/app/manager/lots/[lot_code]/page.tsx` and `apps/web/src/app/manager/profile/page.tsx`: drop `CertificateManager`.
  - `apps/web/src/app/manager/app-store/_components/AppStoreClient.tsx`: drop `SampleApps`; keep the real empty state. Do not touch the "App do AI xây" label, which Task C2 owns.
  - `apps/web/src/components/features/partner-map/PartnerMap.tsx`: drop `PartnerFallback`; show an empty state "Chưa có đối tác nào. Bấm Thêm đối tác để bắt đầu." for managers. For officers, the same without the button sentence.
  - `apps/web/src/app/manager/farm-zones/_components/FarmZoneReadOnly.tsx`:
    - the block draws real parcels: keep it;
    - rename it "Sơ đồ thửa" and drop `SampleTag`;
    - move the inline `marginTop` and the `flex` style into the CSS module. The `flex` width depends on area: use a CSS custom property set through a `data-*` attribute or a small size class, with no inline `style`.
  - `apps/web/src/components/features/notification/NotificationInbox.tsx`: drop `SampleNotices`; use the existing empty state.

- [ ] **Step 1:** Delete and modify as above.
- [ ] **Step 2:** Update the tests of these components and pages. Add `NotificationInbox shows the empty state, not sample notices, when there is no notification`.
- [ ] **Step 3:** Run the check. `grep -rn "features/sample\|SampleTag\|SampleYieldChart\|PartnerFallback\|SampleNotices\|SampleApps" apps/web/src` finds nothing.
- [ ] **Step 4: Commit** `feat(manager): remove sample charts, apps, partners, notices and in-memory certificates`.

### Task B5: Remove the demo forgot-PIN page

**Files:**
- Delete: `apps/web/src/app/(auth)/forgot-pin/`
- Modify:
  - `apps/web/src/middleware.ts`: drop `/forgot-pin` from the public paths.
  - `apps/web/src/app/(auth)/login/_components/login-form.tsx` (lines 48 and 65) and `apps/web/src/app/unauthorized/page.tsx` (line 64): replace the links with the plain text "Quên mã PIN? Hãy liên hệ cán bộ HTX để được đặt lại.", without a link.
- Test: the middleware test, `middleware does not list deleted pages as public`, asserting `/forgot-pin` is no longer public. Update the login-form test (`data-testid` `forgot-pin-link` is gone; use `forgot-pin-note`).

- [ ] **Step 1:** Write the failing middleware and login-form assertions.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the check. Expect PASS.
- [ ] **Step 5: Commit** `feat(auth): replace the demo forgot-PIN flow with contact guidance`.

---

## Track C — Human-only safety and money; freeze switch (worktree branch `p0/c-freeze`)

### Task C1: Food safety and money are `never`

**Files:**
- Modify:
  - `apps/web/src/application/agent/actions/harvest-approve.action.ts`
  - `apps/web/src/application/agent/actions/journal-approve.action.ts`
  - `apps/web/src/application/agent/app-actions/AppActionCatalog.ts` (line 56: `money === true ? 'never' : 'auto'`)
  - `platform/postgres/init/08-agent.sql`: append an idempotent statement
- Test:
  - `apps/web/src/__tests__/application/agent/autopilot/eligibility.test.ts`
  - `autopilot-service.test.ts`
  - `apps/web/src/__tests__/app/api/agent-autopilot-routes.test.ts`
  - `internal-autopilot-tick.test.ts`
  - `apps/web/src/__tests__/components/autopilot-section.test.tsx`
  - catalogue test (test 19)

- [ ] **Step 1: Write the failing test** `food safety and money kinds are never autonomous`. Assert `harvest.approve` and `journal.approve` have `autonomy === 'never'`, and every app action built with `money: true` has `'never'`.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3:** Implement. Move existing tests that open `harvest.approve` as an unlockable example to `miniapp.install`.
- [ ] **Step 4:** Append to `08-agent.sql`:

```sql
-- Food safety and money are never autonomous (ADR 0005): drop stale unlocks.
UPDATE platform.autopilot
   SET unlocked_kinds = array(SELECT k FROM unnest(unlocked_kinds) AS k
                              WHERE k NOT IN ('harvest.approve', 'journal.approve'))
 WHERE unlocked_kinds && ARRAY['harvest.approve', 'journal.approve'];
```

  Money app kinds could never be unlocked (spec of M12), so no clean-up is needed for them; say so in the comment if you confirm it in the enable route.
- [ ] **Step 5:** Run the autopilot and catalogue tests. Expect PASS.
- [ ] **Step 6: Commit** `fix(agent): keep harvest, journal and money approvals human-only`.

### Task C2: `DXOS_LABS` switch in the web

**Files:**
- Create: `apps/web/src/lib/labs.ts`
- Modify (gate when off):
  - `apps/web/src/app/manager/ai/apps/page.tsx` and `apps/web/src/app/manager/ai/apps/[id]/` (call `notFound()`)
  - `apps/web/src/components/features/agent/ProposalInbox.tsx` (hide the app-request tab; the server passes a `labs` prop)
  - `apps/web/src/app/manager/ai/settings/page.tsx` (do not render `AutopilotSection`)
  - `apps/web/src/app/manager/app-store/_components/AppStoreClient.tsx` and the store detail component holding "App do AI xây" (hide the label and report link; the server passes `labs`)
  - Route handlers under `apps/web/src/app/api/agent/app-requests/**`, `apps/web/src/app/api/agent/autopilot/**`, `apps/web/src/app/api/internal/autopilot/**`, `apps/web/src/app/api/internal/agent/app-builder/**`, `apps/web/src/app/api/internal/agent/strategy/**`, `apps/web/src/app/api/mcp/**`, `apps/web/src/app/api/internal/staff/**`: answer 404 `NOT_FOUND` before any other work.
  - `apps/web/src/application/telegram/chat/router.ts` (intent `app.request`) and the `/tuvanhanh` handler in `apps/web/src/application/telegram/TelegramUpdateHandler.ts`: reply "Tính năng này chưa mở." Keep `/dung` working.
- Test:
  - `apps/web/src/__tests__/lib/labs.test.ts`
  - `apps/web/src/__tests__/app/api/labs-frozen-routes.test.ts` (table-driven over the route handlers above)
  - existing tests of frozen features set `process.env.DXOS_LABS = '1'` in `beforeEach` and restore it after

**Interfaces (Produces):**
```ts
/** Frozen features (ADR 0005) run only when DXOS_LABS is "1" or "true". Read at call time. */
export function isLabsEnabled(): boolean
export function labsNotFound(): NextResponse // { error: { code: 'NOT_FOUND', message } }, status 404
```

- [ ] **Step 1: Write the failing tests.**
  - `isLabsEnabled is false when DXOS_LABS is unset, empty or "0"`.
  - `isLabsEnabled is true for "1" and "true"`.
  - `isLabsEnabled reads the environment on every call`.
  - Table test: `<route> answers 404 without DXOS_LABS and does not touch the repository`, one row per route handler.
  - `manager AI settings page hides the autopilot section without DXOS_LABS`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Server components call `isLabsEnabled()`. Client components receive a boolean prop; never read `process.env` in a client component.
- [ ] **Step 4:** Run the full web suite (`npm test -- --ci`). The frozen features' own tests must still pass with the flag on.
- [ ] **Step 5: Commit** `feat(web): freeze the app factory, autopilot, strategy, MCP and staff sync behind DXOS_LABS`.

### Task C3: `DXOS_LABS` in the agent, compose and CI

**Files:**
- Modify: `platform/agent/dxos_agent/__main__.py`. A helper `labs_enabled() -> bool` with the same rule as the web. When off:
  - `staff_tasks_cycle`, `app_builder_cycle` and `strategy_cycle` are not run;
  - the autopilot tick is not posted.
- Modify: `docker/docker-compose.yml`: pass `DXOS_LABS: ${DXOS_LABS:-}` to services `web` and `dxos-agent`.
- Modify: `.env.example`: add `DXOS_LABS=` with the comment "Bật các tính năng đóng băng (xưởng mini-app, tự vận hành, agent chiến lược, MCP, đồng bộ nhân sự). Để trống trong triển khai chuẩn."
- Modify: `.github/workflows/ci.yml`: set `DXOS_LABS: '1'` in the env of the jobs Builder Smoke and Platform Smoke. These jobs exercise frozen features, so they must still pass.
- Test: `platform/agent/tests/test_labs.py`

- [ ] **Step 1: Write the failing tests.**
  - `test_labs_enabled_rule`: unset, empty and `"0"` give False; `"1"` and `"true"` give True.
  - `test_frozen_cycles_do_not_run_without_labs`: with a fake gateway that records calls, run one loop iteration. No call goes to `/api/internal/autopilot/tick`, `/api/internal/agent/strategy/*`, `/api/internal/agent/app-builder/*` or `/api/internal/staff/*`.
  - `test_frozen_cycles_run_with_labs`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `python -m pytest -q`. Expect PASS.
- [ ] **Step 5:** Run `docker compose -f docker/docker-compose.yml config -q`. Expect exit 0.
- [ ] **Step 6: Commit** `feat(agent): skip frozen jobs unless DXOS_LABS is on`.

---

## Track D — Data, custom-books, vocabulary (worktree branch `p0/d-data`)

### Task D1: Remove fake and off-domain market data

**Files:**
- Delete: `workflows/vietnam_market_sync.json`, `workflows/worldbank_sync.json`, `workflows/faostat_sync.json`, `workflows/nasa_power_sync.json`, `workflows/wto_tariffs.json`
- Modify: `workflows/comtrade_export_sync.json` (HS code `0902` only, in the request and in any code node that maps codes)
- Create: `apps/web/prisma/migrations/20261128110000_purge_market_data/migration.sql`
- Delete: `apps/web/src/domain/market/simulated-price.ts` and `apps/web/src/__tests__/domain/simulated-price.test.ts`
- Modify: every importer of `simulated-price` (`MarketSummaryWidget.tsx`, `app/manager/dashboard/page.tsx` price panel, chatbot or telegram market tool if they use it). With no rows, show the empty state "Chưa có dữ liệu giá."
- Modify: `apps/web/src/domain/document/document-namespace.ts` comment only (the reports folder is no longer written)
- Modify: `scripts/create-github-issues.ps1`, only if it lists deleted workflows as files to import

**Migration content:** delete rows of `market_data` where `source` is one of the exact values the five deleted workflows write. Read each file: `vietnam_market_sync` writes `'Mô phỏng (Toàn quốc)'` and `nasa_power_sync` writes `'NASA'`; take the others from the code nodes that set `source`. Also delete comtrade rows whose `commodity` is not tea; take the comtrade `source` value and its tea commodity name from the file. Write each literal in the SQL with a comment naming its workflow. No other deletions.

- [ ] **Step 1:** Write the failing test. Update the market widget and dashboard test: `shows "Chưa có dữ liệu giá." when there is no market row`, and `shows no "giá mô phỏng" label`.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3:** Implement the deletions, the comtrade narrowing and the migration.
- [ ] **Step 4:** Run the web suite and the n8n workflow lint the CI uses (`.github/workflows/ci.yml`, job "Lint n8n Workflows"; run its command locally).
- [ ] **Step 5:** Apply the migration on a throwaway Postgres together with Task A2's migration, as in Task A2 Step 6. Expect exit 0.
- [ ] **Step 6: Commit** `feat(data): remove simulated prices and off-domain market feeds`.

### Task D2: Remove the four core-duplicating book templates

**Files:**
- Modify:
  - `miniapps/custom-books/custom_books/book_templates.py` (drop `picking`, `spraying`, `fertilising`, `pest`)
  - `miniapps/custom-books/app.yaml` (`version: 0.3.0`; enum of `book.create.template` is `[cashbook, meeting, handover, visitors, blank]`; `description` and `store.about` no longer name spraying, fertilising, pest or picking)
  - `miniapps/custom-books/README.md`
  - `apps/web/src/application/appbuilder/AppBuilderAgentService.ts` (`BOOK_TEMPLATES`)
  - `platform/tests/smoke-apps.sh` (create the book from `meeting`; update the expected feed label)
  - `miniapps/custom-books/tests/*.py`, `platform/agent/tests/test_app_builder.py`, the web test of `AppBuilderAgentService`
  - `apps/web/tests/e2e/story/custom-books.spec.ts`, `apps/web/tests/visual/screens.spec.ts`, `apps/web/tests/tools/store-screenshots.spec.ts` ("Chấm công hái chè" becomes "Biên bản họp thành viên")
- Store screenshots `miniapps/custom-books/store/*.png`: re-shoot only if they show a removed template. Re-shooting needs a running stack; if you cannot run it, report it as a follow-up and do not edit the PNGs.

- [ ] **Step 1:** Update `test_fields.py` (exact set of 5 keys) and the agent tests. Expect FAIL.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Run `python -m pytest -q` in `miniapps/custom-books` and `platform/agent`; run `./dxos validate miniapps/custom-books`; run the web suite. Expect PASS.
- [ ] **Step 4: Commit** `feat(custom-books): drop templates that duplicate core records`.

### Task D3: Tea vocabulary

**Files:**
- Modify the label `SOWING: 'Gieo sạ'` to `SOWING: 'Trồng mới'` (and the `{ value: 'SOWING', label: ... }` options) in:
  - `apps/web/src/app/farmer/journal/_components/journal-prefill.ts`
  - `FarmerJournalList.tsx`
  - `apps/web/src/app/manager/journal-approve/_components/ApproveList.tsx`
  - `apps/web/src/app/lot/[lot_code]/_components/TraceView.tsx`
  - `apps/web/src/app/officer/journal/_components/{officer-journal-approval,JournalList,JournalForm}.tsx`
  - `apps/web/src/app/q/[lot_code]/page.tsx` (line 19 only; Task A3 owns lines 27-51)
  - `apps/web/src/components/features/officer-web/overview-data.ts`
  - `apps/web/src/application/agent/actions/journal-labels.ts`
  - any match in `platform/agent`
- Modify: `apps/web/src/components/features/schedule/HarvestCalendar.tsx` ("thửa ruộng" becomes "nương chè"); `apps/web/src/app/manager/members/_components/invitation-modal.tsx` (placeholder "VD: Xóm Hồng Thái, xã Tân Cương").
- Test: `apps/web/src/__tests__/content/no-rice-copy.test.ts`. Extend `RICE_WORDS` to `/lúa|gạo|ST25|Hè Thu|Đông Xuân|đạo ôn|xoài|Gieo sạ|thửa ruộng|\bẤp\s/i`.

- [ ] **Step 1:** Extend `RICE_WORDS`. Run it. Expect FAIL, listing the files above.
- [ ] **Step 2:** Replace the labels. Update the label assertions in existing tests.
- [ ] **Step 3:** Run the web suite. Expect PASS.
- [ ] **Step 4: Commit** `fix(copy): use tea wording instead of rice wording`.

---

## Integration (main session)

- [ ] Merge `p0/a-security`, `p0/b-purge`, `p0/c-freeze` and `p0/d-data` into `feat/phase0-trust-cleanup` in that order, each with `--no-ff`. Resolve conflicts by keeping both sides' intent. Expected overlaps: `farmer/dashboard/page.tsx` (A4 and B3), `AppStoreClient.tsx` (B4 and C2), `manager/dashboard/page.tsx` (B4 and D1), `q/[lot_code]/page.tsx` (A3 and D3).
- [ ] Run, from the integration worktree:
  - `make build`, `make test`, `make lint`;
  - `bash scripts/validate-structure.sh`;
  - `bash scripts/appkit-sync.sh --check`;
  - the Python suites.
  All must be green.

## Task E: Documentation (after integration; branch `feat/phase0-trust-cleanup`)

**Files:**
- `CHANGELOG.md` (Unreleased)
- `docs/deviation-register.md`
- `docs/rules-and-limits.md`
- `docs/database-schema.md`
- `docs/api-contract.md`
- `docs/miniapps.md`
- `docs/dev-setup.md`
- `docs/timelines/2026-11-28.md`

Content per spec §4.7.

- [ ] **Step 1: `docs/deviation-register.md`.** Set the status of DEV-007 and DEV-009 to `Fixed (GĐ0)`. Set DEV-008, DEV-010, DEV-014 and DEV-016 to `Partially fixed (GĐ0)`, with one line saying what remains and its phase.
- [ ] **Step 2: `docs/rules-and-limits.md`.**
  - §3.2: "Nhật ký `DRAFT` hoặc `REJECTED` không tính vào thời gian cách ly; `PENDING_APPROVAL`, `APPROVED`, `REQUEST_CHANGES` vẫn tính."
  - §4.2: matrix rows for members, search and partners.
  - Mark §3.14, §3.15, §3.17, §3.20 and §3.21 as "Đóng băng (ADR 0005): chỉ chạy khi `DXOS_LABS=1`."
  - Rule: "`harvest.approve`, `journal.approve` và mọi hành động có `money` luôn ở mức `never`."
- [ ] **Step 3:** `database-schema.md`: `partners.htx_profile_id`. `api-contract.md`: roles of members, search and partners; the frozen routes answer 404 without `DXOS_LABS`. `miniapps.md`: custom-books templates. `dev-setup.md`: `DXOS_LABS`; remove deleted workflows from any import list.
- [ ] **Step 4:** `CHANGELOG.md` Unreleased, sections Removed, Fixed, Changed, Security.
- [ ] **Step 5:** Append a timeline entry to `docs/timelines/2026-11-28.md`, append-only, in the format the file already uses.
- [ ] **Step 6:** Run `bash scripts/validate-structure.sh` and `python3 scripts/build-docs.py --selftest`. Expect `[OK]` and `selftest ok`.
- [ ] **Step 7: Commit** `docs: record phase 0 cleanup, freeze switch and fixed deviations`.

## Verification (main session, spec §6)

- [ ] Run the `grep` checks of spec §6 item 2. Expect no match.
- [ ] Do two rounds with headless Playwright against a throwaway web built from the branch:
  - widths 1366 and 390, light and dark;
  - every menu page of the three roles;
  - the deleted paths from Review Focus 1;
  - expect no 500, no overflow, no dead menu entry and no "Mẫu" badge.
- [ ] Push the branch and open the PR (no AI trailer in the body). Wait for CI 10/10 green on the exact head.
- [ ] Measure the RAM of the standard stack and record it in the timeline.
- [ ] Merge with `--no-ff` into `main` after review. Release `v1.18.0` per the project's release flow.
