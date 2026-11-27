// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { SprayEntry } from '@/domain/journal/blocking-sprays'
import type { DryTeaGrade } from '@/domain/processing/grades'
import type { SourceTicket } from '@/domain/processing/lot-sources'
import type { DryStockRow, LockedOutput, LotFromBatchesPort, LotFromBatchesUnit, NewLotFromBatches } from '@/domain/processing/ports/LotFromBatchesPort'

export const lotActor = { userId: 'off-1', role: 'officer', htxProfileId: 'htx-tc', htxCode: 'TC' }

export const sprayOf = (entryDate: string, safe: string, cycleId: string | null = 'cycle-1', status = 'APPROVED'): SprayEntry => ({
  status, entry_date: entryDate, cycle_id: cycleId, activities: [{ safe_harvest_date: safe }],
})

/** In-memory stock, tickets and lots. Transactions run one at a time, as the row locks make them. */
export class FakeLotBatchPort implements LotFromBatchesPort {
  outputs: (LockedOutput & { batch_id: string; batch_code: string })[] = []
  tickets: Record<string, SourceTicket[]> = {} // by output id
  sprays: Record<string, SprayEntry[]> = {} // by parcel id
  lots: NewLotFromBatches[] = []
  private tail: Promise<unknown> = Promise.resolve()

  addOutput(id: string, grade: DryTeaGrade, kg: number, over: Partial<LockedOutput> = {}) {
    this.outputs.push({ id, htx_profile_id: 'htx-tc', grade, kg, taken_kg: 0, batch_status: 'FINISHED', batch_id: `b-${id}`, batch_code: `TC-MS-${id}`, ...over })
    this.tickets[id] = [{ id: `t-${id}`, parcel_id: 'p-1', parcel_code: 'TC-A1', cycle_id: 'cycle-1', weighed_at: new Date('2026-11-27T03:00:00Z'), net_kg: '100.0' }]
  }

  inTransaction<T>(_ctx: unknown, work: (unit: LotFromBatchesUnit) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => work(this.unit()))
    this.tail = run.catch(() => undefined)
    return run
  }

  async stock(htx: string, grade: DryTeaGrade | undefined): Promise<DryStockRow[]> {
    return this.outputs
      .filter((o) => o.htx_profile_id === htx && o.batch_status === 'FINISHED' && (!grade || o.grade === grade) && o.kg - o.taken_kg > 0)
      .map((o) => ({ output_id: o.id, batch_id: o.batch_id, batch_code: o.batch_code, processed_on: '2026-11-27', grade: o.grade, kg: o.kg, remaining_kg: o.kg - o.taken_kg, recovery_ratio: 4.8, out_of_band: false }))
  }

  private unit(): LotFromBatchesUnit {
    return {
      lockOutputs: async (htx, ids) => this.outputs.filter((o) => ids.includes(o.id) && o.htx_profile_id === htx),
      stock: (htx, grade) => this.stock(htx, grade),
      sourceTickets: async (ids) => ids.flatMap((id) => this.tickets[id] ?? []),
      sprayEntries: async (parcelIds) => Object.fromEntries(parcelIds.map((p) => [p, this.sprays[p] ?? []])),
      createLot: async (lot) => {
        lot.sources.forEach((s) => { const o = this.outputs.find((x) => x.id === s.output_id)!; o.taken_kg = Math.round((o.taken_kg + s.kg) * 10) / 10 })
        this.lots.push(lot)
        const n = this.lots.length
        return { id: `lot-${n}`, lot_code: `${lot.htxCode}-CHE-${lot.harvestDay.replace(/-/g, '')}-${String(n).padStart(3, '0')}`, commodity: 'Chè', harvest_date: new Date(`${lot.harvestDay}T00:00:00Z`), estimated_weight_kg: lot.totalKg, actual_weight_kg: null, status: 'READY', parcel_count: lot.parcelLines.length, created_at: new Date('2026-11-28T03:00:00Z'), dry_grade: lot.grade }
      },
    }
  }
}
