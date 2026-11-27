<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# GĐ2 Processing Batches, Lots from Batches, Certificates and One QR Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fresh-leaf tickets go into processing batches; finished batches become dry-tea stock by grade; lots are made only from that stock; the one public QR page proves the lot's tickets, batches, withdrawal safety and real certificates.

**Architecture:** Same hexagonal layout as GĐ1 (route → zod → `requireTenant` + `requireRole` + `TenantGuard` → use case → port → Prisma repository, envelope `{data}` / `{error:{code,message}}`). Money-like quantities (kg) are integer tenths. Concurrency is settled by conditional `updateMany` writes and row locks, as in S3/S4.

**Tech Stack:** Next.js 14 App Router, Prisma 5, PostgreSQL 16, zod, jest + Testing Library, `qrcode`, `minio`. No new dependency.

**Spec:** `docs/specs/2026-11-28-phase2-processing-lot-qr-design.md` (§7 binds where it differs from earlier sections).

## Global Constraints

- Base branch `feat/phase2-processing-qr` at the commit that adds this plan. Shared contract already committed there: `apps/web/src/domain/processing/grades.ts` (`DRY_TEA_GRADES`, `DryTeaGrade`, `DRY_TEA_GRADE_LABELS`, `RECOVERY_BAND = {min: 4.5, max: 5.0}`) and the optional phase 2 fields of `apps/web/src/domain/entities/lot-trace-data.ts` (`dry_grade`, `batches`, `intake`, `certificates`). Do not change these shapes; ask the controller if one must change.
- Migrations: `20261128160000_processing_batches` (track A), `20261128160100_certificates_and_public_names` (track B). Each attaches `dxos_audit_row` in a `DO $$ ... IF to_regprocedure('audit.capture_row()') IS NOT NULL ...` block, and its tables are added to the array in `platform/postgres/init/03-audit-triggers.sql`.
- kg: `Decimal` columns with one decimal; arithmetic on integer tenths (see `apps/web/src/domain/weighing/ticket-math.ts`). Ratio rounded half up to 2 decimals.
- Days: Vietnam days via `vnDayOf` / `vnDayStart` (`apps/web/src/application/agent/campaign/vn-day.ts`), strings `YYYY-MM-DD`.
- Every new route: `withErrorHandler`, zod `.strict()`, `export const dynamic = 'force-dynamic'` when it is a GET, an entry in the `miniApp` group of `apps/web/src/application/telegram/coverage.ts`, a jest route test for each role refused.
- Frozen paths use `labsOnly` / `isLabsEnabled()` from `apps/web/src/lib/labs.ts`; a gated route file also exports `dynamic = 'force-dynamic'` (enforced by `src/__tests__/lib/labs-routes-dynamic.test.ts`).
- Names of people (`household_name`, `performed_by`, `master_name`) never reach the public page unless `htx_profiles.public_show_names` is true.
- English identifiers, Vietnamese user copy with full diacritics. English Conventional Commits; commit as `git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`; no `Co-Authored-By` and no AI attribution anywhere.
- Before each commit: `npx prisma generate` if the schema changed, `npx tsc --noEmit`, `npm run lint`, the touched jest suites. Before reporting: the full `npx jest --ci`.

## Review Focus

1. A ticket voided while another request adds it to a batch: exactly one wins (void → batch add gets 409 `TICKETS_CHANGED`; add → void gets 409 `TICKET_IN_BATCH`). Pinned by the Postgres test in Task A2.
2. Two lots drawing the same stock row at once: the second gets 409 `STOCK_CHANGED`, remaining stock never goes below 0. Pinned in Task A3.
3. A spraying back-dated after a ticket was weighed (entry_date ≤ weigh day, safe date after it) blocks the lot and its export. Pinned in Task A3 (unit) and Task A4 (export).
4. A public page of a lot exported before phase 2 (snapshot without the new fields) still renders, and names in it are hidden when the setting is off. Pinned in Task A4 and Task F4.
5. A certificate revoked or expired between listing and export cannot be attached (422 `CERTIFICATE_NOT_VALID`). Pinned in Task A4.

