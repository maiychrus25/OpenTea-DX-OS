// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { DryTeaGrade } from '@/domain/processing/grades'
import { lotCapacityG } from '@/domain/sales/math'
import type { LotStock, SalesListFilter, SalesPort, SalesUnit } from '@/domain/sales/ports/SalesPort'
import type { ReceivablesSummary, SalesOrderView, SellableLot } from '@/domain/sales/views'

const PAGE_SIZE = 50
const ZERO = BigInt(0)
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`)
const dayString = (date: Date) => date.toISOString().slice(0, 10)

type Db = Prisma.TransactionClient
type Tx = Db

const ORDER_INCLUDE = {
  partner: { select: { name: true } },
  lines: { include: { lot: { select: { lot_code: true } } }, orderBy: { id: 'asc' } },
  payments: { orderBy: [{ paid_on: 'asc' }, { created_at: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.SalesOrderInclude

type OrderRow = Prisma.SalesOrderGetPayload<{ include: typeof ORDER_INCLUDE }>

export function orderView(row: OrderRow, today: string): SalesOrderView {
  const paid = row.payments.reduce((sum, p) => sum + p.amount_vnd, ZERO)
  const outstanding = row.total_vnd - paid
  const dueOn = row.due_on ? dayString(row.due_on) : null
  return {
    id: row.id,
    order_no: row.order_no,
    kind: row.kind,
    source: row.source,
    external_ref: row.external_ref,
    partner_id: row.partner_id,
    partner_name: row.partner?.name ?? null,
    customer_name: row.customer_name,
    ordered_on: dayString(row.ordered_on),
    due_on: dueOn,
    status: row.status,
    total_vnd: row.total_vnd.toString(),
    paid_vnd: paid.toString(),
    outstanding_vnd: outstanding.toString(),
    overdue: row.kind === 'WHOLESALE' && row.status === 'CONFIRMED' && outstanding > ZERO && dueOn !== null && dueOn < today,
    note: row.note,
    created_at: row.created_at.toISOString(),
    cancelled_at: row.cancelled_at?.toISOString() ?? null,
    cancel_reason: row.cancel_reason,
    lines: row.lines.map((l) => ({
      id: l.id, lot_id: l.lot_id, lot_code: l.lot.lot_code, net_g: l.net_g, pack_count: l.pack_count, pack_net_g: l.pack_net_g,
      price_vnd_per_kg: l.price_vnd_per_kg, amount_vnd: l.amount_vnd.toString(),
    })),
    payments: row.payments.map((p) => ({ id: p.id, amount_vnd: p.amount_vnd.toString(), paid_on: dayString(p.paid_on), method: p.method, ref: p.ref, created_at: p.created_at.toISOString() })),
  }
}

interface StockRow {
  id: string
  lot_code: string
  status: string
  dry_grade: DryTeaGrade | null
  quality_grade: string | null
  total_weight_kg: number | null
  actual_weight_kg: number | null
  estimated_weight_kg: number | null
  sold_g: number
}

/** The lots of the cooperative (all of them, or only `ids`) with the grams already in CONFIRMED orders. */
async function stockRows(db: Db | typeof prisma, htxProfileId: string, ids: string[] | null): Promise<StockRow[]> {
  return db.$queryRaw<StockRow[]>`
    SELECT l.id, l.lot_code, l.status::text AS status, l.dry_grade::text AS dry_grade, l.quality_grade,
           l.total_weight_kg, l.actual_weight_kg, l.estimated_weight_kg, COALESCE(sold.g, 0)::int AS sold_g
    FROM lots l
    LEFT JOIN (
      SELECT sl.lot_id, SUM(sl.net_g) AS g FROM sales_order_lines sl
      JOIN sales_orders o ON o.id = sl.order_id AND o.status = 'CONFIRMED' GROUP BY sl.lot_id
    ) sold ON sold.lot_id = l.id
    WHERE l.htx_profile_id = ${htxProfileId} AND (${ids}::text[] IS NULL OR l.id = ANY(${ids}::text[]))
    ORDER BY l.created_at DESC, l.id`
}

/** Receivables of wholesale CONFIRMED orders, grouped by partner, largest first. Shared with the director board. */
export async function receivablesOf(db: Db | typeof prisma, htxProfileId: string, today: string): Promise<ReceivablesSummary> {
  const rows = await db.$queryRaw<{ partner_id: string; partner_name: string; outstanding: bigint; overdue: bigint; overdue_count: number }[]>`
    SELECT o.partner_id, p.name AS partner_name,
           SUM(o.total_vnd - COALESCE(pay.paid, 0))::bigint AS outstanding,
           COALESCE(SUM(CASE WHEN o.due_on < ${today}::date THEN o.total_vnd - COALESCE(pay.paid, 0) ELSE 0 END), 0)::bigint AS overdue,
           COUNT(*) FILTER (WHERE o.due_on < ${today}::date)::int AS overdue_count
    FROM sales_orders o
    JOIN partners p ON p.id = o.partner_id
    LEFT JOIN (SELECT order_id, SUM(amount_vnd) AS paid FROM sales_payments GROUP BY order_id) pay ON pay.order_id = o.id
    WHERE o.htx_profile_id = ${htxProfileId} AND o.kind = 'WHOLESALE' AND o.status = 'CONFIRMED' AND o.total_vnd > COALESCE(pay.paid, 0)
    GROUP BY o.partner_id, p.name
    ORDER BY outstanding DESC, p.name, o.partner_id`
  return {
    outstanding_vnd: rows.reduce((sum, r) => sum + r.outstanding, ZERO).toString(),
    overdue_count: rows.reduce((sum, r) => sum + r.overdue_count, 0),
    overdue_vnd: rows.reduce((sum, r) => sum + r.overdue, ZERO).toString(),
    partners: rows.map((r) => ({ partner_id: r.partner_id, partner_name: r.partner_name, outstanding_vnd: r.outstanding.toString(), overdue_vnd: r.overdue.toString() })),
  }
}

async function viewOf(db: Db | typeof prisma, where: Prisma.SalesOrderWhereUniqueInput | Prisma.SalesOrderWhereInput, today: string): Promise<SalesOrderView | null> {
  const row = await db.salesOrder.findFirst({ where, include: ORDER_INCLUDE })
  return row ? orderView(row, today) : null
}

function unitOf(tx: Tx): SalesUnit {
  return {
    async partnerExists(htxProfileId, id) {
      return (await tx.partner.count({ where: { id, htx_profile_id: htxProfileId } })) > 0
    },
    async lockLots(htxProfileId, ids) {
      // Locked in id order, so two orders over the same lots never wait on each other in a cycle.
      await tx.$queryRaw`SELECT id FROM lots WHERE htx_profile_id = ${htxProfileId} AND id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`
      const rows = await stockRows(tx, htxProfileId, ids)
      return rows.map((r): LotStock => ({ lot_id: r.id, lot_code: r.lot_code, qr_exported: r.status === 'QR_EXPORTED', capacity_g: lotCapacityG(r), sold_g: r.sold_g }))
    },
    async nextOrderNo(htxCode, day) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales:${htxCode}:${day}`}))`
      const prefix = `${htxCode}-DH-${day.replace(/-/g, '')}-`
      const rows = await tx.$queryRaw<{ n: number }[]>`
        SELECT COALESCE(MAX(substring(order_no from '[0-9]+$')::int), 0) + 1 AS n
        FROM sales_orders WHERE left(order_no, ${prefix.length}::int) = ${prefix}`
      return `${prefix}${String(rows[0].n).padStart(3, '0')}`
    },
    async lockExternalRef(htxCode, ref) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-ref:${htxCode}:${ref}`}))`
    },
    async findByExternalRef(htxProfileId, source, ref) {
      const row = await tx.salesOrder.findFirst({ where: { htx_profile_id: htxProfileId, source, external_ref: ref }, select: { id: true } })
      return row?.id ?? null
    },
    async insertOrder(o) {
      const row = await tx.salesOrder.create({
        data: {
          htx_profile_id: o.htxProfileId, order_no: o.orderNo, kind: o.kind, source: o.source, external_ref: o.externalRef, partner_id: o.partnerId,
          customer_name: o.customerName, ordered_on: dateOf(o.orderedOn), due_on: o.dueOn ? dateOf(o.dueOn) : null, total_vnd: o.totalVnd, note: o.note, created_by_id: o.createdById,
          lines: { create: o.lines.map((l) => ({ lot_id: l.lot_id, net_g: l.net_g, pack_count: l.pack_count, pack_net_g: l.pack_net_g, price_vnd_per_kg: l.price_vnd_per_kg, amount_vnd: l.amount_vnd })) },
        },
        select: { id: true },
      })
      return row.id
    },
    async lockOrder(htxProfileId, id) {
      const rows = await tx.$queryRaw<{ id: string; kind: 'WHOLESALE' | 'RETAIL'; status: 'CONFIRMED' | 'CANCELLED'; ordered_on: string; due_on: string | null; total_vnd: bigint }[]>`
        SELECT id, kind::text AS kind, status::text AS status, ordered_on::text AS ordered_on, due_on::text AS due_on, total_vnd
        FROM sales_orders WHERE id = ${id} AND htx_profile_id = ${htxProfileId} FOR UPDATE`
      if (rows.length === 0) return null
      const paid = await tx.salesPayment.aggregate({ where: { order_id: id }, _sum: { amount_vnd: true } })
      return { ...rows[0], paid_vnd: paid._sum.amount_vnd ?? ZERO }
    },
    async insertPayment(p) {
      await tx.salesPayment.create({ data: { order_id: p.orderId, amount_vnd: p.amountVnd, paid_on: dateOf(p.paidOn), method: p.method, ref: p.ref, created_by_id: p.createdById } })
    },
    async cancelOrder(input) {
      await tx.salesOrder.update({ where: { id: input.id }, data: { status: 'CANCELLED', cancelled_by_id: input.by, cancelled_at: input.at, cancel_reason: input.reason } })
    },
    async setDueOn(id, day) {
      await tx.salesOrder.update({ where: { id }, data: { due_on: dateOf(day) } })
    },
    async view(id, today) {
      return (await viewOf(tx, { id }, today))!
    },
  }
}

export class PrismaSalesRepository implements SalesPort {
  inTransaction<T>(ctx: { htxProfileId: string; htxCode: string; actorId: string }, work: (unit: SalesUnit) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      // Row audit events of these writes name the person.
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${ctx.actorId}`}, true)`
      return work(unitOf(tx))
    }, TX_OPTIONS)
  }

  async sellableLots(htxProfileId: string): Promise<SellableLot[]> {
    const rows = await stockRows(prisma, htxProfileId, null)
    return rows.flatMap((r) => {
      const capacity = lotCapacityG(r)
      if (r.status !== 'QR_EXPORTED' || capacity === null || capacity - r.sold_g <= 0) return []
      return [{ lot_id: r.id, lot_code: r.lot_code, dry_grade: r.dry_grade, quality_grade: r.quality_grade, capacity_g: capacity, remaining_g: capacity - r.sold_g }]
    })
  }

  async list(f: SalesListFilter) {
    const where: Prisma.SalesOrderWhereInput = { htx_profile_id: f.htxProfileId, kind: f.kind, status: f.status, partner_id: f.partnerId }
    if (f.overdue) {
      // Overdue is wholesale, confirmed, still owed and past due: the same rule as the order view.
      const ids = await prisma.$queryRaw<{ id: string }[]>`
        SELECT o.id FROM sales_orders o
        LEFT JOIN (SELECT order_id, SUM(amount_vnd) AS paid FROM sales_payments GROUP BY order_id) pay ON pay.order_id = o.id
        WHERE o.htx_profile_id = ${f.htxProfileId} AND o.kind = 'WHOLESALE' AND o.status = 'CONFIRMED'
          AND o.due_on < ${f.today}::date AND o.total_vnd > COALESCE(pay.paid, 0)`
      where.id = { in: ids.map((r) => r.id) }
    }
    const rows = await prisma.salesOrder.findMany({
      where, include: ORDER_INCLUDE, orderBy: [{ created_at: 'desc' }, { id: 'desc' }], take: PAGE_SIZE + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    })
    const page = rows.slice(0, PAGE_SIZE)
    return { data: page.map((r) => orderView(r, f.today)), next_cursor: rows.length > PAGE_SIZE ? page[page.length - 1].id : null }
  }

  get(htxProfileId: string, id: string, today: string) {
    return viewOf(prisma, { id, htx_profile_id: htxProfileId }, today)
  }

  findByExternalRef(htxProfileId: string, source: 'CORE' | 'TEA_SHOP', ref: string, today: string) {
    return viewOf(prisma, { htx_profile_id: htxProfileId, source, external_ref: ref }, today)
  }

  receivables(htxProfileId: string, today: string) {
    return receivablesOf(prisma, htxProfileId, today)
  }
}
