// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { BatchFilter, BatchPort, BatchUnit } from '@/domain/processing/ports/BatchPort'
import type { BatchDetail, BatchView } from '@/domain/processing/views'
import { batchCode, batchTotals } from '@/domain/processing/batch-math'
import { vnDayStart } from '@/application/agent/campaign/vn-day'
import { TICKET_INCLUDE, ticketView } from '@/infrastructure/db/weighing/PrismaFreshLeafTicketRepository'

const DAY_MS = 24 * 60 * 60 * 1000
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)
const dayString = (date: Date) => date.toISOString().slice(0, 10)
const tenths = (value: { toString(): string }) => Math.round(Number(value.toString()) * 10)

type Tx = Prisma.TransactionClient

const BATCH_INCLUDE = {
  tickets: { select: { net_kg: true } },
  outputs: { select: { id: true, grade: true, kg: true, lot_sources: { select: { kg: true } } }, orderBy: { grade: 'asc' } },
} satisfies Prisma.ProcessingBatchInclude

type BatchRow = Prisma.ProcessingBatchGetPayload<{ include: typeof BATCH_INCLUDE }>

function totalsOf(row: BatchRow) {
  return batchTotals(row.tickets.map((t) => t.net_kg.toString()), row.outputs.map((o) => o.kg.toString()))
}

function batchView(row: BatchRow): BatchView {
  const totals = totalsOf(row)
  const finished = row.status === 'FINISHED'
  return {
    id: row.id,
    batch_code: row.batch_code,
    processed_on: dayString(row.processed_on),
    status: row.status,
    master_name: row.master_name,
    shift: row.shift,
    notes: row.notes,
    ticket_count: row.tickets.length,
    fresh_kg: totals.freshKg,
    dry_kg: totals.dryKg,
    // A finished batch keeps the figures it was judged on.
    recovery_ratio: finished && row.recovery_ratio ? Number(row.recovery_ratio) : totals.ratio,
    out_of_band: finished ? row.out_of_band : totals.outOfBand,
    deviation_note: row.deviation_note,
    created_at: row.created_at.toISOString(),
    finished_at: row.finished_at?.toISOString() ?? null,
    cancel_reason: row.cancel_reason,
  }
}

async function detailOf(db: Pick<Tx, 'processingBatch' | 'freshLeafTicket'>, id: string): Promise<BatchDetail> {
  const [row, tickets] = await Promise.all([
    db.processingBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE }),
    db.freshLeafTicket.findMany({ where: { processing_batch_id: id }, include: TICKET_INCLUDE, orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }] }),
  ])
  const batch = batchView(row)
  return {
    batch,
    tickets: tickets.map(ticketView),
    outputs: row.outputs.map((o) => ({ id: o.id, grade: o.grade, kg: Number(o.kg), remaining_kg: (tenths(o.kg) - o.lot_sources.reduce((sum, s) => sum + tenths(s.kg), 0)) / 10 })),
    preview: { fresh_kg: batch.fresh_kg, dry_kg: batch.dry_kg, recovery_ratio: batch.recovery_ratio, out_of_band: batch.out_of_band },
  }
}

