# Production Deviation Register

This register tracks known deviations from the expected target state in production (MVP).
All items must have a clear owner, justification, and either an accepted exception or a targeted fix story.

| ID | Category | Description | Status | Owner | Dependency/Target Fix |
|---|---|---|---|---|---|
| DEV-001 | Styling | Inline styles (`style={{...}}`) present in some components (e.g., `PartnerMap`, `DocumentView`). | Deferred | FE Team | Post-MVP Cleanup Story |
| DEV-002 | UX/UI | NotificationBell TTS `/api/tts` placeholder used. | Fixed | FE Team | Story 0.3 |
| DEV-003 | Transport | NotificationBell relies on polling (fallback) instead of SSE for realtime updates. | Accepted Interim | Platform Team | Pending SSE Infrastructure |
| DEV-004 | Security | Route-group bypass in middleware exposed canonical pages at root (e.g. `(manager)/farm-zone` as `/farm-zone`). | Fixed | Arch Team | Story 0.3 |
| DEV-005 | Error State | `public invalid-lot 200/loading` deviation from Story 0-2 (200 OK returned during loading instead of proper boundary). | Tracked | FE Team | Hardening 0-3 Tests |
| DEV-006 | UX/UI | Broken or missing sidebar routes in navigation menus. | Deferred | FE Team | Post-MVP Cleanup Story |

## Detailed Notes

### SSE vs Polling
Currently, the notification system uses polling `useSWR(..., { refreshInterval: 60000 })` as an interim fallback.
We have accepted this for MVP to avoid deploying a separate Redis/SSE broadcaster right now, but SSE remains the target contract. 
**Do not remove polling until SSE parity is fully established.**

### Inline Styles
`style={{}}` usage is restricted. Existing violations are documented and deferred to a dedicated post-MVP styling cleanup epic unless they were trivial to fix during 0-3.

### Public invalid-lot 200/loading deviation
Tracked from story 0-2. A public query for an invalid lot might render a 200 OK with a loading state instead of an immediate 404/error boundary. This is being tracked for regression testing in 0-3.

---

## Strategic & Domain Alignment Deviations (2026-11-28 Audit)

Các sai lệch cấp kiến trúc nghiệp vụ và sản phẩm được phát hiện trong đợt kiểm toán `2026-11-28` và gắn lộ trình khắc phục theo [`docs/product-roadmap.md`](./product-roadmap.md):

| ID | Category | Description | Status | Owner | Target Fix |
|---|---|---|---|---|---|
| DEV-007 | Security / Tenant | `partners` table lacks `htx_profile_id` and `POST/PUT /api/partners`, `GET /api/members`, `/api/search` lack strict role/tenant guards. | Fixed (GĐ0) | Core Team | GĐ 0 |
| DEV-008 | Trust / Security | `/q/[lot_code]` reads unauthenticated `?status=revoked` URL override allowing status spoofing; `/q/` and `/lot/` duplicate public traceability pages. | Partially fixed (GĐ0): tham số `?status=` đã gỡ; còn `/q/` và `/lot/` trùng nhau, hợp nhất ở GĐ 2 | Core Team | GĐ 0 & GĐ 2 |
| DEV-009 | UX / Trust Debt | Hardcoded sample/mock UI (`Reels`, Officer 5 sample shop/tour pages, `CameraWatch`, `TodayTasks`, `SampleYieldChart`, `/forgot-pin` demo, `CertificateManager` RAM state) mixed into production menus. | Fixed (GĐ0) | FE & PO | GĐ 0 |
| DEV-010 | Domain / Tea | `JournalEntry` and `LotParcel` lack `parcel_crop_cycle_id` FK; post-harvest tending transitions `parcel.status` to `TENDING` without opening a new `ParcelCropCycle` (trapping subsequent flushes); `REJECTED` journals still count toward PHI locks; rice copy (`Gieo sạ`) persists. | Partially fixed (GĐ0): nhật ký `REJECTED` không còn tính cách ly, thuật ngữ lúa đã đổi; còn thiếu `parcel_crop_cycle_id` và tự mở lứa mới, làm ở GĐ 1 | Core Team | GĐ 0 & GĐ 1 |
| DEV-011 | Value Chain | `miniapps/leaf-purchase` and `miniapps/farm-supply` run in isolated `app_*` schemas: fresh-leaf intake does not check Core PHI (`safe_harvest_date`), lacks `parcel_id`/`lot_id`, cannot offset input debt against leaf payouts, and bypasses `audit.events`. | Tracked | Core & App Team | GĐ 1 |
| DEV-012 | Value Chain | Missing `ProcessingBatch` (fresh-to-dry tea conversion ~4.5–5:1, grading) between fresh-leaf intake and finished `Lot`; `tea-shop` inventory and `order_items` are disconnected from `Lot` stock. | Tracked | Core Team | GĐ 2 & GĐ 3 |
| DEV-013 | Auth / Roles | `roleFromRealmRoles` collapses multi-role users to one role; missing `accountant` and `platform_admin` roles; mandatory `CONFIGURE_TOTP` and required `email` block rural adoption. | Tracked | Auth & Core | GĐ 1 |
| DEV-014 | Data / Pipelines | `vietnam_market_sync.json` generates `Math.random()` prices; `nasa_power_sync.json` hardcodes `28.5`; macro cereal/MFN import workflows and dual manager dashboards misalign with tea cooperative pricing. | Partially fixed (GĐ0): 5 workflow giả hoặc lệch miền đã xoá, comtrade chỉ còn HS `0902`; còn hai bảng điều hành, gộp ở GĐ 3 | Data & PO | GĐ 0 & GĐ 3 |
| DEV-015 | AI / Disease | `tea_leaf_model.keras` (Kenya/Bangladesh datasets, 12–35% cross-source accuracy, 98.8% `healthy` on random noise) lacks Vietnamese tea pests (*rầy xanh, bọ cánh tơ, nhện đỏ, phồng lá*); `/officer/diseases` prescription is unstructured text without auto-locking PHI. | Tracked | AI & Core | GĐ 1 & GĐ 4 |
| DEV-016 | Architecture / Docs | Out-of-scope standalone clients (`staff-desktop`, `staff-mobile`, `hub-mobile`), `Autopilot` `harvest.approve` execution, and `App Factory` conflict with Poka-yoke safety/SaaS TCO principles; `docs/database-schema.md` drifted from `schema.prisma`. | Partially fixed (GĐ0): `harvest.approve`, `journal.approve` và hành động `money` luôn `never`, các tính năng ngoài luồng đóng băng sau `DXOS_LABS`; còn lệch `database-schema.md` so với `schema.prisma` chưa rà hết, chưa gán giai đoạn | PO & Arch | GĐ 0 (Freeze & ADR 0005) |
