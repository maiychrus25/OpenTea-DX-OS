// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotTraceRepository, ParcelHarvests } from '@/domain/repositories/lot-trace-repository'
import { LotTraceData } from '@/domain/entities/lot-trace-data'
import { belongsToLotLine, lotLineBlock } from '@/domain/journal/blocking-sprays'
import { WITHDRAWAL_EXCLUDED_STATUSES } from '@/domain/journal/withdrawal-status'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { LotTraceBatch, LotTraceCertificate, LotTraceIntake } from '@/domain/entities/lot-trace-data'
import { endOfVnDay } from '@/application/weighing/withdrawal-gate'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { countsTowardWithdrawal } from '@/domain/journal/withdrawal-status'

// Export pure function for unit testing
export function computeSafeHarvestDate(
  entries: Array<{ entry_date: Date; activities: Array<{ withdrawal_days: number | null }> }>
): Date | null {
  let latestSafeDate: Date | null = null
  for (const entry of entries) {
    for (const act of entry.activities) {
      if (act.withdrawal_days !== null && act.withdrawal_days !== undefined) {
        const safeDate = new Date(entry.entry_date)
        safeDate.setDate(safeDate.getDate() + act.withdrawal_days)
        if (!latestSafeDate || safeDate > latestSafeDate) {
          latestSafeDate = safeDate
        }
      }
    }
  }
  return latestSafeDate
}