## Tracks and order

| Track | Worker | Worktree / branch | Tasks |
|---|---|---|---|
| A | Sonnet subagent | `wt-p2-a` / `p2/a` | A1 → A2 → A3, then A4 after the controller merges `p2/b` into `p2/a` |
| B | Sonnet subagent | `wt-p2-b` / `p2/b` | B1 → B2 |
| F | Codex session | `wt-p2-fe` / `p2/fe` | F1 → F2 → F3 → F4, against the contract below |

Merge order into `feat/phase2-processing-qr`: `p2/b`, `p2/a`, `p2/fe`.

## API contract (shared by tracks A, B and F)

```ts
// Views, all days 'YYYY-MM-DD', all kg numbers with one decimal.
type BatchStatus = 'OPEN' | 'FINISHED' | 'CANCELLED'
interface BatchView {
  id: string; batch_code: string; processed_on: string; status: BatchStatus
  master_name: string | null; shift: string | null; notes: string | null
  ticket_count: number; fresh_kg: number; dry_kg: number
  recovery_ratio: number | null; out_of_band: boolean; deviation_note: string | null
  created_at: string; finished_at: string | null; cancel_reason: string | null
}
interface BatchOutputView { id: string; grade: DryTeaGrade; kg: number; remaining_kg: number }
interface BatchDetail {
  batch: BatchView
  tickets: TicketView            // the S3 ticket view (`domain/weighing/ports/FreshLeafTicketPort.ts`), as an array
  outputs: BatchOutputView[]
  preview: { fresh_kg: number; dry_kg: number; recovery_ratio: number | null; out_of_band: boolean }
}
interface DryStockRow {
  output_id: string; batch_id: string; batch_code: string; processed_on: string
  grade: DryTeaGrade; kg: number; remaining_kg: number; recovery_ratio: number; out_of_band: boolean
}
type CertificateKind = 'VIETGAP' | 'OCOP' | 'ORGANIC' | 'OTHER'
interface CertificateView {
  id: string; kind: CertificateKind; number: string; issuer: string
  issued_on: string; expires_on: string; scope_note: string | null
  file_name: string; file_mime: string; file_size: number
  revoked_at: string | null; revoke_reason: string | null
  status: 'VALID' | 'EXPIRED' | 'REVOKED'   // computed at read time, Vietnam day
}
interface PublicSettings { public_show_names: boolean }
```

