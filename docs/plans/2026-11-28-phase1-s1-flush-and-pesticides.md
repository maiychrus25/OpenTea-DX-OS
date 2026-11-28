<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Phase 1 S1 — Plucking Flush and Pesticide Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tie every journal entry and lot line to one tea plucking flush, make withdrawal checks per flush, and make every spraying pick its withdrawal days from a pesticide catalogue that no channel can undercut.

**Architecture:** Two tracks run in parallel in separate worktrees.
- **Track BE** (backend) owns Prisma, migrations, domain, use cases, API routes, Telegram, the Python agents and Hasura.
- **Track UI** owns pages and components. It codes against the API contract in this plan and mocks `fetch` in its tests.

The main session merges BE first, then UI, then runs the integrated checks.

**Tech Stack:** Next.js 14 App Router, Prisma 5 / Postgres 16, zod, Jest + RTL, Playwright, Python 3 agents, Hasura v2 metadata, `idb-keyval`.

**Spec:** `docs/specs/2026-11-28-phase1-s1-flush-and-pesticides-design.md`. Read all of it. §7 overrides the earlier sections where they disagree.

## Global Constraints

- **Identifiers and copy:** English identifiers; Vietnamese only in user-facing copy (use the exact Vietnamese strings the spec quotes).
- **Routes:** use `withErrorHandler`, zod at the route, `requireTenant`, `TenantGuard`, and the envelope `{ data }` / `{ error: { code, message } }`.
- **Styling:** no inline `style`; tokens only; light and dark mode; no overflow at 390 px.
- **Migrations:** `migration.sql` files are tracked normally now (`.gitignore` whitelists them). Check `git status` shows them before committing.
- **Audit:** every new table goes into the array in `platform/postgres/init/03-audit-triggers.sql` **and** gets its `dxos_audit_row` trigger inside its migration. Copy the syntax from `apps/web/prisma/migrations/20261127190000_app_builder/migration.sql`.
- **Agent evidence:** never change agent evidence values or hashes (`application/agent/actions/journal-evidence.ts`, `platform/agent/dxos_agent/evidence.py`, `platform/agent/tests/fixtures/evidence-vectors*.json`).
- **Tests:** never delete or skip a test of kept behaviour. Update tests whose expectations the spec changes, and say so in the commit body.
- **Commits:** `git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`; English Conventional Commits; no Co-Authored-By; no AI mention; no push.
- **Secrets and Docker:** never open `.env*`. Docker only for a throwaway Postgres with a unique name on 127.0.0.1, removed with `docker rm -f -v`. Never touch compose project `docker` containers. Do not run `./dxos`.
- **Checks before reporting:**
  - `cd apps/web && npm test -- --ci && npm run lint && npx tsc --noEmit` (run `npx prisma generate` first after schema changes);
  - for BE also `python -m pytest -q` in `platform/agent` and `python -m pytest -q platform/tests/test_hasura_agent_permissions.py`.
  - Use the venv at `/private/tmp/claude-501/-Users-maiychrus-OpenTea-DX-OS/b292ad45-1d8d-4b4a-93e8-fa34276aacfc/scratchpad/venv-p0d` for Python.

## API contract (shared by both tracks; BE implements, UI consumes)

```ts
// GET /api/pesticides?q=&target=     roles farmer|officer|manager
type PesticideRow = {
  id: string; trade_name: string; active_ingredient: string
  group: 'BOTANICAL'|'MICROBIAL'|'BIOLOGICAL'|'CHEMICAL'|'ANTIBIOTIC'
  targets: string[]; default_phi_days: number; floor_days: number
  label: { label_phi_days: number; label_note: string | null; verified_at: string } | null
  needs_label_check: boolean
}
// -> { data: PesticideRow[] }   (farmer: household's recently used first)

// PUT /api/pesticides/[id]/label   roles officer|manager
// body { label_phi_days: 1..365, label_note?: string<=200 }
//   (label_note required when label_phi_days < default_phi_days)
// -> { data: PesticideRow }
// DELETE /api/pesticides/[id]/label -> { data: PesticideRow }

// POST /api/journal  (existing) activity gains: activity_type incl. 'PRUNING', pesticide_product_id?: string
//   body gains client_id?: uuid. 200 returns the existing entry on a duplicate (submitted_by_id, client_id).
//   422 { error: { code: 'WITHDRAWAL_BELOW_FLOOR', message } }
//   when withdrawal_days < floor (message quoted in spec §4.2).
// PUT /api/journal/[id]  (existing) body may carry activities (replace all), entry_date, observation,
//   photo_url, photo_minio_key, submit?: boolean
// GET /api/journal entries expose cycle_id, client_id; activities expose pesticide_product_id.

// POST /api/parcels/[id]/approve-harvest  -> { data: { parcel } } | { error: { code, message } }
//   roles officer|manager
// GET /api/schedule/harvest (existing) each event also returns:
//   cycleId, parcelId, parcelStatus, safeHarvestDate, canApprove: boolean

// PUT /api/officer/diseases/[id]/review (existing) body gains
//   prescription?: { pesticide_product_id: string, dosage?: string<=100 }  (only with status CONFIRMED)
//   -> response data gains draftJournalEntryId?: string
```

