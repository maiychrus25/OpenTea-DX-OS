<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Phase 1 S4 — Input Advances, Member Ledger and Settlement with VietQR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record input advances as household debt, keep an append-only member ledger, let the accountant prepare and the cooperative head close a settlement period that computes `leaf money − input debt = net payable` per household, and print a slip with a VietQR code for the payout.

**Architecture:** Track BE (Sonnet) and track FE (Codex) in parallel, both branched from `feat/phase1-value-chain` after S3 has merged. The ledger is append-only in the database. Settlement maths is a pure domain function. VietQR is a TypeScript port of the tested Python module on commit `b60708fb`.

**Tech Stack:** Next.js 14, Prisma 5 / Postgres 16, zod, Jest + RTL; the QR image library the web already uses for lot QR codes (find it in `application/lot/ExportQrUseCase.ts`).

**Spec:** `docs/specs/2026-11-28-phase1-s4-member-ledger-design.md`. Read it all. §7 overrides §4.1 and §4.2: there are no carry entries, and the settlement formula is the one in §7.2.

## Global Constraints

- Same as the S3 plan's Global Constraints (routes, money as integer VND and `BigInt`, Vietnam days, audit triggers in the init array and in the migration, tenant-isolation rows, Telegram coverage rows, UI rules, commits, no push, no `.env*`, no `./dxos`).
- Closing a period and recording a payout never run from an agent or on a schedule. Only the routes below call them.
- Bank account fields never go to Telegram, agents or application logs.

## API contract (BE implements, FE consumes)

```ts
// Input items
// GET  /api/input-items                       -> { data: Item[] }  Item = { id, name, unit, unit_price_vnd, kind: 'FERTILIZER'|'PESTICIDE'|'OTHER', pesticide_product_id, active }
// POST /api/input-items (manager|accountant)   { name, unit, unit_price_vnd, kind, pesticide_product_id? } -> { data: Item }
// PUT  /api/input-items/[id] (manager|accountant) partial -> { data: Item }
// Advances
// POST /api/input-advances (accountant|manager) { household_id, item_id, quantity, advanced_on?: 'YYYY-MM-DD' (default today, not in the future), client_id? }
//   -> 201 { data: Advance }
// Advance = { id, advance_no, household_id, household_name, item_id, item_name, unit, quantity, unit_price_vnd,
//             amount_vnd: string, advanced_on, status, void_reason, settlement_id }
// GET  /api/input-advances?household_id=&from=&to=&status=&cursor= -> { data: Advance[], next_cursor, totals: { amount_vnd } }
// POST /api/input-advances/[id]/void { reason } -> { data: Advance } | 409 ADVANCE_SETTLED
// GET  /api/input-advances/export.csv?from=&to=
// Settlements
// POST /api/settlements (accountant|manager) { date_from, date_to } -> 201 { data: Period } | 422 (gap, overlap, future end, second DRAFT, unsettled earlier slips)
// Period = { id, code, date_from, date_to, status: 'DRAFT'|'CLOSED', created_by_name, closed_by_name, closed_at }
// GET  /api/settlements -> { data: Period[] }
// GET  /api/settlements/[id] -> { data: { period: Period, lines: Line[], totals: { households, leaf_amount_vnd, advances_vnd, payable_vnd, debt_out_vnd } } }
//   Line = { id: string|null (null while DRAFT), household_id, household_name, leaf_net_kg, leaf_amount_vnd, advances_vnd,
//            debt_in_vnd, payable_vnd, debt_out_vnd, paid_at, payment_method, payment_ref, has_bank_account }
//   all *_vnd are decimal strings
// POST /api/settlements/[id]/close (manager) { expected_household_count, expected_payable_total_vnd }
//   -> { data: same as GET } | 409 PERIOD_CLOSED | 409 PERIOD_CHANGED { error: { code, message, totals } }
// POST /api/settlements/[id]/lines/[lineId]/payout (accountant|manager) { method: 'TRANSFER'|'CASH', ref? } -> { data: Line } | 409
// GET  /api/settlements/[id]/lines/[lineId]/slip
//   -> { data: { htx, household, period, tickets: Ticket[], advances: Advance[], line: Line,
//                qr: { data_url, bank_name, account_masked, account_full?: string } | null, transfer_note } }
//   account_full only for manager|accountant; the farmer may read the slip of their own household
// Ledger
// POST /api/ledger/adjustments (manager) { household_id, amount_vnd: string (non-zero integer), reason: 5..200 }
// GET  /api/ledger/mine (farmer) -> { data: { balance_vnd: string, entries: Entry[], unsettled_tickets: Ticket[], unsettled_advances: Advance[], lines: Line[] } }
// GET  /api/households/[id]/ledger (manager|accountant) -> same shape for one household
// PUT  /api/households/[id]/bank (manager|accountant) { bank_bin, bank_account, bank_account_name } -> { data: { bank_bin, bank_name, account_masked, bank_account_name } }
// GET  /api/banks -> { data: { bin, name }[] }   (the 21 banks of vietqr.ts)
```