| Route | Roles | Request | Success | Errors |
|---|---|---|---|---|
| `GET /api/processing-batches?status=&from=&to=` | officer, manager | query | 200 `BatchView[]` | |
| `POST /api/processing-batches` | officer, manager | `{ processed_on, master_name?, shift?, notes? }` | 201 `BatchView` | 422 `DOMAIN_ERROR` (processed_on after today) |
| `GET /api/processing-batches/[id]` | officer, manager | | 200 `BatchDetail` | 404 |
| `GET /api/processing-batches/available-tickets?from=&to=` | officer, manager | default last 30 days | 200 `TicketView[]` | |
| `POST /api/processing-batches/[id]/tickets` | officer, manager | `{ ticket_ids: string[] }` (1..200, unique) | 200 `BatchDetail` | 409 `BATCH_NOT_OPEN`, 409 `TICKETS_CHANGED` |
| `DELETE /api/processing-batches/[id]/tickets/[ticketId]` | officer, manager | | 200 `BatchDetail` | 409 `BATCH_NOT_OPEN`, 404 |
| `PUT /api/processing-batches/[id]/outputs` | officer, manager | `{ outputs: { grade, kg }[] }` (0..5, grades unique, kg > 0 ≤ 100000, one decimal) | 200 `BatchDetail` | 409 `BATCH_NOT_OPEN` |
| `POST /api/processing-batches/[id]/finish` | officer, manager | `{ deviation_note? }` (10..500 when given) | 200 `BatchDetail` | 409 `BATCH_NOT_OPEN`, 422 `BATCH_EMPTY`, 422 `DEVIATION_NOTE_REQUIRED` (+ `recovery_ratio`) |
| `POST /api/processing-batches/[id]/cancel` | officer, manager | `{ reason }` (3..200) | 200 `BatchView` | 409 `BATCH_NOT_OPEN` |
| `GET /api/dry-stock?grade=` | officer, manager | | 200 `DryStockRow[]` (remaining > 0) | |
| `POST /api/lots/from-batches` | officer, manager | `{ grade, sources: { output_id, kg }[] (1..50), packaging_type?, destination?, buyer_name? }` | 201 `LotSummary` + `dry_grade` | 409 `STOCK_CHANGED` (+ `stock: DryStockRow[]`), 422 `WITHDRAWAL_NOT_PASSED`, 422 `GRADE_MISMATCH` |
| `GET /api/certificates` | officer, manager | | 200 `CertificateView[]` | |
| `POST /api/certificates` | officer, manager | multipart: `file`, `kind`, `number`, `issuer`, `issued_on`, `expires_on`, `scope_note?` | 201 `CertificateView` | 400 `FILE_TOO_LARGE`, 400 `FILE_TYPE`, 400 `VALIDATION_ERROR` |
| `GET /api/certificates/[id]/file` | officer, manager | | 302 presigned (3600 s) | 404 |
| `POST /api/certificates/[id]/revoke` | manager | `{ reason }` (3..200) | 200 `CertificateView` | 409 `CERTIFICATE_REVOKED` |
| `GET /api/htx/public-settings` | manager, officer | | 200 `PublicSettings` | |
| `PUT /api/htx/public-settings` | manager | `PublicSettings` | 200 `PublicSettings` | |
| `POST /api/lots/[id]/export-qr` (changed) | officer, manager | `{ certificate_keys?, certificate_ids? }` | as today | 422 `LOT_WITHOUT_BATCH`, 422 `CERTIFICATE_NOT_VALID`, 422 `WITHDRAWAL_NOT_PASSED` |
| `POST /api/leaf-tickets/[id]/void` (changed) | as today | as today | as today | + 409 `TICKET_IN_BATCH` |
| `POST /api/lots` (frozen) | officer | as today | as today when `DXOS_LABS` on | 404 `NOT_FOUND` when off |

---

### Task A1: Batch schema, batch maths and the void guard

**Files:**
- Create: `apps/web/prisma/migrations/20261128160000_processing_batches/migration.sql`, `apps/web/src/domain/processing/batch-math.ts`, `apps/web/src/__tests__/domain/batch-math.test.ts`, `apps/web/src/__tests__/db/schema-phase2-batches.test.ts`
- Modify: `apps/web/prisma/schema.prisma`, `platform/postgres/init/03-audit-triggers.sql`, `apps/web/src/infrastructure/db/weighing/PrismaFreshLeafTicketRepository.ts` (`voidTicket`), the void use case and its outcome type, `apps/web/src/__tests__/api/` leaf ticket void test

**Interfaces:**
- Produces: Prisma models `ProcessingBatch`, `ProcessingBatchOutput`, `LotBatchSource`, enum `ProcessingBatchStatus`, enum `DryTeaGrade` (values = `DRY_TEA_GRADES`), `FreshLeafTicket.processing_batch_id`, `Lot.dry_grade` (spec §4.1 migration 1, columns and CHECKs exactly as listed).
- Produces: `batchTotals(ticketNetKg: string[], outputKg: string[]): { freshKg: number; dryKg: number; ratio: number | null; outOfBand: boolean }` — integer tenths; `ratio` null when dryKg is 0; `outOfBand` compares the rounded ratio with `RECOVERY_BAND`, both ends inside.
- Produces: `batchCode(htxCode: string, day: string, n: number): string` → `TC-MS-20261128-01` (two digits, three when n ≥ 100).
- Produces: void outcome `{ kind: 'in_batch'; batch_code: string }` → 409 `TICKET_IN_BATCH` "Phiếu đã vào mẻ sao {batch_code}. Bỏ phiếu khỏi mẻ trước khi huỷ."

