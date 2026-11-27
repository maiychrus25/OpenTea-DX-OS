// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { HtxPesticideLabel, PesticideProduct } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { PesticideListOptions, PesticidePort, PesticideRow } from '@/domain/pesticide/ports/PesticidePort'

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

function toRow(product: PesticideProduct, label: HtxPesticideLabel | null | undefined): PesticideRow {
  return {
    id: product.id,
    trade_name: product.trade_name,
    active_ingredient: product.active_ingredient,
    group: product.group,
    targets: product.targets,
    default_phi_days: product.default_phi_days,
    floor_days: label?.label_phi_days ?? product.default_phi_days,
    label: label
      ? { label_phi_days: label.label_phi_days, label_note: label.label_note, verified_at: label.verified_at.toISOString() }
      : null,
    needs_label_check: !label && product.phi_needs_label_check,
  }
}

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

export class PrismaPesticideRepository implements PesticidePort {
  async floorFor(productId: string, htxProfileId: string) {
    const product = await prisma.pesticideProduct.findFirst({
      where: { id: productId, active: true },
      include: { labels: { where: { htx_profile_id: htxProfileId } } },
    })
    if (!product) return null
    return { productId: product.id, floorDays: product.labels[0]?.label_phi_days ?? product.default_phi_days }
  }

  async matchByTradeName(name: string) {
    const wanted = normalize(name)
    if (!wanted) return null
    // The catalogue is small (tens of rows); comparing in memory avoids SQL-side normalization.
    const products = await prisma.pesticideProduct.findMany({ where: { active: true }, select: { id: true, trade_name: true } })
    return products.find((p) => normalize(p.trade_name) === wanted)?.id ?? null
  }

  async list(htxProfileId: string, opts: PesticideListOptions): Promise<PesticideRow[]> {
    const products = await prisma.pesticideProduct.findMany({
      where: { active: true },
      include: { labels: { where: { htx_profile_id: htxProfileId } } },
      orderBy: { trade_name: 'asc' },
    })
    const q = opts.q ? normalize(opts.q) : null
    const target = opts.target ? normalize(opts.target) : null
    const rows = products
      .filter((p) => !q || normalize(p.trade_name).includes(q) || normalize(p.active_ingredient).includes(q))
      .filter((p) => !target || p.targets.some((t) => normalize(t).includes(target)))
      .map((p) => ({ id: p.id, row: toRow(p, p.labels[0]) }))

    if (!opts.householdId) return rows.map((r) => r.row)

    const used = await prisma.journalActivity.findMany({
      where: {
        pesticide_product_id: { not: null },
        journal_entry: {
          entry_date: { gte: new Date(Date.now() - YEAR_MS) },
          parcel: { household_id: opts.householdId },
        },
      },
      select: { pesticide_product_id: true, journal_entry: { select: { entry_date: true } } },
    })
    const lastUsed = new Map<string, number>()
    for (const a of used) {
      const at = a.journal_entry.entry_date.getTime()
      if (a.pesticide_product_id && at > (lastUsed.get(a.pesticide_product_id) ?? 0)) lastUsed.set(a.pesticide_product_id, at)
    }
    // Stable sort: unused products keep the alphabetical order from the query.
    return rows.sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0)).map((r) => r.row)
  }

  async setLabel(
    htxProfileId: string,
    productId: string,
    input: { label_phi_days: number; label_note: string | null; verified_by_id: string }
  ) {
    const product = await prisma.pesticideProduct.findFirst({ where: { id: productId, active: true } })
    if (!product) return null
    const label = await prisma.htxPesticideLabel.upsert({
      where: { htx_profile_id_pesticide_product_id: { htx_profile_id: htxProfileId, pesticide_product_id: productId } },
      create: { htx_profile_id: htxProfileId, pesticide_product_id: productId, ...input, verified_at: new Date() },
      update: { ...input, verified_at: new Date() },
    })
    return toRow(product, label)
  }

  async clearLabel(htxProfileId: string, productId: string) {
    const product = await prisma.pesticideProduct.findFirst({ where: { id: productId, active: true } })
    if (!product) return null
    await prisma.htxPesticideLabel.deleteMany({ where: { htx_profile_id: htxProfileId, pesticide_product_id: productId } })
    return toRow(product, null)
  }
}