## Review Focus

1. **A household with debt from the last period and no activity this period, then activity next period:** the debt is subtracted then. Owner: BE Task 2, test `debt carries through an idle period`.
2. **Close after a ticket was voided while the confirmation dialog was open:** 409 `PERIOD_CHANGED`, and nothing is written. Owner: BE Task 3.
3. **Payout recorded twice by two accountants:** the second gets 409; one PAYOUT entry exists. Owner: BE Task 3 (conditional update on `paid_at IS NULL`).
4. **A ledger row updated or deleted directly in SQL:** the trigger raises. Owner: BE Task 1, checked on the throwaway database.
5. **A VietQR transfer note with Vietnamese letters:** the note is ASCII only. Owner: BE Task 1 (`transferNote` strips diacritics, at most 25 characters).

---

## Track BE (branch `p1/s4-be`)

### Task 1: Schema, migration, VietQR, pure settlement maths

**Files:**
- `schema.prisma`:
  - household bank fields;
  - models `InputItem`, `InputAdvance`, `SettlementPeriod`, `MemberSettlement`, `MemberLedgerEntry`;
  - enums `InputKind`, `RecordStatus` (reuse the S3 ticket status enum if suitable), `SettlementStatus`, `LedgerEntryType { LEAF_CREDIT, INPUT_DEBIT, PAYOUT, ADJUSTMENT }`, `PaymentMethod`.
- Create `migrations/20261128150000_member_ledger/migration.sql`. It contains the tables, the foreign key `fresh_leaf_tickets.settlement_id` to `member_settlements(id)`, a `BEFORE UPDATE OR DELETE` trigger on `member_ledger_entries` that raises, and the audit triggers. Add the new tables to the `03-audit-triggers.sql` array.
- Create `domain/payment/vietqr.ts`:
  - `BANKS: { bin: string; name: string }[]` (21 entries, the same as the Python module)
  - `bankByBin(bin: string)`
  - `crc16(text: string): string`
  - `payload(bin: string, account: string, amountVnd: bigint, content: string): string`
  - `transferNote(periodCode: string, householdId: string): string`
- Create `domain/ledger/settlement.ts` with `settleHousehold({ leafVnd, advancesVnd, outstandingVnd }: { leafVnd: bigint; advancesVnd: bigint; outstandingVnd: bigint }): { payableVnd: bigint; debtOutVnd: bigint; debtInVnd: bigint }` (spec §7.2).
- Tests: `domain/vietqr.test.ts`, `domain/settlement.test.ts`, `db/schema-phase1-s4.test.ts`.

Steps:
- [ ] Write failing tests.
  - The VietQR vector:
    ```
    payload('970405','8600201001234',500000n,'TOUR K7M2QX9A') ===
    '00020101021238570010A00000072701270006970405011386002010012340208QRIBFTTA530370454065000005802VN62170813TOUR K7M2QX9A6304C17A'
    ```
  - `crc16('123456789') === '29B1'`.
  - Each invalid case from `test_vietqr.py` throws.
  - The 21 BINs are unique.
  - `transferNote` is ASCII and at most 25 characters.
  - `settleHousehold`:
    - `(1_000_000n, 300_000n, 0n)` gives `{ payable 700_000n, debtOut 0n, debtIn 0n }`;
    - `(200_000n, 500_000n, 0n)` gives `{ 0n, 300_000n, 0n }`;
    - `(1_000_000n, 0n, -300_000n)` gives `{ 700_000n, 0n, 300_000n }`;
    - `(0n, 0n, -100_000n)` gives `{ 0n, 100_000n, 100_000n }`.
- [ ] Implement.
- [ ] Run the tests: PASS.
- [ ] On a throwaway Postgres with every migration applied, an UPDATE of a ledger row raises.
- [ ] Commit `feat(ledger): schema, VietQR payload and settlement maths`.

### Task 2: Items, advances, ledger reads, bank details

**Files:**
- Use cases and a repository for items and advances: number `{HTX}-VT-{YYYYMMDD}-{NNN}` under an advisory lock; void only when unsettled; `client_id` idempotency.
- Ledger reads: balance, entries, unsettled slips, and a household's outstanding amount, which is the ledger balance minus the unpaid payable of earlier lines.
- Bank route, `GET /api/banks`.
- `GET /api/pesticides` (S1): for a farmer, products advanced to the household in the last 180 days (through `input_items.pesticide_product_id`) come first.

