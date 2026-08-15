---
baseline_commit: 06237e015c8cfe1f0ad16f05f12e744bdc88175c
---
# Story 7.8: Officer & Farmer Dashboard — Today Views

Status: done

## Story

As an Officer (Cán bộ kỹ thuật) or Farmer (Nông dân),
I want my dashboard to show a role-specific Today view matching the prototype design,
so that I immediately see my priorities for the day upon login.

## Acceptance Criteria

### Officer Today View
1. Hero: "Chào buổi .../chiều/tối, {userName}" + Pill tone=amber "5 việc cần ưu tiên"
2. Metric grid (4 cards): Hộ quản lý, Thửa đang theo dõi, Nhật ký chờ duyệt, Báo cáo bệnh mới
3. Work schedule table: Danh sách tasks ngày hôm nay (placeholder nếu chưa có API)
4. NavItems Officer layout được cập nhật theo prototype: Today, Bản đồ, Nhật ký, Lô hàng, Nhật ký bệnh, Tài liệu, Trợ lý, Tài khoản

### Farmer Today View
5. Hero: dark green `.farmer-hero`, greeting + 2 CTA buttons: "Ghi nhật ký" và "Chẩn đoán bệnh"
6. Crop status section: Pill status các thửa của farmer hiện tại
7. Weather widget: Nhiệt độ, Độ ẩm, Ghi chú thời tiết (data từ weather_cache)
8. NavItems Farmer layout: Today, Nhật ký, Chẩn đoán, Thửa của tôi, Bản tin, Tài khoản

### Common
9. Không có inline styles, `npm run build` passes
10. **Phụ thuộc:** Stories 7-4, 7-5 phải done

## Tasks / Subtasks

- [ ] Refactor `officer/dashboard/page.tsx` (AC: 1, 2, 3)
- [ ] Tạo `officer/dashboard/OfficerDashboard.module.css` (AC: 1–3)
- [ ] Cập nhật `officer/layout.tsx` navItems (AC: 4)
- [ ] Refactor `farmer/dashboard/page.tsx` (AC: 5, 6, 7)
- [ ] Tạo `farmer/dashboard/FarmerDashboard.module.css` (AC: 5–7)
- [ ] Cập nhật `farmer/layout.tsx` navItems (AC: 8)

## Dev Notes

### Officer navItems (cập nhật theo prototype)

```tsx
const navItems = [
  { label: 'Tổng quan', href: '/officer/dashboard', icon: <Home /> },
  { label: 'Bản đồ', href: '/officer/map', icon: <Map /> },
  { label: 'Nhật ký', href: '/officer/journal', icon: <FileText /> },
  { label: 'Lô hàng', href: '/officer/lots', icon: <PackageCheck /> },
  { label: 'Nhật ký bệnh', href: '/officer/disease', icon: <Stethoscope /> },
  { label: 'Tài liệu', href: '/officer/documents', icon: <FolderOpen /> },
  { label: 'Trợ lý', href: '/officer/assistant', icon: <Bot /> },
  { label: 'Tài khoản', href: '/officer/account', icon: <User /> },
]
```

### Farmer navItems (cập nhật theo prototype)

```tsx
const navItems = [
  { label: 'Tổng quan', href: '/farmer/dashboard', icon: <Home /> },
  { label: 'Nhật ký', href: '/farmer/journal', icon: <FileText /> },
  { label: 'Chẩn đoán', href: '/farmer/diagnosis', icon: <Stethoscope /> },
  { label: 'Thửa của tôi', href: '/farmer/parcels', icon: <Sprout /> },
  { label: 'Bản tin', href: '/farmer/bulletin', icon: <Newspaper /> },
  { label: 'Tài khoản', href: '/farmer/account', icon: <User /> },
]
```

### Officer Metric Data

```tsx
// Fetch in Server Component:
const householdCount = await prisma.household.count({ where: { htx_id: htxId } })
const parcelCount = await prisma.parcel.count({ where: { household: { htx_id: htxId } } })
const pendingJournals = await prisma.journalEntry.count({ where: { status: 'pending', ... } })
const diseaseReports = 0 // placeholder
```

### Farmer Hero Design

```css
/* Farmer hero: dark green gradient */
.farmerHero {
  background: linear-gradient(135deg, #143c2d 0%, #176c4b 100%);
  color: #fff; border-radius: 16px; padding: 28px 24px;
}
.ctaRow { display: flex; gap: 12px; margin-top: 20px; }
/* CTA buttons: white bg, green text */
.ctaButton { background: #fff; color: var(--primary); font-weight: 700; border: none; border-radius: 10px; }
```

### Weather Data

```tsx
const weather = await prisma.weatherCache.findFirst({
  orderBy: { cached_at: 'desc' },
  where: { location: htxLocation },
})
// Render: temperature, humidity, condition
```

### Files

- `apps/web/src/app/officer/dashboard/page.tsx` (MODIFY)
- `apps/web/src/app/officer/dashboard/OfficerDashboard.module.css` (NEW)
- `apps/web/src/app/officer/layout.tsx` (MODIFY)
- `apps/web/src/app/farmer/dashboard/page.tsx` (MODIFY)
- `apps/web/src/app/farmer/dashboard/FarmerDashboard.module.css` (NEW)
- `apps/web/src/app/farmer/layout.tsx` (MODIFY)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
