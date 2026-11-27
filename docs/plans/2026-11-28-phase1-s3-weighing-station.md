<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Phase 1 S3 — Daily Leaf Price and Weighing Station Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cooperative head publishes today's leaf price per grade in one tap. The accountant writes fresh-leaf tickets tied to household, parcel and flush. The server refuses any ticket for a parcel inside its withdrawal period.

**Architecture:** Track BE (Sonnet) and track FE (Codex) run in parallel in separate worktrees. BE implements the API contract below and FE codes against it with mocked `fetch`. Both branch from `feat/phase1-value-chain` after S1 and S2 have merged.

**Tech Stack:** Next.js 14 App Router, Prisma 5 / Postgres 16, zod, Jest + RTL.

**Spec:** `docs/specs/2026-11-28-phase1-s3-weighing-station-design.md`. Read it all; §7 overrides earlier sections. It relies on S1 spec §7.10 (open-parcel withdrawal rule) and the S2 roles.

## Global Constraints

- Same rules as the S1 plan's Global Constraints: routes with `withErrorHandler`, zod and the envelope; English identifiers; Vietnamese copy verbatim; tokens; light and dark; 390 px; no inline style; commit identity `maiychrus25`; no AI trailer; no push; never open `.env*`; no `./dxos`.
- Money is an integer VND (`Int` per kg, `BigInt` amounts); kg is `Decimal(7,1)`. No floats for money.
- Dates are Vietnam calendar days (`Asia/Ho_Chi_Minh`). Reuse the existing local-day helpers (search for `Asia/Ho_Chi_Minh` in `apps/web/src`).
- Audit: every new table goes into the `03-audit-triggers.sql` array and gets its trigger inside the migration.
- Every new route gets a row in `__tests__/api/tenant-isolation.test.ts` and in `application/telegram/coverage.ts`.
- Withdrawal check: use the S1 shared function for the open-parcel rule (find it in `infrastructure/db/journal` or `domain/journal`; S1 added it after the owner's correction). Do not write a second copy.

## API contract (BE implements, FE consumes)

```ts
// GET  /api/leaf-grades                          -> { data: { id, name, sort_order, active }[] }
// POST /api/leaf-grades   (manager) { name, sort_order? }               -> { data: grade }
// PUT  /api/leaf-grades/[id] (manager) { name?, sort_order?, active? }  -> { data: grade }
// GET  /api/leaf-prices/today
//   -> { data: { date: 'YYYY-MM-DD', published_at: string|null,
//               prices: { grade_id, grade_name, price_vnd_per_kg: number|null, yesterday_vnd_per_kg: number|null }[] } }
// PUT  /api/leaf-prices/today (manager) { prices: { grade_id, price_vnd_per_kg: 1..10000000 }[] }  -> same shape as GET
// GET  /api/parcels/[id]/withdrawal-status       -> { data: { blocked: boolean, safe_from: 'YYYY-MM-DD'|null } }
// POST /api/leaf-tickets (accountant|manager) { household_id, parcel_id, grade_id, gross_kg, deduction_pct, client_id? }
//   -> 201 { data: Ticket }
//   409 PARCEL_IN_WITHDRAWAL { error: { code, message, safe_from } } | 409 NO_PRICE_TODAY
// Ticket = { id, ticket_no, household_id, household_name, parcel_id, parcel_code, cycle_id, grade_id, grade_name,
//            weighed_at, gross_kg, deduction_pct, net_kg, price_vnd_per_kg, amount_vnd: string,
//            status: 'VALID'|'VOIDED', void_reason, settlement_id }
//   amount_vnd is a decimal string (BigInt).
// GET  /api/leaf-tickets?date=&household_id=&status=&cursor=  -> { data: Ticket[], next_cursor: string|null, totals: { net_kg, amount_vnd } }
// GET  /api/leaf-tickets/[id] -> { data: Ticket }
// POST /api/leaf-tickets/[id]/void (accountant|manager) { reason: 3..200 } -> { data: Ticket } | 409 TICKET_SETTLED
// GET  /api/leaf-tickets/export.csv?from=&to=  (manager|accountant)
// GET  /api/leaf-tickets/mine (farmer) -> { data: Ticket[] }
// GET  /api/cycles/[id]/weighing-summary (manager|officer) -> { data: { ticket_net_kg, journal_fresh_leaf_kg } }
// GET  /api/households?q=  (existing or new; accountant needs search) -> household id, name, phone, parcels { id, parcel_code }
```

## Review Focus

1. **A spraying journal still PENDING_APPROVAL with a safe date after today:** must block the ticket. Owner: BE Task 2, test `pending spray blocks weighing`.
2. **Weighing on the exact safe day:** allowed. Owner: BE Task 2.
3. **Two tickets at the same second:** consecutive numbers, no duplicate. Owner: BE Task 2, test with `Promise.all`.
4. **A spray journal created while a ticket for the same parcel is being written:** the parcel row lock serialises them. Owner: BE Task 2 (lock in both transactions).
5. **Deduction at the bounds (0 and 30) and rounding of net kg and amount:** Owner: BE Task 1, `computeTicket` tests.

---

## Track BE (branch `p1/s3-be`)

### Task 1: Schema, migration, ticket maths, seed

**Files:**
- `apps/web/prisma/schema.prisma`: `LeafGrade`, `DailyLeafPrice`, `FreshLeafTicket` (spec §4.1 with §7.3: nullable `cycle_id`; `settlement_id String?` without a foreign key yet)
- Create `apps/web/prisma/migrations/20261128140000_weighing_station/migration.sql` (tables, indexes, audit triggers)
- `platform/postgres/init/03-audit-triggers.sql` (add the three tables)
- `apps/web/prisma/seed.ts` (three grades for TC)
- Create `apps/web/src/domain/weighing/ticket-math.ts` with `computeTicket({ grossKg, deductionPct, priceVndPerKg }: { grossKg: number; deductionPct: number; priceVndPerKg: number }): { netKg: number; amountVnd: bigint }`
- Tests: `domain/ticket-math.test.ts`; `db/schema-phase1-s3.test.ts`

Steps:
- [ ] Write failing tests:
  - `computeTicket({ 100, 0, 15000 })` gives `{ 100, 15000000n }`;
  - `({ 100, 5, 15000 })` gives `{ 95, 1425000n }`;
  - `({ 12.3, 7.5, 13000 })` gives netKg `11.4` (one decimal, round half up) and amountVnd `148200n`;
  - deduction above 30 or below 0 throws;
  - the schema test asserts the models and the audit triggers.
- [ ] Implement.
- [ ] Run the tests: PASS.
- [ ] Run the migration on a throwaway Postgres together with all earlier migrations.
- [ ] Commit `feat(weighing): leaf grades, daily prices and fresh-leaf tickets schema`.

### Task 2: Use cases and routes

**Files:**
- Create the use cases `PublishDailyPricesUseCase`, `CreateFreshLeafTicketUseCase` and `VoidFreshLeafTicketUseCase` under `application/weighing/`, with a port in `domain/weighing/ports/` and a Prisma repository in `infrastructure/db/weighing/`.
- Create every route of the contract.
- Add the parcel row lock (`SELECT id FROM parcels WHERE id = $1 FOR UPDATE` via `tx.$queryRaw`) to the ticket transaction and to `PrismaJournalRepository.create`.
- Ticket number: `{HTX_CODE}-PC-{YYYYMMDD}-{NNN}` under `pg_advisory_xact_lock(hashtext('leaf-ticket:' || htx_code || ':' || day))`.

Steps:
- [ ] Write failing tests:
  - `pending spray blocks weighing` (409 with `safe_from`, no row written);
  - an approved spray with safe date tomorrow blocks;
  - weighing on the safe day itself is allowed;
  - a previous-flush spray still inside withdrawal blocks;
  - a future-dated spray does not block today;
  - a DRAFT or REJECTED spray does not block;
  - no price gives 409 `NO_PRICE_TODAY`;
  - concurrent tickets get consecutive numbers;
  - voiding a settled ticket gives 409;
  - `client_id` replay returns the first ticket;
  - roles: farmer cannot create or void, officer cannot create;
  - other HTX gives 404;
  - publish is an upsert;
  - CSV escapes formulas;
  - `mine` returns only the farmer's households.
- [ ] Implement.
- [ ] Run the tests and the full suite: PASS.
- [ ] Commit `feat(weighing): publish daily prices and write tickets behind the withdrawal lock`.

### Task 3: Hide leaf-purchase from the standard store

**Files:**
- A `MERGED_INTO_CORE = ['leaf-purchase', 'farm-supply']` constant beside the app store use case.
- Filter the store listing, the mini-app nav items and the install action when `isLabsEnabled()` is false; the detail page shows "Đã hợp nhất vào lõi".
- Update tests and any e2e that expects these apps in the standard store. The CI jobs that install them already set `DXOS_LABS=1`; check `.github/workflows/ci.yml` and add it where an apps job lacks it.

Steps:
- [ ] Write failing tests: labs off, then neither app is listed nor offered in the nav; labs on, both are listed.
- [ ] Implement.
- [ ] Run the tests: PASS.
- [ ] Commit `feat(app-store): hide mini-apps merged into the core unless DXOS_LABS is on`.

## Track FE (branch `p1/s3-fe`, Codex session)

Code against the contract. Mock `fetch`. Do not edit Prisma, migrations, `app/api/**`, `application/**`, `domain/**` or `infrastructure/**`.

### Task 1: Daily price page (manager)

- **Page:** `app/manager/leaf-prices/page.tsx` "Giá thu mua", with menu entry "Giá thu mua" in `app/manager/layout.tsx`.
- **Price table:** grades with a price input each (prefilled with today's price, otherwise yesterday's) and a primary button "Công bố giá hôm nay". After saving, show "Đã công bố lúc HH:mm".
- **Grade section:** "Phẩm cấp búp" with add, rename and hide.
- **Tests:**
  - prefill from yesterday;
  - a single click publishes with the PUT body;
  - validation stops 0 or empty values;
  - the add, rename and hide flows.

### Task 2: Weighing station (accountant)

- **Page:** `app/accountant/weighing/page.tsx` "Bàn cân", plus `app/accountant/weighing/[id]/print/page.tsx`.
- **Menu:** "Bàn cân" and "Phiếu cân" in `app/accountant/layout.tsx`.
- **Form flow** (spec §4.4):
  - household search;
  - parcel list with the light from `/api/parcels/[id]/withdrawal-status`: green "Đã qua cách ly", or red "Còn cách ly đến dd/MM" with the save button locked and a one-line reason;
  - grade with today's price; a grade without a price is disabled with "Chưa công bố giá";
  - gross kg, deduction (quick buttons 0, 2, 5, 10);
  - live net kg and amount (the same rounding as `computeTicket`; import `domain/weighing/ticket-math.ts` from S3 BE once merged, or mirror the formula in a small UI helper with a test);
  - "Lưu phiếu".
- **Errors:** a 409 shows the server message; a 409 `PARCEL_IN_WITHDRAWAL` also turns the light red.
- **After saving:** open the print page (80 mm thermal layout, `@media print`) and reset the form.
- **Side panel:** "Phiếu hôm nay" with totals and a void dialog (reason required).
- **Tests:**
  - the red light locks save;
  - the 409 flow;
  - live maths;
  - void requires a reason;
  - the reset after save.

### Task 3: Ticket lists, farmer views, reconciliation

- **Lists:** `app/manager/leaf-tickets/page.tsx` and `app/accountant/leaf-tickets/page.tsx` share one component, with filters, pagination, totals and a CSV link. Manager menu entry "Phiếu cân".
- **Farmer pages:**
  - `app/farmer/leaf-tickets/page.tsx` "Phiếu cân của tôi" and its menu entry;
  - on the farmer dashboard, a card "Giá búp hôm nay" (or "HTX chưa công bố giá hôm nay").
- **Reconciliation:** in the harvest calendar event detail of a harvested flush, show "Cân thực tế {x} kg / Nhật ký {y} kg" from `/api/cycles/[id]/weighing-summary`.
- **Tests:** one per view, including the empty states.

Each FE task commits separately: `feat(web): …`. Before reporting run `npm test -- --ci && npm run lint && npx tsc --noEmit && npx next build`.

## Integration (main session)

- Merge BE, then FE.
- Run all checks, the migration on a throwaway copy of the database, and two UI rounds covering:
  - publish the price;
  - weigh a household;
  - print the ticket;
  - a red light on a parcel with an active withdrawal (seed one spray);
  - the farmer sees the price and their ticket.
- Docs: rules-and-limits (§3.2: weighing gate), api-contract, database-schema, CHANGELOG, timeline.