## Review Focus

1. **A spraying with `withdrawal_days: 0` or a blank days field on any channel:**
   - Expected: the floor applies (it is filled when missing; 422 when below the floor). It must never be stored as null or 0.
   - Owner: BE Task 2, test `create rejects or fills withdrawal below floor on every channel`.
2. **A care entry logged on a HARVESTED parcel whose last flush closed today, with `entry_date` = harvest day:**
   - The rule is `entry_date > harvested_at`, so an entry on the harvest day belongs to the closed flush.
   - Owner: BE Task 3, test `entry on the harvest day stays in the closed flush`.
3. **Two offline submissions replayed twice (flaky network):** exactly two entries exist.
   - Owner: BE Task 2 test `duplicate client_id from the same sender returns the first entry`; UI Task 3 test `queue replays each item once`.
4. **The farmer confirms a prescription draft ("Đã phun") on a parcel that has been harvested since the prescription:**
   - Expected: the draft gets the open (next) flush per §7.3 when its `entry_date` is after the harvest.
   - Owner: BE Task 3, test `submitting a draft assigns the flush by entry_date`.
5. **An HTX label below the default without a note:**
   - Expected: 422 from the API and an inline error in the UI.
   - Owner: BE Task 4 and UI Task 4.

---

## Track BE (worktree branch `p1/s1-be`)

### Task 1: Schema, migrations, catalogue seed, audit

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create two migrations:
  - `apps/web/prisma/migrations/20261128120000_activity_pruning/migration.sql` (only `ALTER TYPE "ActivityType" ADD VALUE 'PRUNING';`)
  - `apps/web/prisma/migrations/20261128120100_flush_and_pesticides/migration.sql`
- Modify: `platform/postgres/init/03-audit-triggers.sql`, `apps/web/prisma/seed.ts`
- Modify Hasura: `platform/hasura/metadata/databases/default/tables/public_journal_entries.yaml` and `public_journal_activities.yaml` (agent columns `cycle_id`, `pesticide_product_id`); `platform/tests/test_hasura_agent_permissions.py` (`EXPECTED_COLUMNS`)

**What to build:**
- **Prisma:** everything in spec §4.1, with `@@unique([submitted_by_id, client_id])` on `JournalEntry` (spec §7.8).
- **Second migration, in order:**
  1. Create the enum, the tables and the columns.
  2. Insert the 20 catalogue rows from spec Appendix A with group and `default_phi_days` per §4.1 (exact trade names, ingredients and source text; `targets` per §4.1).
  3. Backfill `cycle_id` for `journal_entries` and `lot_parcels` (rules in spec §4.1 "Gán lứa cho dữ liệu cũ").
  4. Attach the audit triggers to the two new tables.
- **Seed:** the TC-A3 entries get the cycle ids (3 previous, 2 current). The two seeded sprayings link a catalogue product only if their product name equals a `trade_name`.

- [ ] **Step 1:** Write `apps/web/src/__tests__/db/schema-phase1-s1.test.ts`. Read the schema text and assert `PRUNING` in `ActivityType`, models `PesticideProduct` and `HtxPesticideLabel`, `cycle_id` on `JournalEntry` and `LotParcel`, and `@@unique([submitted_by_id, client_id])`. Read the migration SQL and assert exactly 20 `INSERT` value rows, no `Catex 100WG`, no `Antracol 700WG`, and `dxos_audit_row` for both tables.
- [ ] **Step 2:** Run it. Expect FAIL.
- [ ] **Step 3:** Implement the schema, migrations, init SQL array, seed and Hasura metadata.
- [ ] **Step 4:** Run `npx prisma validate && npx prisma generate`, the test, and the Hasura pytest. Expect PASS.
- [ ] **Step 5: Throwaway Postgres check.**
  - Start a unique container, then `prisma migrate deploy`.
  - Run `seed`: `select count(*) from pesticide_products` must be 20, and journal entries with a null `cycle_id` must be 0 for parcels that have cycles.
  - Triggers present: `select tgname from pg_trigger where tgrelid='public.pesticide_products'::regclass`.
  - Remove the container.
