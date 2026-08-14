# Story 7.0a: Schema Migration — Add htx_profile_id to Household & Lot

Status: backlog

> ⚠️ **P0 PREREQUISITE** — phải done trước stories: 7-7, 7-10
> **Requires DB migration** — cần hỏi developer trước khi implement (per AGENTS.md rule)

## Story

As a developer,
I want `Household` and `Lot` models to have direct foreign keys to `HtxProfile`,
so that dashboard stats and storefront queries can efficiently filter data by HTX without multi-hop joins.

## Problem Statement

Hiện tại schema có vấn đề sau:
- `Household` không có `htx_profile_id` → không thể query "households của HTX X"
- `Lot` không có `htx_profile_id` → không thể query "lots của HTX X" (phải join qua LotParcel → Parcel → Household → ???)

Story 7-7 (Manager Dashboard) cần: `SELECT COUNT(*) FROM lots WHERE htx_profile_id = ? AND status = 'READY'`  
Story 7-10 (HTX Storefront) cần: `SELECT * FROM lots WHERE htx_profile_id = ? AND status = 'READY'`  

Cả hai query không thể thực hiện với schema hiện tại.

## Acceptance Criteria

1. `Household` có thêm field `htx_profile_id: String?` → FK → `HtxProfile`
2. `Lot` có thêm field `htx_profile_id: String?` → FK → `HtxProfile`
3. Prisma migration chạy thành công (`prisma migrate dev`)
4. Prisma client được regenerate (`prisma generate`)
5. Existing data không bị mất (migration additive only)
6. `HtxProfile` có relation `households Household[]` và `lots Lot[]`
7. `npm run build` passes sau migration

## Tasks / Subtasks

- [ ] Cập nhật `apps/web/prisma/schema.prisma` (AC: 1, 2, 6)
  ```prisma
  model HtxProfile {
    // ... existing fields ...
    households Household[]
    lots       Lot[]
  }

  model Household {
    // ... existing fields ...
    htx_profile_id String?
    htx_profile    HtxProfile? @relation(fields: [htx_profile_id], references: [id])
  }

  model Lot {
    // ... existing fields ...
    htx_profile_id String?
    htx_profile    HtxProfile? @relation(fields: [htx_profile_id], references: [id])
  }
  ```
- [ ] Chạy `npx prisma migrate dev --name "add_htx_relations"` (AC: 3)
- [ ] Chạy `npx prisma generate` (AC: 4)
- [ ] Verify build (AC: 7)

## Dev Notes

### Nullable fields (safe migration)
Cả `Household.htx_profile_id` và `Lot.htx_profile_id` đều nullable (`String?`) để không break existing data. Application code sẽ set giá trị khi tạo mới.

### Data backfill (optional)
Nếu có existing data cần backfill: tạo seed script hoặc migration SQL riêng.

### Files
- `apps/web/prisma/schema.prisma` (MODIFY)
- `apps/web/prisma/migrations/*` (AUTO-GENERATED)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
