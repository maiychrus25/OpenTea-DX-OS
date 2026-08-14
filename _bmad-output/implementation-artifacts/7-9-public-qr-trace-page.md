# Story 7.9: Public QR Trace Page — `/lot/[lot_code]`

Status: backlog

## Story

As a buyer or consumer scanning a QR code,
I want to view the full traceability information of an agricultural lot without needing to log in,
so that I can verify the origin, farming journal, and safety status of the product.

## Acceptance Criteria

1. Route `/lot/[lot_code]` exists, **Server Component**, NO auth required
2. **Section 1 — Product & Lot info:** Tên sản phẩm, Mã lô (`lot_code`), Ngày xuất, Trạng thái (Pill), HTX tên
3. **Section 2 — Origin:** Tên hộ nông dân, Tên thửa, Tọa độ (nếu có), Cán bộ kỹ thuật phê duyệt
4. **Section 3 — Safety check:** Dữ liệu từ `GetLotTraceDataUseCase` (7-9a). `is_harvest_safe=true` → Pill green "An toàn"; `is_harvest_safe=false` → Pill amber "Cần kiểm tra"
5. **Section 4 — Journal timeline:** Từ `LotTraceData.journal_summaries` (date + activity_type + performed_by)
6. **Section 5 — Certifications:** Link PDF từ `LotTraceData.certificate_keys` → MinIO pre-signed URLs qua `/api/lot/[lot_code]/certificate` endpoint
7. **Mandatory disclaimer** cuối trang: "DX AgriMarket không chỉnh sửa hoặc xác nhận thay cho cán bộ kỹ thuật."
8. **404:** Nếu `lot_code` không tồn tại → `GetLotTraceDataUseCase` throw `NotFoundError` → `notFound()`
9. **Next.js 14 syntax:** `params: { lot_code: string }` (KHÔNG dùng `await params`)
10. **SEO:** `generateMetadata` với title + description
11. Layout dùng `.trace-shell`: `max-width: 640px; margin: 0 auto; padding: 28px 20px 60px;`
12. `npm run build` passes
13. **Phụ thuộc:** Story **7-9a (GetLotTraceDataUseCase) phải done trước**


## Tasks / Subtasks

- [ ] Tạo `app/lot/[lot_code]/page.tsx` (AC: 1, 2–8, 9, 10)
  - `generateMetadata({ params })` — sync params Next.js 14
  - `default function TracePage({ params: { lot_code } })`
  - Fetch lot data: `prisma.lot.findUnique({ where: { lot_code }, include: { ... } })`
  - Nếu null → `notFound()`
  - Render 5 sections + disclaimer
- [ ] Tạo `app/lot/[lot_code]/_components/TraceView.tsx` (AC: 2–7)
  - Client component nếu cần interactivity, Server Component nếu không
- [ ] Tạo `app/lot/[lot_code]/trace.module.css` (AC: 11)
  - `.traceShell`, `.traceHeader`, `.section`, `.timeline`, `.disclaimer`
- [ ] Verify no auth middleware blocking this route

## Dev Notes

### Route Structure

```
app/
  lot/
    [lot_code]/
      page.tsx          ← Server Component
      _components/
        TraceView.tsx
      trace.module.css
```

### Data Query

```typescript
const lot = await prisma.lot.findUnique({
  where: { lot_code },
  include: {
    parcel_crop_cycle: {
      include: {
        parcel: { include: { household: true } },
        journal_entries: {
          include: { activities: true, approved_by: true },
          orderBy: { entry_date: 'asc' },
        },
      },
    },
    approved_by: true,
    htx_profile: true,
    lot_certificates: true,
  },
})
if (!lot) notFound()
```

### Withdrawal Check Logic

```typescript
function isHarvestSafe(safeHarvestDate: Date | null): boolean {
  if (!safeHarvestDate) return false
  return safeHarvestDate <= new Date()
}
```

### Disclaimer (MANDATORY)

```tsx
<p className={styles.disclaimer}>
  <Info />
  DX AgriMarket không chỉnh sửa hoặc xác nhận thay cho cán bộ kỹ thuật.
  Thông tin hiển thị được ghi nhận bởi cán bộ kỹ thuật được phân công.
</p>
```

### Middleware — Ensure Route is Public

Kiểm tra `apps/web/src/middleware.ts` — route `/lot/:path*` phải được exclude khỏi auth check.

```typescript
// middleware.ts — verify this pattern exists:
const publicRoutes = ['/lot/:path*', '/htx/:path*', '/login']
```

### MinIO Pre-signed URLs

```typescript
// Chỉ generate pre-signed URL trong API route, KHÔNG trong Server Component
// Nếu cần: tạo API route /api/lot/[lot_code]/certificate/[id]/url
// Hiện tại: render link tới /api/... route cho PDF download
```

### Files

- `apps/web/src/app/lot/[lot_code]/page.tsx` (NEW)
- `apps/web/src/app/lot/[lot_code]/_components/TraceView.tsx` (NEW)
- `apps/web/src/app/lot/[lot_code]/trace.module.css` (NEW)
- `apps/web/src/middleware.ts` (MODIFY — verify public route)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