export class PrismaLotTraceRepository implements LotTraceRepository {
  async getLotByCode(lot_code: string): Promise<LotTraceData | null> {
    const lot = await prisma.lot.findUnique({
      where: { lot_code },
      include: {
        htx_profile: true,
        // The certificates are read live, even for an exported lot, so a later revoke shows on the public page.
        certificates: { include: { certificate: true } },
        batch_sources: {
          include: {
            output: {
              include: {
                batch: {
                  include: {
                    tickets: {
                      where: { status: 'VALID' },
                      select: { id: true, parcel_id: true, cycle_id: true, weighed_at: true, net_kg: true, parcel: { select: { parcel_code: true } }, cycle: { select: { season: true } } },
                      orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }],
                    },
                  },
                },
              },
            },
          },
        },
        lot_parcels: {
          include: {
            parcel: {
              include: {
                household: true,
                journal_entries: {
                  include: { activities: true },
                  // Every entry except drafts and rejected ones drives the withdrawal check; only APPROVED ones are shown (see journal_summaries)
                  where: { status: { notIn: [...WITHDRAWAL_EXCLUDED_STATUSES] } },
                  orderBy: { entry_date: 'asc' },
                }
              }
            }
          }
        }
      }
    })

    if (!lot) return null

    // If already exported, return the immutable snapshot.
    // public_page_data is typed as Prisma.JsonValue (Json? field) — safe cast via unknown.
    const certificates: LotTraceCertificate[] = (lot.certificates ?? []).map(({ certificate: c }) => ({
      id: c.id,
      kind: c.kind,
      number: c.number,
      issuer: c.issuer,
      issued_on: c.issued_on.toISOString().slice(0, 10),
      expires_on: c.expires_on.toISOString().slice(0, 10),
      file_key: c.file_key,
      revoked_at: c.revoked_at ? c.revoked_at.toISOString() : null,
    }))

    if (lot.status === 'QR_EXPORTED' && lot.public_page_data) {
      const parsed = lot.public_page_data as unknown as Record<string, unknown>
      return {
        ...parsed,
        certificates,
        packaging_date: parsed.packaging_date ? new Date(parsed.packaging_date as string) : null,
        created_at: new Date(parsed.created_at as string),
        latest_safe_harvest_date: parsed.latest_safe_harvest_date ? new Date(parsed.latest_safe_harvest_date as string) : null,
        journal_summaries: ((parsed.journal_summaries as Array<Record<string, unknown>>) || []).map((s) => ({
          ...s,
          entry_date: new Date(s.entry_date as string)
        }))
      } as LotTraceData
    }

    const sources = lot.batch_sources ?? []
    const fromBatches = sources.length > 0
    // A lot line answers for its own flush and for everything sprayed by the lot's harvest date.
    const entriesOf = (lp: (typeof lot.lot_parcels)[number]) =>
      lp.parcel.journal_entries.filter(e => belongsToLotLine(e, lot.harvest_date, lp.cycle_id))
    const allEntries = lot.lot_parcels.flatMap(entriesOf)
    // Rule (b): each line is judged against the lot's harvest date, so a spray done inside the withdrawal
    // before it keeps the lot unsafe even after its safe date has passed.
    let blocking = lot.lot_parcels
      .map(lp => lotLineBlock(lp.parcel.journal_entries, lot.harvest_date, lp.cycle_id))
      .filter((d): d is Date => d !== null)
    let intake: LotTraceIntake[] | undefined
    let batches: LotTraceBatch[] | undefined
    const ticketSafeDates: Date[] = []
    if (fromBatches) {
      // A lot from batches is judged ticket by ticket, on each ticket's own weigh day (spec §4.3).
      const sprays = new Map(lot.lot_parcels.map(lp => [lp.parcel_id, lp.parcel.journal_entries]))
      const tickets = new Map(sources.flatMap(s => s.output.batch.tickets).map(t => [t.id, t]))
      blocking = []
      intake = Array.from(tickets.values()).map(t => {
        const weighedOn = vnDayOf(t.weighed_at)
        const entries = sprays.get(t.parcel_id) ?? []
        const block = lotLineBlock(entries, endOfVnDay(weighedOn), t.cycle_id)
        if (block) blocking.push(block)
        const counted = entries
          .filter(e => countsTowardWithdrawal(e.status) && belongsToLotLine(e, endOfVnDay(weighedOn), t.cycle_id))
          .flatMap(e => e.activities.map(a => a.safe_harvest_date).filter((d): d is Date => d !== null))
        const safeOn = counted.reduce<Date | null>((x, y) => (x && x > y ? x : y), null)
        if (safeOn) ticketSafeDates.push(safeOn)
        return { parcel_code: t.parcel.parcel_code, cycle_label: t.cycle?.season ?? null, weighed_on: weighedOn, net_kg: Number(t.net_kg), safe_on: safeOn ? vnDayOf(safeOn) : null }
      })
      batches = sources.map(s => {
        const b = s.output.batch
        return {
          batch_code: b.batch_code,
          processed_on: b.processed_on.toISOString().slice(0, 10),
          master_name: b.master_name,
          fresh_kg: Number(b.fresh_kg ?? 0),
          dry_kg: Number(b.dry_kg ?? 0),
          recovery_ratio: Number(b.recovery_ratio ?? 0),
          out_of_band: b.out_of_band,
          grade: s.output.grade,
          kg_in_lot: Number(s.kg),
          ticket_count: b.tickets.length,
          parcel_codes: Array.from(new Set(b.tickets.map(t => t.parcel.parcel_code))).sort(),
        }
      })
    }
    const isHarvestSafe = blocking.length === 0
    // Shown date: the latest blocking date, else the latest counted safe date.
    const latestSafeDate = blocking.length
      ? blocking.reduce((x, y) => (y > x ? y : x))
      : fromBatches
        ? ticketSafeDates.reduce<Date | null>((x, y) => (x && x > y ? x : y), null)
        : computeSafeHarvestDate(allEntries)

    return {
      lot_code: lot.lot_code,
      commodity: lot.commodity,
      quality_grade: lot.quality_grade,
      status: lot.status as "DRAFT" | "READY" | "QR_EXPORTED",
      packaging_date: lot.harvest_date,
      packaging_spec: lot.packaging_type ?? null,
      total_weight_kg: lot.actual_weight_kg ?? lot.estimated_weight_kg ?? null,
      qr_image_url: lot.qr_image_url,
      created_at: lot.created_at,
      is_harvest_safe: isHarvestSafe,
      latest_safe_harvest_date: latestSafeDate,
      parcels: lot.lot_parcels.map(lp => ({
        parcel_code: lp.parcel.parcel_code,
        area_ha: lp.parcel.area_ha,
        household_name: lp.parcel.household.name,
        crop_type: lp.parcel.crop_type,
        status: lp.parcel.status
      })),
      journal_summaries: lot.lot_parcels.flatMap(lp =>
        entriesOf(lp).filter(e => e.status === 'APPROVED').flatMap(e => {
          if (e.activities.length === 0) {
            return [{
              entry_date: e.entry_date,
              activity_type: e.activity_type,
              performed_by: e.performed_by,
              approved_by_id: e.approved_by_id,
              activity_detail: 'Không có chi tiết',
              product_name: null,
              dosage: null,
              withdrawal_days: null,
            }]
          }
          return e.activities.map(act => ({
            entry_date: e.entry_date,
            activity_type: e.activity_type,
            performed_by: e.performed_by,
            approved_by_id: e.approved_by_id,
            activity_detail: act.activity_detail,
            product_name: act.product_name,
            dosage: act.dosage,
            withdrawal_days: act.withdrawal_days,
          }))
        })
      ),
      certificate_keys: lot.certificate_keys,
      htx_name: lot.htx_profile?.name ?? null,
      dry_grade: lot.dry_grade ?? null,
      ...(fromBatches ? { batches, intake } : {}),
      certificates,
    }
  }

  async getParcelHarvests(lot_code: string): Promise<ParcelHarvests[]> {
    const links = await prisma.lotParcel.findMany({
      where: { lot: { lot_code } },
      select: {
        cycle_id: true,
        parcel: {
          select: {
            parcel_code: true,
            crop_cycles: { where: { harvested_at: { not: null } }, select: { id: true, harvested_at: true } },
          },
        },
      },
    })
    // A line with a flush is harvested only when that flush is closed.
    return links.map(({ cycle_id, parcel }) => ({
      parcel_code: parcel.parcel_code,
      harvested_at: parcel.crop_cycles.flatMap((c) => (c.harvested_at && (!cycle_id || c.id === cycle_id) ? [c.harvested_at] : [])),
    }))
  }
}