function unitOf(tx: Tx): BatchUnit {
  return {
    async nextBatchCode(htxCode, day) {
      // One writer per HTX and day takes a number at a time; the lock ends with the transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`batch:${htxCode}:${day}`}))`
      const prefix = batchCode(htxCode, day, 0).slice(0, -2)
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(substring(batch_code from '[0-9]+$')::int), 0) + 1 AS n
        FROM processing_batches WHERE left(batch_code, ${prefix.length}::int) = ${prefix}`
      return batchCode(htxCode, day, rows[0].n)
    },
    async insert(batch) {
      const row = await tx.processingBatch.create({
        data: {
          htx_profile_id: batch.htxProfileId,
          batch_code: batch.batchCode,
          processed_on: dateOf(batch.processedOn),
          master_name: batch.masterName,
          shift: batch.shift,
          notes: batch.notes,
          created_by_id: batch.createdById,
        },
        select: { id: true },
      })
      return row.id
    },
    async lock(htxProfileId, id) {
      const rows = await tx.$queryRaw<{ id: string; batch_code: string; status: 'OPEN' | 'FINISHED' | 'CANCELLED' }[]>`
        SELECT id, batch_code, status::text AS status FROM processing_batches WHERE id = ${id} AND htx_profile_id = ${htxProfileId} FOR UPDATE`
      return rows[0] ?? null
    },
    async attachTickets(htxProfileId, batchId, ticketIds) {
      // The one conditional write: a ticket voided or batched meanwhile does not match, and the caller sees the short count.
      const done = await tx.freshLeafTicket.updateMany({
        where: { id: { in: ticketIds }, htx_profile_id: htxProfileId, status: 'VALID', processing_batch_id: null },
        data: { processing_batch_id: batchId },
      })
      return done.count
    },
    async detachTicket(batchId, ticketId) {
      const done = await tx.freshLeafTicket.updateMany({ where: { id: ticketId, processing_batch_id: batchId }, data: { processing_batch_id: null } })
      return done.count
    },
    async replaceOutputs(batchId, outputs) {
      await tx.processingBatchOutput.deleteMany({ where: { batch_id: batchId } })
      if (outputs.length > 0) await tx.processingBatchOutput.createMany({ data: outputs.map((o) => ({ batch_id: batchId, grade: o.grade, kg: o.kg.toFixed(1) })) })
    },
    async totals(batchId) {
      const [tickets, outputs] = await Promise.all([
        tx.freshLeafTicket.findMany({ where: { processing_batch_id: batchId }, select: { net_kg: true } }),
        tx.processingBatchOutput.findMany({ where: { batch_id: batchId }, select: { kg: true } }),
      ])
      return { ticketNetKg: tickets.map((t) => t.net_kg.toString()), outputKg: outputs.map((o) => o.kg.toString()) }
    },
    async finish(batchId, input) {
      await tx.processingBatch.update({
        where: { id: batchId },
        data: {
          status: 'FINISHED',
          fresh_kg: input.freshKg.toFixed(1),
          dry_kg: input.dryKg.toFixed(1),
          recovery_ratio: input.ratio.toFixed(2),
          out_of_band: input.outOfBand,
          deviation_note: input.deviationNote,
          finished_by_id: input.userId,
          finished_at: input.at,
        },
      })
    },
    async cancel(batchId, input) {
      await tx.freshLeafTicket.updateMany({ where: { processing_batch_id: batchId }, data: { processing_batch_id: null } })
      await tx.processingBatch.update({ where: { id: batchId }, data: { status: 'CANCELLED', cancel_reason: input.reason, cancelled_by_id: input.userId, cancelled_at: input.at } })
    },
    detail: (id) => detailOf(tx, id),
    async view(id) {
      return batchView(await tx.processingBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE }))
    },
  }
}

export class PrismaBatchRepository implements BatchPort {
  inTransaction<T>(ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: BatchUnit) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      // Row audit events of these writes name the person.
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${ctx.actorId}`}, true)`
      return work(unitOf(tx))
    })
  }

  async list(htxProfileId: string, filter: BatchFilter): Promise<BatchView[]> {
    const where: Prisma.ProcessingBatchWhereInput = { htx_profile_id: htxProfileId }
    if (filter.status) where.status = filter.status
    if (filter.from || filter.to) where.processed_on = { ...(filter.from ? { gte: dateOf(filter.from) } : {}), ...(filter.to ? { lte: dateOf(filter.to) } : {}) }
    const rows = await prisma.processingBatch.findMany({ where, include: BATCH_INCLUDE, orderBy: [{ processed_on: 'desc' }, { created_at: 'desc' }], take: 200 })
    return rows.map(batchView)
  }

  async get(htxProfileId: string, id: string): Promise<BatchDetail | null> {
    const found = await prisma.processingBatch.findFirst({ where: { id, htx_profile_id: htxProfileId }, select: { id: true } })
    return found ? detailOf(prisma, id) : null
  }

  async availableTickets(htxProfileId: string, fromDay: string, toDay: string) {
    const rows = await prisma.freshLeafTicket.findMany({
      where: {
        htx_profile_id: htxProfileId,
        status: 'VALID',
        processing_batch_id: null,
        weighed_at: { gte: vnDayStart(fromDay), lt: new Date(vnDayStart(toDay).getTime() + DAY_MS) },
      },
      include: TICKET_INCLUDE,
      orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }],
      take: 500,
    })
    return rows.map(ticketView)
  }
}
