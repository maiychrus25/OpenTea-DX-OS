# Story 8.3: Lot List Page — Filter Tabs, Table & Create CTA

**Status:** ready-for-dev
**Epic:** 8 — FE Prototype Reconstruction (Phase 2)
**Source:** Video 2026-08-19 (timestamp 1:02/2:42)

## Story
As a Manager (Truong HTX), I want the Lo hang & truy xuat page to list all lots in a table with filter tabs (Tat ca / San sang / Da xuat QR), a search box, and a visually consistent lot action area, so I can track lot statuses at a glance while mutation remains restricted to the Officer workflow.

## Acceptance Criteria

### AC-1: Page Header
- eyebrow: LO HANG & TRUY XUAT
- h1: San sang giao thuong
- Subtitle: Kiem soat nghiem thu, ho so va ma QR truoc khi xuat hang.
- Top-right: + Tao lo hang (primary-button green) is a prototype-only CTA; production Manager UI must render it as a read-only/deep-link action until Officer lot creation is integrated.

### AC-2: Filter Bar
- Search box (searchbox class): placeholder Tim ma lo, san pham...
- Filter tabs: Tat ca [3] | San sang [1] | Da xuat QR [1]
- Active tab has green border + green text

### AC-3: Lot Table
- Table header: Ma lo | San pham & nguon | San luong | Trang thai | (QR icon col)
- 3 mock rows:
  - LH-260813 | Cai ngot - 4 thua | 2.450 kg | San sang (green pill) | QR icon
  - LH-260810 | Xa lach - 3 thua | 1.820 kg | Da xuat QR (blue pill) | QR icon
  - LH-260806 | Dua leo - 5 thua | 3.100 kg | Nhap (amber pill) | QR icon
- Row hover: background #f4f9f5

### AC-4: Responsive
- Table overflows horizontally on mobile with min-width

### AC-5: Mock Data + License Header
- All data hardcoded. No console.log.

## Tasks
- [ ] Refactor (manager)/lots/page.tsx (or create if missing)
- [ ] Add filter bar with 3 tabs + search box
- [ ] Add lot table with 3 mock rows
- [ ] Add Create Lot CTA button
- [ ] npm run build passes

## Scope Boundary

This is FE prototype work only. The Manager list is read-only in the production contract; create/edit/export mutations remain Officer-owned and are integrated separately.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy trực tiếp function `LotsView()` (L172-174) và mảng `lots[]` (L57-61) trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.filter-row`, `.searchbox`, `.filter`, `.filter.active`, `.lot-table` từ `D:\FE\app\globals.css`.
