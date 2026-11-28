<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# GĐ3 S8 Sales Linked to Lots and S9 Season Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:**
- Wholesale and retail sales draw from the stock of QR-exported lots in one place, the core.
- Trader receivables show on the director board.
- The cooperative prints a season or year report for its members' assembly.

**Architecture:**
- Core tables `sales_orders`, `sales_order_lines` and `sales_payments`, audited, payments append-only.
- Lot stock is derived: capacity minus confirmed lines, in grams.
- The tea-shop mini-app reaches the core through a new internal APISIX route `/api/internal/apps/*` with the user's own bearer token. The core re-verifies that token with Keycloak.
- The report is one read-only use case with a CSV route and a print page.

**Spec:** `docs/specs/2026-11-28-phase3-director-board-sales-design.md` §3 S8, S9 and §8 (owner decisions).

## Global Constraints

- Contracts committed on the base: `apps/web/src/domain/sales/views.ts`, `apps/web/src/domain/report/views.ts`, and `apps/web/src/domain/board/views.ts` (with `receivables: BoardReceivables | null` and the alert `ORDERS_OVERDUE` in `MONEY_ALERTS`). Do not change their shapes; ask the controller if one must change.
- Units and dates:
  - money is BigInt and travels as decimal strings;
  - sales weights are whole grams (`net_g`), and a wholesale input of kg with one decimal is ×1000;
  - other kg stay as numbers with one decimal;
  - days are Vietnam days (`vnDayOf` / `vnDayStart`).
- Patterns to copy:
  - money transactions, locks, `dxos.actor`, append-only triggers and conditional writes: `apps/web/src/infrastructure/db/ledger/PrismaSettlementRepository.ts` and `apps/web/prisma/migrations/20261128150000_member_ledger/migration.sql`;
  - numbering under an advisory lock: `apps/web/src/infrastructure/db/processing/PrismaBatchRepository.ts`;
  - 422 with a code: `UnprocessableError`.