- [ ] Tests first: `batchTotals(['95.0','95.0','237.5'], ['95.0'])` → fresh 427.5, dry 95, ratio 4.5, outOfBand false; dry 85.6 → ratio 4.99 (in band); dry 85.5 → 5.0 (in band, rounding); dry 85.4 → 5.01 (out); dry 95.1 → 4.5 (in, 4.495 rounds up); `[]` outputs → ratio null, outOfBand false. `batchCode('TC','2026-11-28',1)` → `TC-MS-20261128-01`; n=100 → `-100`. Schema test asserts the migration file contains the three tables, the FK, the CHECKs and the guarded audit block.
- [ ] Void guard: `voidTicket` conditional write adds `processing_batch_id: null`; when it updates nothing and the ticket has a batch, return `in_batch` with the batch code. Route test: 409 `TICKET_IN_BATCH`.
- [ ] Migration, `prisma generate`, tsc, lint, tests; commit `feat(processing): batch schema, recovery ratio and the ticket void guard`.

### Task A2: Batches — repository, use cases, routes

**Files:**
- Create: `apps/web/src/domain/processing/ports/BatchPort.ts`, `apps/web/src/domain/processing/views.ts` (`BatchView`, `BatchOutputView`, `BatchDetail` as in the contract), `apps/web/src/application/processing/BatchUseCases.ts`, `apps/web/src/infrastructure/db/processing/PrismaBatchRepository.ts`, `apps/web/src/lib/validations/processing.schema.ts`, the nine route files under `apps/web/src/app/api/processing-batches/`, tests `src/__tests__/application/processing/batches.test.ts`, `src/__tests__/api/processing-batch-routes.test.ts`, `src/__tests__/db/processing-postgres.integration.test.ts` (runs only with `PROCESSING_TEST_DATABASE_URL`, as the S4 ledger test does)
- Modify: `apps/web/src/lib/api/tenant-guard.ts` (`processingBatch(id)`), `apps/web/src/application/telegram/coverage.ts`

**Interfaces:**
- Consumes: A1 schema, `batchTotals`, `batchCode`.
- Produces: use cases `ListBatches`, `CreateBatch`, `GetBatch`, `AvailableTickets`, `AddTickets`, `RemoveTicket`, `SetOutputs`, `FinishBatch`, `CancelBatch`, each `execute(actor: { userId, role, htxProfileId, htxCode }, ...)`.
- Rules: spec §4.2. Batch numbering under `pg_advisory_xact_lock(hashtext('batch:' || htx_code || ':' || day))`, max suffix + 1. Every mutating call locks the batch row (`FOR UPDATE`) and refuses when not `OPEN`. Add tickets: one conditional `updateMany` (`status VALID`, same HTX, `processing_batch_id null`); count mismatch → throw 409 `TICKETS_CHANGED` (the transaction rolls back). Finish: totals from the stored tickets and outputs, `DEVIATION_NOTE_REQUIRED` carries `recovery_ratio`. Cancel: release every ticket. All writes set `dxos.actor` to `user:<id>`.
- [ ] Tests first, then code: every error code of the contract, refused roles (farmer, accountant 403), another HTX's batch 404, finish in band without note, finish out of band with and without note, cancel releases tickets, remove ticket, outputs replace the set. Postgres test: void racing add-to-batch (Review Focus 1), parallel batch numbering without gaps.
- [ ] Commit `feat(processing): processing batches with tickets, outputs, finish and cancel`.

### Task A3: Dry stock and lots from batches