Steps:
- [ ] Write failing tests:
  - advance amount and number;
  - voiding a settled advance gives 409;
  - roles: a farmer cannot create; an officer can only read;
  - another HTX gives 404;
  - `client_id` replay returns the first advance;
  - bank validation (unknown BIN, letters in the account);
  - the masked account in the response;
  - pesticide ordering;
  - `debt carries through an idle period` (with the Task 3 close).
- [ ] Implement.
- [ ] Run the tests: PASS.
- [ ] Commit `feat(ledger): input items, advances, bank details and ledger reads`.

### Task 3: Periods, close, payout, slip, adjustments

**Files:** the use cases `CreateSettlementPeriodUseCase`, `CloseSettlementPeriodUseCase`, `RecordPayoutUseCase` and `CreateLedgerAdjustmentUseCase`, and the slip query (QR data URL with the existing QR library), plus their routes.

Steps:
- [ ] Write failing tests:
  - period rules (contiguous; first period covers the earliest unsettled slip; no future end; one DRAFT);
  - DRAFT preview totals;
  - close: lines, links, ledger entries, then the invariant from spec §7.2 for every household;
  - closing twice gives 409 and nothing new;
  - the stale-numbers check gives 409 `PERIOD_CHANGED`;
  - only a manager closes;
  - payout once (a concurrent second one gets 409);
  - payout of a line with payable 0 gives 409;
  - the slip QR amount equals the payable;
  - the slip without bank details has `qr: null`;
  - a farmer reads only their own slip and only masked;
  - an adjustment needs a reason and comes only from a manager.
- [ ] Implement.
- [ ] Run the tests and the full suite: PASS.
- [ ] Commit `feat(ledger): settlement periods, closing, payouts, slips and adjustments`.

## Track FE (branch `p1/s4-fe`, Codex session)

Code against the contract with mocked `fetch`. Do not edit the backend.

### Task 1: Items and advances

- **Page:** "Vật tư" for the accountant (`app/accountant/inputs/page.tsx`) and the manager (`app/manager/inputs/page.tsx`), built on a shared component. Add the menu entries.
- **Item catalogue:** add, edit and deactivate items. A PESTICIDE item links to a catalogue product through the existing PesticidePicker in a "select only" mode.
- **Quick advance form:**
  - household search, item, quantity;
  - the amount computed live;
  - a "Ghi phiếu ứng" button;
  - today's list with a void dialog.
- **Household page:** "Tài khoản nhận tiền", using a bank select fed by `/api/banks`. Put it on the manager household page (or a household dialog where households are listed for the manager and the accountant).
- **Tests:** live amount, void needs a reason, bank form validation.

### Task 2: Settlement pages and slip

- "Quyết toán" for the accountant and the manager: period list and create dialog (with 422 messages shown).
- Period page:
  - DRAFT: the table of spec §4.5 with totals. For a manager only, a "Chốt kỳ" button with the confirmation text of spec §4.5. On 409 `PERIOD_CHANGED`, the dialog shows the new numbers and asks again.
  - CLOSED: paid status, a "Phiếu" link and "Ghi đã trả" (method and reference).
- Slip page `/(accountant|manager)/settlements/[id]/slip/[lineId]`: A5 print layout, net payable in large type, the QR image with the bank name and the account, signature lines.
- Tests:
  - the manager sees "Chốt kỳ" and the accountant does not;
  - the stale flow;
  - the payout dialog;
  - the slip with and without QR.

### Task 3: Farmer "Sổ tiền"

- `app/farmer/ledger/page.tsx`:
  - a large balance line ("HTX đang nợ bạn {x} đ" or "Bạn đang nợ HTX {x} đ"; "Số dư 0 đ" when zero);
  - tabs "Phiếu cân", "Vật tư ứng" and "Quyết toán", where each settlement opens the farmer's own masked slip.
- Add the farmer menu and bottom navigation entry "Sổ tiền". The S3 "Phiếu cân của tôi" moves into this page as a tab; keep its route redirecting here.
- Tests: the three balance texts, the tabs, and the empty states.

Each FE task commits separately. Before reporting run `npm test -- --ci && npm run lint && npx tsc --noEmit && npx next build`.

## Integration (main session)

- Merge BE, then FE.
- Run all checks and the migration on a throwaway copy of the database.
- Do two UI rounds through the full flow: advance → weigh → create period → close → slip with VietQR → payout → the farmer's balance.
- Measure the time to close and print 20 sample households (KPI ≤ 30 min) and record it.
- Docs: rules-and-limits (money rules), api-contract, database-schema, CHANGELOG, timeline, roadmap KPI note.
