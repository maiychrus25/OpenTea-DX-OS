// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, DomainError, ForbiddenError, NotFoundError, UnprocessableError } from '@/domain/errors'
import type { BatchFilter, BatchOutputInput, BatchPort } from '@/domain/processing/ports/BatchPort'
import type { BatchDetail, BatchView } from '@/domain/processing/views'
import { batchTotals } from '@/domain/processing/batch-math'
import type { TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'
import { vnDayOf } from '@/application/agent/campaign/vn-day'

export interface BatchActor {
  userId: string
  role: string
  htxProfileId: string
  htxCode: string
}

const DAY_MS = 24 * 60 * 60 * 1000
export const MIN_DEVIATION_NOTE = 10

function assertWorkshopRole(actor: BatchActor): void {
  if (actor.role !== 'officer' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')
}

const ctxOf = (actor: BatchActor) => ({ htxProfileId: actor.htxProfileId, htxCode: actor.htxCode, actorId: actor.userId })

/** Locks the batch and refuses unless it is still open. Every change of a batch starts here. */
async function lockOpen(unit: Parameters<Parameters<BatchPort['inTransaction']>[1]>[0], actor: BatchActor, id: string) {
  const row = await unit.lock(actor.htxProfileId, id)
  if (!row) throw new NotFoundError('Không tìm thấy mẻ sao')
  if (row.status !== 'OPEN') throw new ConflictError('BATCH_NOT_OPEN', 'Mẻ này đã hoàn thành hoặc đã huỷ nên không sửa được.')
  return row
}

export class ListBatches {
  constructor(private readonly port: BatchPort) {}
  async execute(actor: BatchActor, filter: BatchFilter): Promise<BatchView[]> {
    assertWorkshopRole(actor)
    return this.port.list(actor.htxProfileId, filter)
  }
}

export class GetBatch {
  constructor(private readonly port: BatchPort) {}
  async execute(actor: BatchActor, id: string): Promise<BatchDetail> {
    assertWorkshopRole(actor)
    const detail = await this.port.get(actor.htxProfileId, id)
    if (!detail) throw new NotFoundError('Không tìm thấy mẻ sao')
    return detail
  }
}

export class AvailableTickets {
  constructor(private readonly port: BatchPort, private readonly clock: () => Date = () => new Date()) {}
  async execute(actor: BatchActor, range: { from?: string; to?: string }): Promise<TicketView[]> {
    assertWorkshopRole(actor)
    const now = this.clock()
    // Default: the last 30 Vietnam days, today included.
    return this.port.availableTickets(actor.htxProfileId, range.from ?? vnDayOf(new Date(now.getTime() - 29 * DAY_MS)), range.to ?? vnDayOf(now))
  }
}

export class CreateBatch {
  constructor(private readonly port: BatchPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: BatchActor, input: { processed_on: string; master_name?: string; shift?: string; notes?: string }): Promise<BatchView> {
    assertWorkshopRole(actor)
    if (input.processed_on > vnDayOf(this.clock())) throw new DomainError('Ngày chế biến không được sau hôm nay.')
    return this.port.inTransaction(ctxOf(actor), async (unit) => {
      const code = await unit.nextBatchCode(actor.htxCode, input.processed_on)
      const id = await unit.insert({
        htxProfileId: actor.htxProfileId,
        batchCode: code,
        processedOn: input.processed_on,
        masterName: input.master_name ?? null,
        shift: input.shift ?? null,
        notes: input.notes ?? null,
        createdById: actor.userId,
      })
      return unit.view(id)
    })
  }
}

export class AddTickets {
  constructor(private readonly port: BatchPort) {}

  async execute(actor: BatchActor, id: string, ticketIds: string[]): Promise<BatchDetail> {
    assertWorkshopRole(actor)
    return this.port.inTransaction(ctxOf(actor), async (unit) => {
      await lockOpen(unit, actor, id)
      const taken = await unit.attachTickets(actor.htxProfileId, id, ticketIds)
      // Any other count means a ticket was voided, batched or is not the HTX's: nothing is kept.
      if (taken !== ticketIds.length) throw new ConflictError('TICKETS_CHANGED', 'Có phiếu cân vừa thay đổi (đã huỷ hoặc đã vào mẻ khác). Tải lại danh sách rồi chọn lại.')
      return unit.detail(id)
    })
  }
}

export class RemoveTicket {
  constructor(private readonly port: BatchPort) {}

  async execute(actor: BatchActor, id: string, ticketId: string): Promise<BatchDetail> {
    assertWorkshopRole(actor)
    return this.port.inTransaction(ctxOf(actor), async (unit) => {
      await lockOpen(unit, actor, id)
      if ((await unit.detachTicket(id, ticketId)) === 0) throw new NotFoundError('Phiếu cân không nằm trong mẻ này')
      return unit.detail(id)
    })
  }
}

export class SetOutputs {
  constructor(private readonly port: BatchPort) {}

  async execute(actor: BatchActor, id: string, outputs: BatchOutputInput[]): Promise<BatchDetail> {
    assertWorkshopRole(actor)
    return this.port.inTransaction(ctxOf(actor), async (unit) => {
      await lockOpen(unit, actor, id)
      await unit.replaceOutputs(id, outputs)
      return unit.detail(id)
    })
  }
}

export class FinishBatch {
  constructor(private readonly port: BatchPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: BatchActor, id: string, input: { deviation_note?: string }): Promise<BatchDetail> {
    assertWorkshopRole(actor)
    return this.port.inTransaction(ctxOf(actor), async (unit) => {
      await lockOpen(unit, actor, id)
      const { ticketNetKg, outputKg } = await unit.totals(id)
      if (ticketNetKg.length === 0 || outputKg.length === 0) throw new UnprocessableError('BATCH_EMPTY', 'Mẻ cần ít nhất một phiếu cân và một dòng sản lượng chè khô.')
      const totals = batchTotals(ticketNetKg, outputKg)
      const note = input.deviation_note?.trim() ?? ''
      if (totals.outOfBand && note.length < MIN_DEVIATION_NOTE) {
        throw new UnprocessableError('DEVIATION_NOTE_REQUIRED', `Tỷ lệ ${totals.ratio} nằm ngoài khoảng chuẩn. Cần ghi giải trình ít nhất ${MIN_DEVIATION_NOTE} ký tự.`, { recovery_ratio: totals.ratio })
      }
      await unit.finish(id, {
        freshKg: totals.freshKg,
        dryKg: totals.dryKg,
        ratio: totals.ratio as number,
        outOfBand: totals.outOfBand,
        deviationNote: totals.outOfBand ? note : null,
        userId: actor.userId,
        at: this.clock(),
      })
      return unit.detail(id)
    })
  }
}

export class CancelBatch {
  constructor(private readonly port: BatchPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: BatchActor, id: string, reason: string): Promise<BatchView> {
    assertWorkshopRole(actor)
    return this.port.inTransaction(ctxOf(actor), async (unit) => {
      await lockOpen(unit, actor, id)
      await unit.cancel(id, { reason, userId: actor.userId, at: this.clock() })
      return unit.view(id)
    })
  }
}