- [ ] **Step 6: Commit** `feat(db): add plucking flush links and the pesticide catalogue`.

### Task 2: Withdrawal floor in every write path, idempotent create, full edit and submit

**Files:**
- Create: `apps/web/src/domain/journal/withdrawal-floor.ts` (signature in spec §4.2)
- Create: `apps/web/src/infrastructure/db/pesticide/PrismaPesticideRepository.ts`
- Create: a port in `domain/pesticide/ports/PesticidePort.ts` with:
  - `floorFor(productId: string, htxProfileId: string): Promise<{ productId: string; floorDays: number } | null>`
  - `matchByTradeName(name: string): Promise<string | null>`
  - `list(htxProfileId: string, opts: { q?: string; target?: string; householdId?: string }): Promise<PesticideRow[]>`
  - `setLabel(...)` and `clearLabel(...)`
- Modify:
  - `application/journal/CreateJournalEntryUseCase.ts` and `UpdateJournalEntryUseCase.ts`
  - `infrastructure/db/journal/PrismaJournalRepository.ts` (`create` gains `client_id` and `pesticide_product_id`; `update` replaces activities and handles `submit`)
  - `lib/validations/journal.schema.ts`
  - `app/api/journal/route.ts` and `app/api/journal/[id]/route.ts`
  - `infrastructure/core/gateway-journal-reader.ts`, `domain/journal/ports/JournalPort.ts`
  - `application/telegram/chat/actions/journal-create.ts` (adds `PRUNING`; replies with the 422 message)

**Interfaces (Produces):** `resolveWithdrawal`, `CUSTOM_PRODUCT_FLOOR_DAYS = 14`, `PesticidePort` as above.

- [ ] **Step 1: Write failing tests.**
  - `domain/withdrawal-floor.test.ts`:
    - product with floor 14 and requested 7 gives `WITHDRAWAL_BELOW_FLOOR`;
    - requested null gives 14;
    - custom product with requested null gives 14;
    - an HTX label of 5 makes the floor 5.
  - `application/journal/create-withdrawal-floor.test.ts`, test `create rejects or fills withdrawal below floor on every channel`: one case each for web farmer, web officer, Telegram action, and a SPRAYING with no product. Each blocks or fills, and the stored days are never null.
  - `api/journal-client-id.test.ts`, test `duplicate client_id from the same sender returns the first entry`: the second call returns 200 with the same id and no second insert.
  - `application/journal/update-resubmit.test.ts`:
    - a REQUEST_CHANGES entry with new activities and `submit: true` becomes PENDING_APPROVAL, `review_note` and `reviewed_by_id` are cleared, and the officer is notified;
    - a notes-only PUT on an old spray below the floor succeeds;
    - a farmer submitting an officer-authored DRAFT on their household becomes the submitter.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement. Telegram matches the product by trade name through `matchByTradeName`.
- [ ] **Step 4:** Run them, plus the existing journal and Telegram suites. Expect PASS.
- [ ] **Step 5: Commit** `feat(journal): enforce the pesticide withdrawal floor and allow full resubmission`.

### Task 3: Flush assignment and per-flush withdrawal checks