**Files:**
- Create: `apps/web/src/domain/processing/lot-sources.ts`, `apps/web/src/application/processing/CreateLotFromBatchesUseCase.ts`, `apps/web/src/application/processing/DryStockUseCase.ts`, `apps/web/src/app/api/dry-stock/route.ts`, `apps/web/src/app/api/lots/from-batches/route.ts`, tests for each
- Modify: `apps/web/src/infrastructure/db/lot/PrismaLotRepository.ts` (lot code numbering under `pg_advisory_xact_lock(hashtext('lot:' || prefix))`, max suffix + 1), `apps/web/src/app/api/lots/route.ts` (POST wrapped with `labsOnly`; GET unchanged), `apps/web/src/application/telegram/chat/actions/lot-create.ts` (refuse with "Tạo lô từ thửa đã chuyển sang Đóng lô từ mẻ." unless `isLabsEnabled()`), the lots route tests and e2e that create lots from parcels

**Interfaces:**
- Produces: `ticketBlock(entries: SprayEntry[], weighedOn: string, cycleId: string | null): string | null` in `lot-sources.ts`: the safe Vietnam day (`YYYY-MM-DD`) of `lotLineBlock(entries, endOfVnDay(weighedOn), cycleId)`, or null. `endOfVnDay` comes from `apps/web/src/application/weighing/withdrawal-gate.ts`, so the day comparison matches the weighing gate (a spray whose safe day is the weigh day does not block). `weighedOn` = `vnDayOf(ticket.weighed_at)`.
- Produces: `sourceTickets(tx, outputIds: string[]): Promise<{ id, parcel_id, parcel_code, cycle_id, weighed_at, net_kg }[]>` (all `VALID` tickets of the batches of these outputs).
- Produces: `CreateLotFromBatchesUseCase.execute(actor, input) → LotSummary & { dry_grade }`, steps exactly as spec §4.3 steps 1–6.
- [ ] Tests first: stock arithmetic (two lots drawing one row), over-draw → 409 with fresh stock, grade mismatch 422, back-dated spray (Review Focus 3) → 422 naming parcel, weigh day and safe day; harvest_date = latest weigh day; lot_parcels one per parcel with the latest ticket's cycle; frozen POST /api/lots → 404 with `DXOS_LABS` unset, works with it set. Postgres test: two parallel lots on one row (Review Focus 2); two lot codes on one day.
- [ ] Commit `feat(lots): close lots from dry tea stock and freeze lots from parcels`.

### Task B1: Certificates

**Files:**
- Create: `apps/web/prisma/migrations/20261128160100_certificates_and_public_names/migration.sql`, `apps/web/src/domain/certificate/{views.ts,status.ts,file-check.ts}`, `apps/web/src/domain/certificate/ports/CertificatePort.ts`, `apps/web/src/application/certificate/CertificateUseCases.ts`, `apps/web/src/infrastructure/db/certificate/PrismaCertificateRepository.ts`, routes `apps/web/src/app/api/certificates/route.ts`, `[id]/file/route.ts`, `[id]/revoke/route.ts`, tests for each
- Modify: `apps/web/prisma/schema.prisma`, `platform/postgres/init/03-audit-triggers.sql`, `apps/web/src/lib/api/tenant-guard.ts` (`certificate(id)`), `apps/web/src/application/telegram/coverage.ts`

