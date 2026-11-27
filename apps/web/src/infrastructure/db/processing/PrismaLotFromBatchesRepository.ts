// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import { WITHDRAWAL_EXCLUDED_STATUSES } from '@/domain/journal/withdrawal-status'
import type { DryStockRow, LockedOutput, LotFromBatchesPort, LotFromBatchesUnit } from '@/domain/processing/ports/LotFromBatchesPort'
import type { DryTeaGrade } from '@/domain/processing/grades'
import { nextLotCode } from '@/infrastructure/db/lot/PrismaLotRepository'

type Tx = Prisma.TransactionClient

const tenths = (value: { toString(): string }) => Math.round(Number(value.toString()) * 10)
const dayOf = (date: Date) => date.toISOString().slice(0, 10)

async function stockOf(db: Pick<Tx, 'processingBatchOutput'>, htxProfileId: string, grade: DryTeaGrade | undefined): Promise<DryStockRow[]> {
  const rows = await db.processingBatchOutput.findMany({
    where: { ...(grade ? { grade } : {}), batch: { htx_profile_id: htxProfileId, status: 'FINISHED' } },
    include: { batch: { select: { id: true, batch_code: true, processed_on: true, recovery_ratio: true, out_of_band: true } }, lot_sources: { select: { kg: true } } },
    orderBy: [{ batch: { processed_on: 'asc' } }, { batch: { batch_code: 'asc' } }, { grade: 'asc' }],
  })
  return rows
    .map((o) => ({ o, left: tenths(o.kg) - o.lot_sources.reduce((sum, s) => sum + tenths(s.kg), 0) }))
    .filter(({ left }) => left > 0)
    .map(({ o, left }) => ({
      output_id: o.id,
      batch_id: o.batch.id,
      batch_code: o.batch.batch_code,
      processed_on: dayOf(o.batch.processed_on),
      grade: o.grade,
      kg: Number(o.kg),
      remaining_kg: left / 10,
      recovery_ratio: Number(o.batch.recovery_ratio ?? 0),
      out_of_band: o.batch.out_of_band,
    }))
}

function unitOf(tx: Tx): LotFromBatchesUnit {
  return {
    async lockOutputs(htxProfileId, outputIds) {
      // Locked in id order so two lots over the same rows queue instead of deadlocking.
      const locked = await tx.$queryRaw<{ id: string; htx_profile_id: string; grade: DryTeaGrade; kg: string; batch_status: LockedOutput['batch_status'] }[]>`
        SELECT o.id, b.htx_profile_id, o.grade::text AS grade, o.kg::text AS kg, b.status::text AS batch_status
        FROM processing_batch_outputs o JOIN processing_batches b ON b.id = o.batch_id
        WHERE o.id = ANY(${outputIds}) AND b.htx_profile_id = ${htxProfileId}
        ORDER BY o.id FOR UPDATE OF o`
      if (locked.length === 0) return []
      // A separate statement, so it sees the lots that committed while this one waited for the lock.
      const taken = await tx.lotBatchSource.groupBy({ by: ['output_id'], where: { output_id: { in: locked.map((r) => r.id) } }, _sum: { kg: true } })
      const takenOf = new Map(taken.map((t) => [t.output_id, Number(t._sum.kg ?? 0)]))
      return locked.map((r) => ({ id: r.id, htx_profile_id: r.htx_profile_id, grade: r.grade, kg: Number(r.kg), taken_kg: takenOf.get(r.id) ?? 0, batch_status: r.batch_status }))
    },
    stock: (htxProfileId, grade) => stockOf(tx, htxProfileId, grade),
    async sourceTickets(outputIds) {
      const tickets = await tx.freshLeafTicket.findMany({
        where: { status: 'VALID', processing_batch: { outputs: { some: { id: { in: outputIds } } } } },
        select: { id: true, parcel_id: true, cycle_id: true, weighed_at: true, net_kg: true, parcel: { select: { parcel_code: true } } },
        orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }],
      })
      return tickets.map((t) => ({ id: t.id, parcel_id: t.parcel_id, parcel_code: t.parcel.parcel_code, cycle_id: t.cycle_id, weighed_at: t.weighed_at, net_kg: t.net_kg.toString() }))
    },
    async sprayEntries(parcelIds) {
      const entries = await tx.journalEntry.findMany({
        where: { parcel_id: { in: parcelIds }, status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] }, activities: { some: { safe_harvest_date: { not: null } } } },
        select: { parcel_id: true, status: true, entry_date: true, cycle_id: true, activities: { where: { safe_harvest_date: { not: null } }, select: { safe_harvest_date: true } } },
      })
      const byParcel: Record<string, (typeof entries)[number][]> = Object.fromEntries(parcelIds.map((id) => [id, []]))
      for (const entry of entries) byParcel[entry.parcel_id].push(entry)
      return byParcel
    },
    async createLot(lot) {
      const harvestDate = new Date(`${lot.harvestDay}T00:00:00Z`)
      const lotCode = await nextLotCode(tx, `${lot.htxCode}-CHE-${lot.harvestDay.replace(/-/g, '')}-`)
      const row = await tx.lot.create({
        data: {
          lot_code: lotCode,
          commodity: 'Chè',
          dry_grade: lot.grade,
          quality_grade: lot.gradeLabel,
          harvest_date: harvestDate,
          packaging_date: new Date(),
          estimated_weight_kg: lot.totalKg,
          total_weight_kg: lot.totalKg,
          packaging_type: lot.packagingType,
          destination: lot.destination,
          buyer_name: lot.buyerName,
          status: 'READY',
          created_by_id: lot.createdById,
          htx_profile_id: lot.htxProfileId,
          lot_parcels: { create: lot.parcelLines },
          batch_sources: { create: lot.sources.map((s) => ({ output_id: s.output_id, kg: s.kg.toFixed(1) })) },
        },
        include: { lot_parcels: true },
      })
      return {
        id: row.id,
        lot_code: row.lot_code,
        commodity: row.commodity,
        harvest_date: row.harvest_date,
        estimated_weight_kg: row.estimated_weight_kg,
        actual_weight_kg: row.actual_weight_kg,
        status: row.status,
        parcel_count: row.lot_parcels.length,
        created_at: row.created_at,
        dry_grade: lot.grade,
      }
    },
  }
}

export class PrismaLotFromBatchesRepository implements LotFromBatchesPort {
  inTransaction<T>(ctx: { actorId: string }, work: (unit: LotFromBatchesUnit) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      // Row audit events of these writes name the person.
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${ctx.actorId}`}, true)`
      return work(unitOf(tx))
    })
  }

  stock(htxProfileId: string, grade: DryTeaGrade | undefined) {
    return stockOf(prisma, htxProfileId, grade)
  }
}
