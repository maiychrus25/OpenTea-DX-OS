// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { BatchFilter, BatchOutputInput, BatchPort, BatchUnit } from '@/domain/processing/ports/BatchPort'
import type { BatchDetail, BatchStatus, BatchView } from '@/domain/processing/views'
import type { TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'
import { batchCode, batchTotals } from '@/domain/processing/batch-math'

export const actor = { userId: 'off-1', role: 'officer', htxProfileId: 'htx-tc', htxCode: 'TC' }
export const NOW = new Date('2026-11-28T03:00:00Z') // 10:00 on 2026-11-28 in Vietnam

interface Row {
  id: string
  htx: string
  code: string
  processed_on: string
  status: BatchStatus
  master_name: string | null
  shift: string | null
  notes: string | null
  fresh: number | null
  dry: number | null
  ratio: number | null
  out_of_band: boolean
  note: string | null
  cancel_reason: string | null
}
interface TicketRow { view: TicketView; htx: string; batch: string | null }

/** An in-memory batch port. Transactions run one at a time and roll back when the work throws. */
export class FakeBatchPort implements BatchPort {
  batches: Row[] = []
  tickets: TicketRow[] = []
  outputs: { id: string; batch: string; grade: BatchOutputInput['grade']; kg: number; taken: number }[] = []
  private tail: Promise<unknown> = Promise.resolve()

  addTicket(id: string, netKg: number, over: Partial<TicketRow> = {}): TicketRow {
    const row: TicketRow = {
      htx: 'htx-tc',
      batch: null,
      view: {
        id, ticket_no: `TC-PC-${id}`, household_id: 'hh-1', household_name: 'Hộ A', parcel_id: 'p-1', parcel_code: 'TC-A1', cycle_id: 'cycle-1',
        grade_id: 'g-1', grade_name: 'Loại 1', weighed_at: '2026-11-27T03:00:00.000Z', gross_kg: netKg, deduction_pct: 0, net_kg: netKg,
        price_vnd_per_kg: 15000, amount_vnd: '0', status: 'VALID', void_reason: null, settlement_id: null,
      },
      ...over,
    }
    this.tickets.push(row)
    return row
  }

  inTransaction<T>(_ctx: unknown, work: (unit: BatchUnit) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const saved = JSON.stringify({ b: this.batches, t: this.tickets, o: this.outputs })
      try {
        return await work(this.unit())
      } catch (err) {
        const back = JSON.parse(saved)
        this.batches = back.b
        this.tickets = back.t
        this.outputs = back.o
        throw err
      }
    })
    this.tail = run.catch(() => undefined)
    return run
  }

  private row(id: string) { return this.batches.find((b) => b.id === id) as Row }

  private viewOf(row: Row): BatchView {
    const mine = this.tickets.filter((t) => t.batch === row.id)
    const t = batchTotals(mine.map((x) => String(x.view.net_kg)), this.outputs.filter((o) => o.batch === row.id).map((o) => String(o.kg)))
    const done = row.status === 'FINISHED'
    return {
      id: row.id, batch_code: row.code, processed_on: row.processed_on, status: row.status, master_name: row.master_name, shift: row.shift, notes: row.notes,
      ticket_count: mine.length, fresh_kg: t.freshKg, dry_kg: t.dryKg, recovery_ratio: done ? row.ratio : t.ratio, out_of_band: done ? row.out_of_band : t.outOfBand,
      deviation_note: row.note, created_at: NOW.toISOString(), finished_at: done ? NOW.toISOString() : null, cancel_reason: row.cancel_reason,
    }
  }

  private detailOf(id: string): BatchDetail {
    const batch = this.viewOf(this.row(id))
    return {
      batch,
      tickets: this.tickets.filter((t) => t.batch === id).map((t) => t.view),
      outputs: this.outputs.filter((o) => o.batch === id).map((o) => ({ id: o.id, grade: o.grade, kg: o.kg, remaining_kg: o.kg - o.taken })),
      preview: { fresh_kg: batch.fresh_kg, dry_kg: batch.dry_kg, recovery_ratio: batch.recovery_ratio, out_of_band: batch.out_of_band },
    }
  }

  private unit(): BatchUnit {
    return {
      nextBatchCode: async (code, day) => {
        await Promise.resolve()
        const n = this.batches.filter((b) => b.processed_on === day).length + 1
        return batchCode(code, day, n)
      },
      insert: async (b) => {
        const id = `b-${this.batches.length + 1}`
        this.batches.push({ id, htx: b.htxProfileId, code: b.batchCode, processed_on: b.processedOn, status: 'OPEN', master_name: b.masterName, shift: b.shift, notes: b.notes, fresh: null, dry: null, ratio: null, out_of_band: false, note: null, cancel_reason: null })
        return id
      },
      lock: async (htx, id) => {
        const row = this.batches.find((b) => b.id === id && b.htx === htx)
        return row ? { id: row.id, batch_code: row.code, status: row.status } : null
      },
      attachTickets: async (htx, batchId, ids) => {
        const hit = this.tickets.filter((t) => ids.includes(t.view.id) && t.htx === htx && t.view.status === 'VALID' && t.batch === null)
        hit.forEach((t) => { t.batch = batchId })
        return hit.length
      },
      detachTicket: async (batchId, ticketId) => {
        const hit = this.tickets.filter((t) => t.view.id === ticketId && t.batch === batchId)
        hit.forEach((t) => { t.batch = null })
        return hit.length
      },
      replaceOutputs: async (batchId, outputs) => {
        this.outputs = this.outputs.filter((o) => o.batch !== batchId)
        outputs.forEach((o, i) => this.outputs.push({ id: `${batchId}-o${i}`, batch: batchId, grade: o.grade, kg: o.kg, taken: 0 }))
      },
      totals: async (batchId) => ({
        ticketNetKg: this.tickets.filter((t) => t.batch === batchId).map((t) => String(t.view.net_kg)),
        outputKg: this.outputs.filter((o) => o.batch === batchId).map((o) => String(o.kg)),
      }),
      finish: async (batchId, i) => {
        Object.assign(this.row(batchId), { status: 'FINISHED', fresh: i.freshKg, dry: i.dryKg, ratio: i.ratio, out_of_band: i.outOfBand, note: i.deviationNote })
      },
      cancel: async (batchId, i) => {
        Object.assign(this.row(batchId), { status: 'CANCELLED', cancel_reason: i.reason })
        this.tickets.filter((t) => t.batch === batchId).forEach((t) => { t.batch = null })
      },
      detail: async (id) => this.detailOf(id),
      view: async (id) => this.viewOf(this.row(id)),
    }
  }

  async list(htx: string, filter: BatchFilter) {
    return this.batches.filter((b) => b.htx === htx && (!filter.status || b.status === filter.status)).map((b) => this.viewOf(b))
  }

  async get(htx: string, id: string) {
    return this.batches.some((b) => b.id === id && b.htx === htx) ? this.detailOf(id) : null
  }

  async availableTickets(htx: string) {
    return this.tickets.filter((t) => t.htx === htx && t.view.status === 'VALID' && t.batch === null).map((t) => t.view)
  }
}