**Interfaces:**
- Produces: models `HtxCertificate`, `LotCertificate`, enum `CertificateKind`, `HtxProfile.public_show_names` (spec §4.1 migration 2).
- Produces: `certificateStatus(c: { revoked_at: Date | null; expires_on: string }, today: string): 'VALID' | 'EXPIRED' | 'REVOKED'`.
- Produces: `checkCertificateFile(bytes: Uint8Array, declaredMime: string): 'application/pdf' | 'image/jpeg' | 'image/png' | null` by magic bytes (`%PDF-`, `FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`); size limit `CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024` checked before reading the whole body when `content-length` says more.
- Produces: `CertificatePort.validForLot(htxProfileId, ids: string[] | null, today): Promise<{ ok: CertificateRow[] } | { invalid: string[] }>` for Task A4.
- Storage: `MinioDocumentAdapter.uploadDocument(key, buffer, mime)`, key `para/<htx_code>/Certificates/<uuid>-<name>` with the name reduced to `[A-Za-z0-9._-]` (max 80). Download: `generateDownloadUrl(key, false, 3600)` → 302.
- [ ] Tests first: status (today = expires_on → VALID, next day → EXPIRED, revoked wins), file check (pdf, jpeg, png, a `.pdf` that is HTML → `FILE_TYPE`, 10 MB + 1 → `FILE_TOO_LARGE`), routes (officer revoke → 403, revoke twice → 409, other HTX 404, multipart validation errors). Storage adapter mocked.
- [ ] Commit `feat(certificates): store cooperative certificates with number, issuer and expiry`.

### Task B2: Public settings

**Files:**
- Create: `apps/web/src/app/api/htx/public-settings/route.ts`, `apps/web/src/domain/lot/public-view.ts`, tests
- Modify: `apps/web/src/application/telegram/coverage.ts`

**Interfaces:**
- Produces: GET/PUT as in the contract; PUT sets `dxos.actor`.
- Produces: `publicView(trace: LotTraceData, showNames: boolean): LotTraceData` — returns a copy where, when `showNames` is false, `parcels[].household_name` is `''`, `journal_summaries[].performed_by` is `''` and `batches[].master_name` is `null`; nothing else changes.
- [ ] Tests first (both settings, a pre-phase-2 snapshot without `batches`), then code. Commit `feat(lots): cooperative setting for names on the public trace page`.

### Task A4: Export, trace data and the single QR page data (after `p2/b` is merged into `p2/a`)

**Files:**
- Modify: `apps/web/src/application/lot/ExportQrUseCase.ts`, `apps/web/src/app/api/lots/[id]/export-qr/route.ts`, `apps/web/src/application/telegram/chat/actions/lot-export-qr.ts`, `apps/web/src/infrastructure/db/repositories/prisma-lot-trace-repository.ts`, `apps/web/src/infrastructure/db/lot/PrismaLotRepository.ts` (`exportQr` writes `lot_certificates`), `apps/web/src/app/lot/[lot_code]/page.tsx` (becomes `permanentRedirect('/q/' + code)`; `TraceView.tsx` and its tests are removed only after F4 moved what `/q` needs), tests

**Interfaces:**
- Consumes: B1 `validForLot`, B2 `publicView`, A3 `ticketBlock`, `sourceTickets`.
- Export: spec §4.3 "Xuất QR" bullets in order; QR encodes `${base}/q/${encodeURIComponent(lot_code)}`; the snapshot (`public_page_data`) includes `dry_grade`, `batches`, `intake`, `certificates`, with names as stored (redaction happens at render).
- Trace repository: for a lot with batch sources, fill `batches` (one per source row), `intake` (one per source ticket, `safe_on` = the latest `safe_harvest_date` (Vietnam day) among the sprays that count for that ticket (`countsTowardWithdrawal` and `belongsToLotLine` for its weigh day and cycle), else null), `certificates` (from `lot_certificates`), `is_harvest_safe` = every source ticket has `ticketBlock` null. Lots without sources keep today's computation.
- [ ] Tests first: export without sources → 422 `LOT_WITHOUT_BATCH` (and allowed with `DXOS_LABS` on), revoked/expired id → 422 `CERTIFICATE_NOT_VALID` (Review Focus 5), default attaches all valid, back-dated spray → 422, QR URL uses `/q/`, `/lot/X` → 308 `/q/X`, trace of a batch lot has the three layers, an old snapshot without them still loads (Review Focus 4).
- [ ] Commit `feat(lots): export lots with batch sources and certificates to one QR page`.