**Files:**
- Modify:
  - `infrastructure/db/farm/PrismaCropCycleRepository.ts` (`ensureOpenCycle(tx, parcelId, now)`, `cycleForEntryDate(tx, parcelId, entryDate)`, idempotent `startNextRound`, per-cycle `getHarvestSchedule` that returns the contract fields)
  - `infrastructure/db/journal/PrismaJournalRepository.ts` (assignment at create and submit per spec §7.2-7.3; `applyParcelStatus` closes the entry's own flush)
  - `application/farm/approve-harvest-usecase.ts`
  - `app/api/parcels/[id]/approve-harvest/route.ts` (`withErrorHandler`, envelope, role gate)
  - `application/lot/CreateLotUseCase.ts`, `infrastructure/db/lot/PrismaLotRepository.ts` (write `lot_parcels.cycle_id`)
  - `infrastructure/db/repositories/prisma-lot-trace-repository.ts`, `application/lot/ExportQrUseCase.ts`
  - `app/api/schedule/harvest/route.ts`
- Tests:
  - `application/farm/flush-assignment.test.ts`, with `entry on the harvest day stays in the closed flush` and `submitting a draft assigns the flush by entry_date`;
  - `application/farm/per-flush-withdrawal.test.ts`;
  - update `approve-harvest-usecase.test.ts`, `create-lot-usecase.test.ts`, `export-qr-usecase.test.ts`, `lot-trace-withdrawal.test.ts`, and `ParcelStatusDerivation.test.ts` if it pins the "latest cycle" rule.

- [ ] **Step 1: Write failing tests.**
  - Care on a parcel with a closed flush opens the next flush, and the parcel status stays HARVESTED until approval.
  - A DRAFT gets no flush.
  - A backdated spray before the harvest belongs to the closed flush and blocks that flush's lot.
  - A spray of flush N+1 does not block approve-harvest, lot creation or QR export of flush N.
  - A spray of the same flush blocks them.
  - A parcel without cycles uses the legacy parcel-wide path with no new error.
  - The approve-harvest route returns the envelope and 403 for farmer.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them plus the full web suite. Expect PASS.
- [ ] **Step 5: Commit** `feat(farm): assign journal entries and lot lines to plucking flushes and check withdrawal per flush`.

### Task 4: Pesticide API and disease prescription

**Files:**
- Create: `app/api/pesticides/route.ts`, `app/api/pesticides/[id]/label/route.ts`
- Modify: `app/api/officer/diseases/[id]/review/route.ts`, `application/disease/review-disease-report.usecase.ts` (create the DRAFT spraying in the same transaction, notify the farmer with the spec text)
- Modify: `__tests__/api/tenant-isolation.test.ts` (rows for the new routes), `application/telegram/coverage.ts` (classify the new routes)
- Tests: `api/pesticides-routes.test.ts`, `application/disease/prescription.test.ts`

- [ ] **Step 1: Write failing tests.**
  - Roles: GET allows farmer, officer and manager. PUT and DELETE allow officer and manager; farmer gets 403.
  - A label below the default without a note gives 422.
  - A label is per HTX: TC's label is not visible to LB.
  - Farmer ordering puts recently used products first.
  - A prescription creates exactly one DRAFT SPRAYING with the floor days and the notes text.
  - A prescription is rejected unless the status is CONFIRMED.
  - A DRAFT does not count toward withdrawal.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expect PASS.
- [ ] **Step 5: Commit** `feat(pesticides): catalogue API, HTX labels and disease prescriptions`.

### Task 5: Agents per flush

**Files:**
- Modify: `platform/agent/dxos_agent/agents/harvest_ready.py`, `platform/agent/dxos_agent/agents/journal_review.py`
- Modify tests: `platform/agent/tests/test_harvest_ready_withdrawal.py`, `test_journal_review.py`, `scenarios/a1_journal_review.json` and `a4_harvest_ready.json` only if their expected output changes because of the flush rule; explain any change in the commit.

**What to build:**
- A4 queries `cycle_id` and counts only sprayings whose `cycle_id` equals the open cycle it evaluates (null-cycle entries count, as the legacy path).
- A1 compares a spray only with the harvest date of its own flush (`cycle_id`), with the legacy fallback for null.
- The A1 rule set adds a warning reason for "Thuốc ngoài danh mục" (an activity with no `pesticide_product_id`) that never auto-approves.

- [ ] **Step 1:** Write failing tests `test_spray_of_next_flush_does_not_hold_back_harvest_ready` and `test_journal_review_compares_with_own_flush`.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `python -m pytest -q` (agent) and `make benchmark`, if it runs offline with the replay provider. Expect PASS.
- [ ] **Step 5: Commit** `feat(agent): evaluate harvest readiness and journal reviews per plucking flush`.

---

## Track UI (worktree branch `p1/s1-ui`)

Code against the API contract above; mock `fetch` in unit tests. Do not edit Prisma, migrations, routes, use cases or Python.

### Task 1: PesticidePicker and the journal forms

**Files:**
- Create: `apps/web/src/components/features/pesticide/PesticidePicker.tsx` (+ `.module.css`)
- Modify: `app/farmer/journal/_components/FarmerJournalForm.tsx`, `app/officer/journal/_components/JournalForm.tsx` (adds the missing withdrawal field through the picker)
- Modify: every activity label table listed in spec §4.6 (add `PRUNING: 'Đốn chè'`)
- Tests: `components/pesticide-picker.test.tsx`, `app/farmer/farmer-journal-form.test.tsx`, `app/officer/officer-journal-form.test.tsx`

**Interfaces (Produces):**

```ts
export function PesticidePicker(props: {
  value: { productId: string | null; customName: string; days: number | null }
  onChange: (v: { productId: string | null; customName: string; days: number | null; floorDays: number }) => void
  target?: string; disabled?: boolean
}): JSX.Element
```

- [ ] **Step 1: Write failing tests.**
  - Choosing a product fills the days with its `floor_days`.
  - Typing days below the floor shows "Thời gian cách ly không được thấp hơn {n} ngày" and disables submit.
  - "Thuốc khác" locks the floor at 14.
  - `needs_label_check` shows "Mức sàn mặc định — cần đối chiếu nhãn thực tế".
  - The officer form sends `withdrawal_days` and `pesticide_product_id` for SPRAYING.
  - "Đốn chè" is selectable in both forms.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expect PASS.
- [ ] **Step 5: Commit** `feat(journal-ui): pick pesticides from the catalogue in the journal forms`.

### Task 2: Edit and resubmit, confirm a prescription draft

**Files:**
- Create: `app/farmer/journal/[id]/edit/page.tsx`
- Modify: `app/farmer/journal/_components/FarmerJournalList.tsx` (buttons "Sửa lại" for REQUEST_CHANGES or REJECTED, "Đã phun" for DRAFT)
- Modify: `FarmerJournalForm.tsx` (an `initial` entry and a submit mode)
- Tests: `app/farmer/journal-edit.test.tsx`

- [ ] **Step 1: Write failing tests.**
  - "Sửa lại" opens the prefilled form, and "Gửi lại" sends PUT with activities and `submit: true`.
  - "Đã phun" defaults the date to today and sends `submit: true`.
  - A 422 shows the server message.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expect PASS.
- [ ] **Step 5: Commit** `feat(farmer): edit and resubmit returned journals and confirm prescribed sprayings`.

### Task 3: Offline journal queue

**Files:**
- Create: `apps/web/src/lib/hooks/useJournalOfflineQueue.ts`
- Modify: `FarmerJournalForm.tsx`, `FarmerJournalList.tsx` (pending count and the "Chưa gửi được" list)
- Test: `lib/hooks/__tests__/useJournalOfflineQueue.test.ts`

**Interfaces (Produces):**

```ts
export function useJournalOfflineQueue(): {
  pending: number
  failed: Array<{ client_id: string; last_error: string }>
  enqueue(payload: JournalPayload, photo?: Blob): Promise<void>
  flush(): Promise<void>
  discard(clientId: string): Promise<void>
}
```

Every submit generates a `client_id` (`crypto.randomUUID()`) once and reuses it on every retry.

- [ ] **Step 1: Write failing tests** with a mocked `idb-keyval` and `fetch`:
  - `queue replays each item once`;
  - a 4xx keeps the item with `last_error`;
  - a 5xx or network error keeps it for a later retry;
  - the photo uploads before the POST;
  - nothing reloads the page;
  - the catalogue is cached for offline picking.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them. Expect PASS.
- [ ] **Step 5: Commit** `feat(farmer): queue journal entries offline and send them once`.

### Task 4: Catalogue page, harvest approval button, prescription UI

**Files:**
- Create: `app/officer/pesticides/page.tsx`, `app/manager/pesticides/page.tsx` (shared component `components/features/pesticide/PesticideCatalogue.tsx`)
- Add the menu entry "Danh mục thuốc" in `app/officer/layout.tsx` and `app/manager/layout.tsx`
- Create: `components/features/schedule/ApproveHarvestButton.tsx`; use it in `components/features/schedule/HarvestCalendar.tsx` (event detail) and `app/officer/households/[id]/_components/household-profile.tsx`
- Modify: `app/officer/diseases/[id]/page.tsx` (optional "Kê đơn (tuỳ chọn)" section)
- Tests: `components/pesticide-catalogue.test.tsx`, `components/approve-harvest-button.test.tsx`, `ui/disease-prescription.test.tsx`

- [ ] **Step 1: Write failing tests.**
  - The label dialog: below the default it requires a note and shows the confirmation text from spec §7.1.
  - The approve button is disabled with "Còn {n} ngày cách ly (an toàn từ dd/MM/yyyy)" when `canApprove` is false.
  - The approve button asks for confirmation with the spec text, then POSTs and refreshes.
  - The prescription section sends `prescription` only with CONFIRMED.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run them plus the full web suite, lint and tsc. Expect PASS.
- [ ] **Step 5: Commit** `feat(web): pesticide catalogue page, harvest approval button and prescriptions`.

## Integration (main session)

- Merge `p1/s1-be`, then `p1/s1-ui`, into `feat/phase1-value-chain`.
- Run every check in Global Constraints, `npx next build`, and the migration on a throwaway copy of the 1.17.0 backup.
- Do two UI rounds per spec §6.4, including a Playwright offline simulation (`context.setOffline(true)`).
- Docs task: rules-and-limits §3.2 and §3.5, database-schema, api-contract, CHANGELOG, the spec status line and the timeline entry.
