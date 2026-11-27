<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# GĐ3 S7 Director Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `/manager/dashboard` answers the six morning questions on one screen; `/accountant/dashboard` shows the money part.

**Architecture:** One read-only use case `DirectorBoardUseCase` over a `BoardSource` port with a Prisma implementation; each block is computed independently and becomes `null` (logged) when it fails. Server pages call the use case directly; no new API route.

**Spec:** `docs/specs/2026-11-28-phase3-director-board-sales-design.md` §3 S7 (and §7.4: the board replaces the old home blocks).

## Global Constraints

- Contract: `apps/web/src/domain/board/views.ts` (already committed). Do not change it without asking.
- Money: BigInt, sent as decimal strings. kg: integer tenths, sent as numbers with one decimal. Days: Vietnam days (`vnDayOf`, `vnDayStart` in `apps/web/src/application/agent/campaign/vn-day.ts`).
- Tenant: every query filters by `htx_profile_id` (or the HTX's households/parcels).
- No new dependency. English identifiers, Vietnamese copy. Commits: `git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`, English Conventional Commits, no AI attribution.

## Task B1 (Sonnet): use case and Prisma source

**Files:** create `apps/web/src/domain/board/ports/BoardSource.ts`, `apps/web/src/application/board/DirectorBoardUseCase.ts`, `apps/web/src/infrastructure/db/board/PrismaBoardSource.ts`, tests `src/__tests__/application/board/director-board.test.ts` (fake source) and `src/__tests__/db/board-postgres.integration.test.ts` (opt-in with `BOARD_TEST_DATABASE_URL`, includes a timing check: 50,000 tickets, the whole read under 1 s).

**Interfaces:**
- `DirectorBoardUseCase.read(htxProfileId: string, now: Date, role: 'manager' | 'accountant'): Promise<DirectorBoard>`. For `accountant`, `dry_stock` is `null`-free but omitted from the page by the frontend; alerts are filtered to `MONEY_ALERTS`.
- Block rules:
  - `leaf`: VALID `fresh_leaf_tickets` with `weighed_at` inside today's and yesterday's Vietnam day.
  - `prices`: `daily_leaf_prices` for today joined to active `leaf_grades` (order by `sort_order`); `published` = at least one price today.
  - `payable`: unpaid closed lines (`member_settlements.paid_at null`, `payable_vnd > 0`, period CLOSED) + VALID unsettled tickets − VALID unsettled advances, whole HTX; reuse the queries in `infrastructure/db/ledger/queries.ts` where they fit.
  - `dry_stock`: per grade, Σ outputs of FINISHED batches − Σ `lot_batch_sources.kg` (reuse `stockOf` logic from `infrastructure/db/processing/PrismaLotFromBatchesRepository.ts`), all five grades.
  - `alerts` (only kinds with count > 0, in this order, with these messages and links):
    - `PARCELS_IN_WITHDRAWAL`: parcels blocked by rule (a) at the end of today (`weighingBlock` in `application/weighing/withdrawal-gate.ts`) — "{n} nương đang trong thời gian cách ly" → `/manager/schedule`.
    - `BATCH_OUT_OF_BAND`: FINISHED batches with `out_of_band` and `finished_at` in the last 30 days — "{n} mẻ lệch khoảng chuẩn trong 30 ngày" → `/manager/processing`.
    - `BATCH_OPEN_TOO_LONG`: OPEN batches with `processed_on` more than 2 days before today — "{n} mẻ còn mở quá 2 ngày" → `/manager/processing`.
    - `OLD_DRY_STOCK`: stock rows with remaining > 0 and `processed_on` more than 60 days ago — "{n} dòng tồn chè khô quá 60 ngày" → `/manager/processing`.
    - `SETTLEMENT_DRAFT`: a DRAFT settlement period — "Kỳ quyết toán {code} còn nháp" (count 1) → `/manager/settlements/{id}`.
    - `UNPAID_LINES`: unpaid lines of periods closed more than 7 days ago — "{n} hộ chưa nhận tiền quyết toán quá 7 ngày" → `/manager/settlements`.
    - `PRICE_NOT_PUBLISHED`: no price today and the Vietnam time is 07:00 or later — "Chưa công bố giá thu mua hôm nay" → `/manager/leaf-prices`.
    - For the accountant, links point to `/accountant/...` where the page exists (`/accountant/settlements`), otherwise keep the manager path out (drop the link → `href` to `/accountant/dashboard`).
- [ ] Tests first (each block, each alert boundary: 2 vs 3 days open, 60 vs 61 days, 06:59 vs 07:00, 7 vs 8 days, a failing block becomes null and the others still load, accountant filtering, tenant isolation), then code; tsc, lint, jest; Postgres test on a throwaway container (image `opentea-dx-os/postgres:local`, unique name, 127.0.0.1 only, removed with `docker rm -f -v`). Commit `feat(board): director board use case over leaf, prices, member payable, dry stock and alerts`.

## Task F1 (Codex): the two dashboards

**Files:** `apps/web/src/app/manager/dashboard/page.tsx` and its components, `apps/web/src/app/accountant/dashboard/page.tsx`, `apps/web/src/components/features/board/*`, tests.
- Manager page, top to bottom: greeting banner (keep), the six blocks as one grid (1: kg today + amount + tickets + change vs yesterday; 2: price per grade, or the button "Công bố giá hôm nay" when not published; 3: total payable with the three parts; 4: five grades in kg; 5: "Chưa có đơn bán sỉ" with a muted note "Có ở bước Bán hàng"; 6: alert list, or "Không có cảnh báo" in green), then the existing notices + weather and pending journals panels.
- Remove from the manager page: the `market_data` "Chỉ số giá" panel and its helpers, the four old metric cards and the parcel status table. Add a small link row: "Phân tích chi tiết" → `/manager/apps/htx-dashboard` only when that app is enabled for the HTX (`PrismaInstalledAppRepository.isEnabledFor`), and "Giá chè thế giới" → `/manager/bulletin`.
- Each block has its own error state when its value is `null` ("Chưa tải được …"), so one failing block never blanks the page.
- Accountant page: blocks 1, 2, 3 and the money alerts; replaces the empty state.
- Until B1 merges, the pages call a local function you can mock; leave `// TODO(integration): DirectorBoardUseCase` where it plugs in (same pattern as phase 2).
- Phone first, light and dark, no horizontal scroll; tests for each block, null states, the conditional analysis link, and the accountant page. Run `npx next build` before reporting (phase 2 lost an hour to CSS module errors only the build catches).