### Task F1 (Codex): Processing pages

**Files:** `apps/web/src/app/{officer,manager}/processing/page.tsx`, `.../processing/[id]/page.tsx`, `apps/web/src/components/features/processing/*`, `apps/web/src/lib/processing/types.ts` (the contract views; import `DRY_TEA_GRADES`, `DRY_TEA_GRADE_LABELS`, `RECOVERY_BAND` from `@/domain/processing/grades`), menu entries "Xưởng sao sấy" in group "Vận hành" of both layouts, tests.
- List with status, ratio and an out-of-band flag; "Mở mẻ mới" form; batch page with tickets (picker from available tickets, date filter, totals), outputs for the five grades, live ratio with the band light, "Hoàn thành mẻ" (note box required and focused when out of band; show the server's `DEVIATION_NOTE_REQUIRED`), "Huỷ mẻ" with reason; read-only once finished or cancelled. Every error code of the contract shown as its message. Empty, loading and error states.

### Task F2 (Codex): Lots from batches and label printing

**Files:** `apps/web/src/app/{officer,manager}/lots/...` (existing pages), `apps/web/src/app/{officer,manager}/lots/[lot_code]/labels/page.tsx` (officer has no lot page today: add the label page only), `apps/web/src/components/features/lots/*`, tests.
- "Đóng lô từ mẻ": grade → stock table with kg prefilled to remaining → packaging fields → create; 409 `STOCK_CHANGED` reloads the table with the fresh stock and says so; 422 messages shown. The old "Tạo lô" button shows only when the server says labs is on (pass `isLabsEnabled()` from the server page).
- Lot page shows its batch sources and certificates; export dialog lists valid certificates checked by default.
- Labels page: size presets 50×30, 40×30, 60×40 mm, copies 1..500, each label one printed page (`@page { size: W H; margin: 0 }` set from the preset), QR from `qrcode` `toDataURL` of `/q/<code>`, lot code, "Chè <hạng>", weight, cooperative name; "In tem" calls `window.print()`; screen preview shows the labels.

### Task F3 (Codex): Certificates pages and the names setting

**Files:** `apps/web/src/app/{officer,manager}/certificates/page.tsx`, `apps/web/src/components/features/certificates/*`, `apps/web/src/app/manager/profile/...` (switch "Hiện tên người trên trang truy xuất công khai", default off, explains what it does), menu entries "Chứng nhận", tests.
- List with status badges (Còn hiệu lực đến …, Đã hết hạn, Đã thu hồi), add form (kind, number, issuer, issued/expiry dates, scope note, file ≤ 10 MB PDF/JPG/PNG checked in the browser too), open file, revoke (manager only) with reason.

### Task F4 (Codex): The one public QR page

**Files:** `apps/web/src/app/q/[lot_code]/page.tsx` and its components, tests. Move the AI verification block (`LotAiVerification`) and the certificate links from `apps/web/src/app/lot/[lot_code]/_components/TraceView.tsx`.
- The page reads the HTX's `public_show_names` and renders `publicView(trace, showNames)` (B2). Four layers in spec §4.5 order; layers with no data are left out; certificate validity computed at view time with `certificateStatus` (B1) — until B1/B2 merge, import paths as named in the contract and stub in tests. Phone first, light and dark, no horizontal scroll. A pre-phase-2 snapshot renders the old content.

## Verification at integration (controller)

- `npx tsc --noEmit`, `npm run lint`, `npx jest --ci` twice, `next build` (no new static route that should be dynamic).
- Throwaway Postgres from the 1.17.0 backup + all migrations; the Postgres tests of A2/A3 with their env var set.
- Flow script: 3 tickets → batch → finish (once out of band with a note) → stock → lot → certificate upload (MinIO throwaway or mocked adapter) → export → `/q` → `/lot` redirect → labels; then two UI rounds desktop + mobile, light + dark.
