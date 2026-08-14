# Story 7.10: Public HTX Storefront — `/htx/[slug]`

Status: backlog

## Story

As a buyer or trading partner visiting a cooperative's public profile,
I want to see the HTX's capability, available lots, and contact information without logging in,
so that I can make informed purchasing decisions.

## Acceptance Criteria

1. Route `/htx/[htx_code]` exists (KHÔNG phải `[slug]` — `HtxProfile` không có slug field, dùng `htx_code` thay thế), **Server Component**, NO auth required
2. **Hero section:** Tên HTX, tỉnh/địa điểm, Pill tone=green "Đang hoạt động", avatar/logo placeholder
3. **Stats row:** Số hộ nông dân (`prisma.household.count`), Diện tích canh tác (`htxProfile.total_area_ha`), Lô hàng sẵn sàng (`prisma.lot.count` — cần 7-0a), Năm hoạt động (`htxProfile.created_at.getFullYear()`)
4. **Lot list:** Danh sách `Lot` có `status = 'READY'` thuộc HTX (cần 7-0a để query `htx_profile_id`): tên sản phẩm, số lượng, Pill status, nút "Liên hệ"
5. **Contact section:** Số điện thoại (`contact_phone`), Email liên hệ (`contact_email`) từ `HtxProfile`
6. **404:** Nếu `htx_code` không tìm được HTX → `notFound()`
7. **Next.js 14 syntax:** `params: { htx_code: string }` (sync)
8. **SEO:** `generateMetadata` — title "Hồ sơ năng lực HTX — {htxName}"
9. Layout: `.store-shell` — max-width 800px, centered
10. `npm run build` passes, middleware confirms route `/htx/:path*` is public
11. **Phụ thuộc:** Story **7-0a (schema migration) phải done trước** để query lots theo HTX

## Tasks / Subtasks

- [ ] Tạo `app/htx/[slug]/page.tsx` (AC: 1–6, 7, 8)
- [ ] Tạo `app/htx/[slug]/_components/StorefrontView.tsx` (AC: 2–5)
- [ ] Tạo `app/htx/[slug]/storefront.module.css` (AC: 9)
- [ ] Verify middleware: `/htx/:path*` is public

## Dev Notes

### Data Query

```typescript
// Find HTX by slug (slug = htx_profile.slug or derived from name)
const htx = await prisma.htxProfile.findUnique({
  where: { slug },
  include: {
    lots: {
      where: { status: 'ready' },
      include: { parcel_crop_cycle: true },
      orderBy: { created_at: 'desc' },
    },
    _count: { select: { households: true } },
  },
})
if (!htx) notFound()
```

> **Note:** Kiểm tra `HtxProfile` model trong `schema.prisma` — nếu không có `slug` field thì dùng `id` hoặc `name` làm slug. Cần confirm với database-schema.md.

### Stats Calculation

```typescript
const totalHa = await prisma.parcel.aggregate({
  _sum: { area_ha: true },
  where: { household: { htx_id: htx.id } },
})
const activeYears = new Date().getFullYear() - htx.founded_year
```

### Layout CSS

```css
.storeShell { max-width: 800px; margin: 0 auto; padding: 28px 20px 60px; }
.storeHero { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 28px; }
.statsRow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
.lotList { display: flex; flex-direction: column; gap: 12px; }
.lotCard { border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; }
```

### Files

- `apps/web/src/app/htx/[slug]/page.tsx` (NEW)
- `apps/web/src/app/htx/[slug]/_components/StorefrontView.tsx` (NEW)
- `apps/web/src/app/htx/[slug]/storefront.module.css` (NEW)
- `apps/web/src/middleware.ts` (MODIFY — verify public route `/htx/:path*`)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