- Every new route uses `withErrorHandler` and zod `.strict()`, exports `dynamic = 'force-dynamic'` when it is a GET, and gets a `miniApp` entry in `apps/web/src/application/telegram/coverage.ts`. Routes `/api/internal/apps/*` get no coverage entry, matching the other internal routes.
- No new dependency (tea-shop calls the core with Python's `urllib.request`).
- English identifiers, Vietnamese copy. Commit with `git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`, English Conventional Commits, no AI attribution.
- Before reporting: `npx tsc --noEmit --incremental false`, `npm run lint`, full `npx jest --ci`; tea-shop: `python -m pytest tests -q -W error` in `miniapps/tea-shop`.

## Review Focus

1. Two orders drawing the same lot at once: the second gets 409 `LOT_STOCK_SHORT`, and remaining stock never goes below 0 (Postgres test, task C2).
2. tea-shop resends the same order (`external_ref`) after a timeout: there is one core order, and the second call answers 200 with it (C3 and T1).
3. Two payments at once on one order: their sum never exceeds the total, and the second gets 409 `OVERPAYMENT` (C2).
4. A forged or foreign-HTX token on `/api/internal/apps/*`: 401 or 404. A farmer token: 403 (C3).
5. A 250 g pack: 4 packs draw exactly 1,000 g from the lot (C1, T1).

## Tracks

| Track | Worker | Worktree / branch | Tasks |
|---|---|---|---|
| C | Sonnet | `wt-p3-c` / `p3/sales-core` | C1 → C2 → C3 → C4 |
| T | Sonnet | `wt-p3-t` / `p3/tea-shop` | T1 |
| R | Sonnet | `wt-p3-r` / `p3/report` | R1 (sales section after C merges: R2) |
| F | Codex | `wt-p3-f` / `p3/sales-fe` | F1 → F2 |

Merge order into `feat/phase3-director-sales`: C, T, R, F.

## API contract

| Route | Roles | Request | Success | Errors |
|---|---|---|---|---|
| `GET /api/sales/sellable-lots` | manager, accountant | | 200 `SellableLot[]` (remaining > 0, newest first) | |
| `GET /api/sales/orders?kind=&status=&overdue=1&partner_id=&cursor=` | manager, accountant | | 200 `{ data: SalesOrderView[], next_cursor }` (50 per page, newest first) | |
| `POST /api/sales/orders` | manager, accountant | `{ partner_id, ordered_on?, due_on?, note?, lines: [{ lot_id, kg, price_vnd_per_kg }] }`. Lines 1..50, kg > 0 with one decimal, price an integer 1..10,000,000. `due_on` defaults to `ordered_on + 30` and may not be before `ordered_on` | 201 `SalesOrderView` | 404 partner/lot; 409 `LOT_STOCK_SHORT` + `stock: [{ lot_id, remaining_g }]`; 422 `LOT_NOT_SELLABLE` |
| `GET /api/sales/orders/[id]` | manager, accountant | | 200 `SalesOrderView` | 404 |
| `PATCH /api/sales/orders/[id]` | manager, accountant | `{ due_on }` | 200 `SalesOrderView` | 409 `ORDER_CANCELLED`, 409 `ORDER_PAID`; 422 `NOT_WHOLESALE` |
| `POST /api/sales/orders/[id]/payments` | manager, accountant | `{ amount_vnd, paid_on?, method, ref? }` | 201 `SalesOrderView` | 409 `OVERPAYMENT`, 409 `ORDER_CANCELLED` |
| `POST /api/sales/orders/[id]/cancel` | manager | `{ reason }` (3..200) | 200 `SalesOrderView` | 409 `ORDER_HAS_PAYMENTS`, 409 `ORDER_CANCELLED` |
| `GET /api/sales/receivables` | manager, accountant | | 200 `ReceivablesSummary` | |
| `GET /api/internal/apps/sales/sellable-lots` | bearer of manager | | 200 `SellableLot[]` | 401, 403 |
| `POST /api/internal/apps/sales/retail-orders` | bearer of manager | `{ external_ref (1..64, [A-Za-z0-9_-]), ordered_on?, customer_name?, lines: [{ lot_id, pack_count 1..999, pack_net_g 1..100000, amount_vnd }] }` | 201 `SalesOrderView` (200, the same order, on a replay of `external_ref`) | 409 `LOT_STOCK_SHORT`, 422 `LOT_NOT_SELLABLE`, 401, 403 |
| `POST /api/internal/apps/sales/retail-orders/[external_ref]/cancel` | bearer of manager | `{ reason? }` | 200 `SalesOrderView` | 404 |
| `GET /api/reports/season.csv?from=&to=&section=` | manager, accountant | `section` ∈ `REPORT_SECTIONS`, `from <= to`, range ≤ 3 years | 200 `text/csv` (UTF-8 BOM, formula-safe cells as in `leaf-tickets/export.csv`) | 400 |

---

### Task C1: sales schema and maths

**Files:** migration `apps/web/prisma/migrations/20261128170000_sales/migration.sql`, `schema.prisma`, `platform/postgres/init/03-audit-triggers.sql` (add `sales_orders`, `sales_order_lines`, `sales_payments`), `apps/web/src/domain/sales/math.ts`, tests.

**Interfaces:**
- Schema as in spec §3 S8:
  - enums `SalesKind`, `SalesSource`, `SalesStatus`;
  - reuse the S4 `PaymentMethod` enum;
  - unique `(htx_profile_id, source, external_ref)`;
  - CHECKs: `net_g > 0`; packs both null or both set with `net_g = pack_count * pack_net_g`; `amount_vnd >= 0`; `total_vnd >= 0`; payment `amount_vnd > 0`; `due_on >= ordered_on`;
  - append-only trigger on `sales_payments` (UPDATE, DELETE, TRUNCATE);
  - guarded audit block.
- `lineAmount(netG: number, priceVndPerKg: number): bigint`, rounding half up to whole dong. Examples: `(12500, 180000)` → `2250000n`; `(333, 1001)` → `333n` (333.333 rounds down); `(500, 1001)` → `501n` (500.5 rounds up).
- `lotCapacityG(lot: { total_weight_kg, actual_weight_kg, estimated_weight_kg }): number | null`, taking the first non-null and rounding ×1000 to whole grams.
- `kgToG(kg: number): number`, with `12.5` → `12500` (no float drift: work in tenths).

Commit: `feat(sales): sales orders, lines and payments schema with line maths`.

### Task C2: wholesale orders, payments, cancel, receivables

**Files:** `apps/web/src/domain/sales/ports/SalesPort.ts`, `apps/web/src/application/sales/SalesUseCases.ts`, `apps/web/src/infrastructure/db/sales/PrismaSalesRepository.ts`, `apps/web/src/lib/validations/sales.schema.ts`, the `/api/sales/*` routes, `TenantGuard.salesOrder(id)`, tests (fake port, routes, and Postgres opt-in `SALES_TEST_DATABASE_URL`).

**Rules:**
- Creating an order (one transaction):
  - lock lots `FOR UPDATE` by id;
  - check each lot is sellable (`LOT_NOT_SELLABLE`);
  - check remaining ≥ Σ `net_g` of the request per lot (`LOT_STOCK_SHORT` with remaining per lot);
  - number `{HTX}-DH-YYYYMMDD-NNN` under the lock `sales:<htx>:<day>`;
  - set `dxos.actor`.
- Payments and cancel lock the order row. Payments check `paid + amount <= total`.
- `overdue` = WHOLESALE, CONFIRMED, outstanding > 0 and `due_on < today` (Vietnam).
- Receivables are grouped by partner, largest outstanding first.
- The cancel route is manager only.

Tests first, including Review Focus 1 and 3 on Postgres (throwaway container `p3c-pg-<random>`, 127.0.0.1, removed with `docker rm -f -v`).

Commit: `feat(sales): wholesale orders drawn from lot stock, payments and trader receivables`.

### Task C3: Core Action API for mini-apps

**Files:** `platform/gateway/apisix.yaml` (route `internal-apps`: `uri /api/internal/apps/*`, `vars [["server_port","==","9081"]]`, `openid-connect: *oidc` as the user route uses, `limit-count` 120/60 s by `$http_authorization`, `proxy-rewrite` setting `X-Dxos-Gateway`), `apps/web/src/lib/api/internal-user-auth.ts`, `apps/web/src/infrastructure/auth/agent-token-verifier.ts` (a `KeycloakUserTokenVerifier` built on `KeycloakJwtVerifier`), the three `/api/internal/apps/sales/*` routes, retail use cases in `SalesUseCases.ts`, tests (including `platform/tests/test_compose_files.py` or the gateway config test if one pins APISIX routes).

**Interfaces:**
- `requireAppUserCaller(req: Request, verifier?): Promise<Tenant>`. It calls `requireGatewayBearer`, verifies the token (issuer, signature, expiry, `azp` = the web client id the browser session uses — read it from the same env the NextAuth Keycloak provider uses), takes the role from realm roles (must hold `manager`), takes the HTX from the `htx_code` claim, and returns the same `Tenant` shape as `requireTenant()`.
- A retail order:
  - `kind RETAIL`, `source TEA_SHOP`, `external_ref`, no partner, no due date;
  - the same stock rules as C2;
  - a replay of an existing `external_ref` returns it with 200 and writes nothing;
  - cancel by `external_ref`.

Tests first: Review Focus 2 and 4, and a 250 g × 4 line (Review Focus 5).

Commit: `feat(sales): core action API for mini-app retail orders with the user's token`.

### Task C4: board receivables

**Files:** `apps/web/src/domain/board/ports/BoardSource.ts`, `apps/web/src/application/board/DirectorBoardUseCase.ts`, `apps/web/src/infrastructure/db/board/PrismaBoardSource.ts`, tests.

- `receivables`:
  - outstanding of wholesale confirmed orders, the overdue count and amount, and the top three partners;
  - `null` when the query fails;
  - shown to both roles.
- Alert `ORDERS_OVERDUE`:
  - message "{n} đơn bán sỉ quá hạn thanh toán";
  - link `/manager/sales?overdue=1` for the manager and `/accountant/sales?overdue=1` for the accountant;
  - it comes first in the money alerts.

Commit: `feat(board): trader receivables and overdue orders on the director board`.

### Task T1: tea-shop 0.4.0 sells from core lots

**Files:** `miniapps/tea-shop/migrations/003_core_lots.sql`, `miniapps/tea-shop/tea_shop/{store.py,main.py}`, a new `miniapps/tea-shop/tea_shop/core.py`, templates `product_edit.html` and `order_detail.html`, `miniapps/tea-shop/app.yaml` (version `0.4.0`, `requires.core >=1.20.0`), README, tests.

**Interfaces:**
- Migration:
  - `products.lot_id text NULL`;
  - `products.pack_net_g int NULL CHECK (pack_net_g BETWEEN 1 AND 100000)`;
  - `CHECK ((lot_id IS NULL) = (pack_net_g IS NULL))`;
  - `orders.core_order_no text NULL`.
- `core.py`:
  - `CORE_URL = os.environ.get("DXOS_CORE_INTERNAL_URL", "http://apisix:9081")`;
  - functions:
    - `sellable_lots(authorization) -> list[dict]`;
    - `confirm_retail(authorization, external_ref, lines, customer_name) -> dict`;
    - `cancel_retail(authorization, external_ref) -> None`;
  - each forwards the incoming `Authorization` header and uses a 5 s timeout;
  - errors raise `CoreRefused(code, message_vi)` for 4xx with the core's `error.code`, and `CoreUnavailable` otherwise.
- Product edit: a lot picker from `sellable_lots` (lot code, grade, remaining kg) and "Trọng lượng tịnh mỗi gói (g)". Both are needed when a lot is chosen.
- Confirming an order (NEW → CONFIRMED):
  - lines are the items whose product has a lot: `pack_count` = quantity, `pack_net_g`, `amount_vnd` = item price × quantity;
  - on success store `core_order_no`, then advance;
  - on `CoreRefused('LOT_STOCK_SHORT')` show "Lô {lot_code} chỉ còn {kg} kg, không đủ cho đơn này." and do not advance;
  - on `CoreUnavailable` show "Chưa ghi được vào sổ bán hàng của HTX. Thử lại sau." and do not advance;
  - orders with no lot-linked item advance as before.
- Cancelling a confirmed order that has `core_order_no` calls `cancel_retail` first, with the same failure rule.
- `external_ref` = the tea-shop order id.

Tests first, with the core mocked (monkeypatch `urllib.request.urlopen`): confirm success, stock short, core down, replay safety (a second confirm click after a success does not call twice), cancel, and the 250 g example.

Commit: `feat(tea-shop): sell packs from core lots and confirm orders through the core`.

### Task R1: season report (all sections but sales)

**Files:** `apps/web/src/domain/report/ports/ReportSource.ts`, `apps/web/src/application/report/SeasonReportUseCase.ts`, `apps/web/src/infrastructure/db/report/PrismaReportSource.ts`, `apps/web/src/app/api/reports/season.csv/route.ts`, tests (fake source plus Postgres opt-in `REPORT_TEST_DATABASE_URL`).

**Interfaces:**
- `SeasonReportUseCase.read(htxProfileId, from, to): Promise<SeasonReport>`:
  - each section is computed independently; a failure becomes `null` and is logged;
  - `sales` is `null` until R2, with the line `// TODO(R2): sales section after S8 merges`.
- Period rules:
  - tickets by `weighed_at` Vietnam day in the range;
  - settlement periods by `closed_at`;
  - batches by `finished_at`;
  - lots by `created_at`;
  - certificates valid on `to`;
  - sprayings approved: SPRAYING entries APPROVED with `entry_date` in the range;
  - harvests approved: `parcel_crop_cycles.harvested_at` in the range;
  - members are counted as of now.
- CSV: one table per section, columns in Vietnamese.

Commit: `feat(report): season and year report for the members' assembly`.

### Task R2 (after C merges): the sales section

Fill `sales` from the sales tables:
- wholesale and retail totals of CONFIRMED orders by `ordered_on`;
- kg sold;
- receivable at `to`: wholesale outstanding counting payments with `paid_on <= to`;
- the top 10 partners by amount.

Add its CSV.

Commit: `feat(report): sales in the season report`.

### Task F1 (Codex): sales screens and board block 5

**Files:** `apps/web/src/app/{manager,accountant}/sales/page.tsx`, `.../sales/[id]/page.tsx`, `.../sales/new/page.tsx`, `apps/web/src/components/features/sales/*`, `apps/web/src/lib/sales/types.ts` (re-export or mirror `domain/sales/views.ts`), the menu entry "Bán hàng" in both layouts, `apps/web/src/components/features/board/ReceivablesBlock.tsx`, tests.

- **List:** filters for kind, status, overdue and partner. The "Quá hạn" chip reads `?overdue=1`. Show the outstanding total, and link to "Công nợ thương lái" (receivables by partner).
- **New wholesale order:**
  - pick a partner from `/api/partners`;
  - add lines: a lot picker from `sellable-lots` showing the lot code, grade and remaining kg; kg with one decimal; price per kg; the live line amount and total;
  - due date prefilled to +30 days and editable.
  - Show 409 `LOT_STOCK_SHORT` with the remaining kg per lot.
- **Order detail:** lines, payments, "Ghi thu tiền" (amount prefilled with the outstanding), "Đổi hạn thanh toán", "Huỷ đơn" (manager only, needs a reason), and a print view for the delivery note (CSS print, A5).
- **Board block 5:**
  - `null` shows "Chưa tải được công nợ";
  - otherwise show the outstanding, the overdue count and amount in red when above 0, the top three partners, and a link to the sales list.
- Phone first, light and dark. Run `npx next build` before reporting.

### Task F2 (Codex): report pages

**Files:** `apps/web/src/app/{manager,accountant}/reports/page.tsx`, `apps/web/src/app/{manager,accountant}/reports/view/page.tsx`, `apps/web/src/components/features/report/*`, menu entry "Báo cáo vụ/năm", tests.

- **Picker:** this year, last year, or a custom range.
- **View:**
  - the seven sections in order, each with its own CSV link;
  - a null section shows "Chưa tải được phần này";
  - A4 print CSS (`@page { size: A4; margin: 15mm }`), with a header (cooperative name, period, generated time) and a signature row (Chủ tịch HĐQT, Kế toán).
- Until R1 merges, the page calls a local data function with a `// TODO(integration):` line.

## Verification at integration (controller)

- tsc, lint, jest twice, `next build`, tea-shop pytest.
- Throwaway Postgres with all migrations plus the GĐ2 flow data. Then the API flow:
  1. a wholesale order of 12.5 kg;
  2. a payment, and an overpayment that gives 409;
  3. a second order over the remaining stock, which gives 409;
  4. a cancel with payments, which gives 409;
  5. a retail order through the internal route using a manager token (and a farmer token, which gives 403);
  6. a replay, which returns the same order;
  7. the board receivables;
  8. the report and its CSV.
- Two UI rounds at desktop and mobile, light and dark.
