# Story 7.9a: BE Use Case — GetLotTraceDataUseCase

Status: backlog

> ⚠️ **P0 PREREQUISITE** — phải done trước story 7-9 (Public QR Trace Page)

## Story

As the public QR trace page (`/lot/[lot_code]`),
I need a dedicated API endpoint or Server-side Use Case that returns full traceability data for a lot,
so that the page can display product, origin, safety check, and journal timeline without complex inline queries.

## Problem Statement

Story 7-9 cần query phức tạp:
```
Lot → LotParcel → Parcel → Household (farmer)
Lot → LotParcel → Parcel → JournalEntry → JournalActivity (withdrawal_days)
Lot → LotParcel → Parcel → JournalEntry → approved_by (officer name)
Lot → certificate_keys (MinIO)
```

Schema phát hiện: `safe_harvest_date` **không có** trong `Lot`. Giá trị này phải được tính từ:
`MAX(JournalActivity.withdrawal_days)` của các activities thuộc lot → `entry_date + withdrawal_days`.

Cần: `GetLotTraceDataUseCase` trong application layer theo Hexagonal Architecture.

## Acceptance Criteria

1. `ILotTraceRepository` port tồn tại tại `domain/repositories/ILotTraceRepository.ts`
2. `GetLotTraceDataUseCase` tồn tại tại `application/useCases/GetLotTraceDataUseCase.ts`
3. Use case nhận `lot_code: string`, trả về `LotTraceData` object hoặc throw `NotFoundError`
4. `LotTraceData` bao gồm: lot info, parcels list, household info, journal entries (summary), computed `is_harvest_safe: boolean`, `latest_safe_harvest_date: Date | null`
5. `is_harvest_safe` được tính: nếu `latest_safe_harvest_date <= today` → `true`
6. `PrismaLotTraceRepository` implement `ILotTraceRepository`
7. Không cần tạo API route riêng — 7-9 Server Component gọi Use Case trực tiếp (Server Component pattern)
8. `npm run build` passes, TypeScript strict

## Tasks / Subtasks

- [ ] Tạo `src/domain/repositories/ILotTraceRepository.ts` (AC: 1)
- [ ] Tạo `src/domain/entities/LotTraceData.ts` — type/interface (AC: 4)
- [ ] Tạo `src/application/useCases/GetLotTraceDataUseCase.ts` (AC: 2, 3, 5)
- [ ] Tạo `src/infrastructure/db/repositories/PrismaLotTraceRepository.ts` (AC: 6)
- [ ] Cập nhật `7-9-public-qr-trace-page.md` — reference Use Case này

## Dev Notes

### LotTraceData interface

```typescript
// domain/entities/LotTraceData.ts
export interface LotJournalSummary {
  entry_date: Date
  activity_type: string
  performed_by: string
  approved_by_id: string | null
  withdrawal_days: number | null
}

export interface LotParcelInfo {
  parcel_code: string
  area_ha: number
  household_name: string
  crop_type: string
}

export interface LotTraceData {
  lot_code: string
  commodity: string
  quality_grade: string | null
  status: string
  packaging_date: Date | null
  total_weight_kg: number | null
  created_at: Date
  // Computed safety
  is_harvest_safe: boolean
  latest_safe_harvest_date: Date | null
  // Related data
  parcels: LotParcelInfo[]
  journal_summaries: LotJournalSummary[]
  certificate_keys: string[]
  htx_name: string | null
}
```

### Prisma query trong PrismaLotTraceRepository

```typescript
async getLotByCode(lot_code: string): Promise<LotTraceData | null> {
  const lot = await prisma.lot.findUnique({
    where: { lot_code },
    include: {
      lot_parcels: {
        include: {
          parcel: {
            include: {
              household: true,
              journal_entries: {
                include: { activities: true },
                where: { status: { not: 'PENDING_APPROVAL' } },
                orderBy: { entry_date: 'asc' },
                take: 20,
              }
            }
          }
        }
      }
    }
  })

  if (!lot) return null

  // Compute safe_harvest_date from max withdrawal_days
  let latestSafeDate: Date | null = null
  for (const lp of lot.lot_parcels) {
    for (const entry of lp.parcel.journal_entries) {
      for (const act of entry.activities) {
        if (act.withdrawal_days) {
          const safeDate = new Date(entry.entry_date)
          safeDate.setDate(safeDate.getDate() + act.withdrawal_days)
          if (!latestSafeDate || safeDate > latestSafeDate) {
            latestSafeDate = safeDate
          }
        }
      }
    }
  }

  const isHarvestSafe = latestSafeDate ? latestSafeDate <= new Date() : false

  return {
    lot_code: lot.lot_code,
    commodity: lot.commodity,
    quality_grade: lot.quality_grade,
    status: lot.status,
    packaging_date: lot.packaging_date,
    total_weight_kg: lot.total_weight_kg,
    created_at: lot.created_at,
    is_harvest_safe: isHarvestSafe,
    latest_safe_harvest_date: latestSafeDate,
    parcels: lot.lot_parcels.map(lp => ({
      parcel_code: lp.parcel.parcel_code,
      area_ha: lp.parcel.area_ha,
      household_name: lp.parcel.household.name,
      crop_type: lp.parcel.crop_type,
    })),
    journal_summaries: lot.lot_parcels.flatMap(lp =>
      lp.parcel.journal_entries.map(e => ({
        entry_date: e.entry_date,
        activity_type: e.activity_type,
        performed_by: e.performed_by,
        approved_by_id: e.approved_by_id,
        withdrawal_days: e.activities[0]?.withdrawal_days ?? null,
      }))
    ),
    certificate_keys: lot.certificate_keys,
    htx_name: null, // populated if htx_profile_id added in 7-0a
  }
}
```

### ILotTraceRepository

```typescript
// domain/repositories/ILotTraceRepository.ts
import { LotTraceData } from '../entities/LotTraceData'

export interface ILotTraceRepository {
  getLotByCode(lot_code: string): Promise<LotTraceData | null>
}
```

### GetLotTraceDataUseCase

```typescript
import { ILotTraceRepository } from '../../domain/repositories/ILotTraceRepository'
import { LotTraceData } from '../../domain/entities/LotTraceData'
import { NotFoundError } from '../../domain/errors'

export class GetLotTraceDataUseCase {
  constructor(private readonly repo: ILotTraceRepository) {}

  async execute(lot_code: string): Promise<LotTraceData> {
    const data = await this.repo.getLotByCode(lot_code)
    if (!data) throw new NotFoundError(`Lot ${lot_code} not found`)
    return data
  }
}
```

### Files

- `apps/web/src/domain/repositories/ILotTraceRepository.ts` (NEW)
- `apps/web/src/domain/entities/LotTraceData.ts` (NEW)
- `apps/web/src/application/useCases/GetLotTraceDataUseCase.ts` (NEW)
- `apps/web/src/infrastructure/db/repositories/PrismaLotTraceRepository.ts` (NEW)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
