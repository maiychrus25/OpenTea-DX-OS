# Story 8.2: Officer Today Dashboard

**Status:** ready-for-dev
**Epic:** 8
**Source:** Video 2026-08-19 (1:43/2:42)

## Story
As an Officer, I want my dashboard to show 4 operational metrics + time-ordered task schedule, so I can prioritize field work.

## Acceptance Criteria

### AC-1: Page Header
- eyebrow amber pill: 5 viec can uu tien
- h1: Cong viec ky thuat hom nay
- Subtitle: Thu Nam, 13 thang 8 - Khu vuc Tan Phu
- Top-right: + Tao nhat ky (primary-button)

### AC-2: 4 Metric Cards
- Card 1: Thua can chu y = 05 (2 benh - 3 thieu nhat ky)
- Card 2: Cho duyet = 12 (Tu 7 nong ho)
- Card 3: Nghiem thu = 04 (Truoc 16:30 hom nay)
- Card 4: Ho da cap nhat = 14/18 (Tien do 78%)
- Uses MetricCard component from story 7-5

### AC-3: Task Schedule Section
Header: Lich cong viec / Uu tien theo thoi gian + + Them viec button
Columns: Thoi gian | Cong viec | Doi tuong | Trang thai
3 mock rows with status pills (amber/green/blue)

### AC-4: Sidebar Badge
Cong viec hom nay nav item shows lime badge with count 5

### AC-5: Mock Data only, license header on all new files

## Tasks
- [ ] Refactor (officer)/dashboard/page.tsx
- [ ] Add 4 MetricCards with mock data
- [ ] Add task schedule table with 3 mock rows
- [ ] Add badge to officer sidebar nav item
- [ ] npm run build passes

## Scope Boundary

This story is FE prototype work only. It uses deterministic fixtures and does not claim that officer metrics, schedules, or navigation badge persistence are implemented in the backend. The production integration follow-up must consume the officer dashboard contract and preserve server-side role authorization.

## Dev Notes


### 🚀 KHAI THÁC TỪ PROTOTYPE (D:\FE)
- **JSX/Mock data**: Copy trực tiếp từ function `TodayOfficer()` dòng 105-110 trong `D:\FE\components\agri-app.tsx`.
- **CSS**: Copy các class `.work-table`, `.table-head`, `.table-row` từ `D:\FE\app\globals.css` sang `src/styles/globals.css`.
