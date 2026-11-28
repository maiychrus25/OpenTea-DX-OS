// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, ForbiddenError, UnprocessableError } from '@/domain/errors'
import { DRY_TEA_GRADE_LABELS, type DryTeaGrade } from '@/domain/processing/grades'
import { ticketBlock } from '@/domain/processing/lot-sources'
import type { LotFromBatchesPort } from '@/domain/processing/ports/LotFromBatchesPort'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { viDate } from '@/application/weighing/withdrawal-gate'

export interface LotActor {
  userId: string
  role: string
  htxProfileId: string
  htxCode: string
}

export interface LotFromBatchesInput {
  grade: DryTeaGrade
  sources: { output_id: string; kg: number }[]
  packaging_type?: string
  destination?: string
  buyer_name?: string
}

const tenths = (kg: number) => Math.round(kg * 10)

const STOCK_CHANGED_VI = 'Tồn chè khô vừa thay đổi. Kiểm tra lại số kg rồi đóng lô.'

/** Closes a lot from dry tea stock: spec §4.3 steps 1 to 6, in one transaction that holds the stock rows. */
export class CreateLotFromBatchesUseCase {
  constructor(private readonly port: LotFromBatchesPort) {}

  async execute(actor: LotActor, input: LotFromBatchesInput) {
    if (actor.role !== 'officer' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    return this.port.inTransaction({ actorId: actor.userId }, async (unit) => {
      const changed = async () => new ConflictError('STOCK_CHANGED', STOCK_CHANGED_VI, { stock: await unit.stock(actor.htxProfileId, input.grade) })

      // 1. Lock the rows. 2. Every one must be ours, finished, of the lot's grade, with enough left.
      const outputIds = input.sources.map((s) => s.output_id)
      const rows = new Map((await unit.lockOutputs(actor.htxProfileId, outputIds)).map((r) => [r.id, r]))
      if (outputIds.some((id) => rows.get(id)?.batch_status !== 'FINISHED')) throw await changed()
      if (outputIds.some((id) => rows.get(id)?.grade !== input.grade)) {
        throw new UnprocessableError('GRADE_MISMATCH', 'Có dòng tồn không cùng hạng với lô.')
      }
      for (const source of input.sources) {
        const row = rows.get(source.output_id)!
        if (tenths(source.kg) > tenths(row.kg) - tenths(row.taken_kg)) throw await changed()
      }

      // 3. Every valid ticket of the source batches must have been safe on its own weigh day.
      const tickets = await unit.sourceTickets(outputIds)
      if (tickets.length === 0) throw await changed()
      const sprays = await unit.sprayEntries(Array.from(new Set(tickets.map((t) => t.parcel_id))))
      for (const ticket of tickets) {
        const weighedOn = vnDayOf(ticket.weighed_at)
        const safeOn = ticketBlock(sprays[ticket.parcel_id] ?? [], weighedOn, ticket.cycle_id)
        if (safeOn) {
          throw new UnprocessableError(
            'WITHDRAWAL_NOT_PASSED',
            `Thửa ${ticket.parcel_code} có phiếu cân ngày ${viDate(weighedOn)} chưa qua thời gian cách ly. An toàn thu hoạch từ ngày ${viDate(safeOn)}.`,
            { parcel_code: ticket.parcel_code, weighed_on: weighedOn, safe_on: safeOn },
          )
        }
      }

      // 4-6. The lot takes the sum of the kg, the latest weigh day, and one line per parcel with its latest ticket's flush.
      const latestByParcel = new Map<string, (typeof tickets)[number]>()
      for (const ticket of tickets) {
        const seen = latestByParcel.get(ticket.parcel_id)
        if (!seen || ticket.weighed_at > seen.weighed_at) latestByParcel.set(ticket.parcel_id, ticket)
      }
      const harvestDay = tickets.map((t) => vnDayOf(t.weighed_at)).sort().pop() as string
      return unit.createLot({
        htxProfileId: actor.htxProfileId,
        htxCode: actor.htxCode,
        createdById: actor.userId,
        grade: input.grade,
        gradeLabel: DRY_TEA_GRADE_LABELS[input.grade],
        harvestDay,
        totalKg: input.sources.reduce((sum, s) => sum + tenths(s.kg), 0) / 10,
        packagingType: input.packaging_type ?? null,
        destination: input.destination ?? null,
        buyerName: input.buyer_name ?? null,
        parcelLines: Array.from(latestByParcel.values()).map((t) => ({ parcel_id: t.parcel_id, cycle_id: t.cycle_id })),
        sources: input.sources,
      })
    })
  }
}
