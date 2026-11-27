// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { LotPort, LotSummary, CreateLotData, LotFilters, ExportQrResult } from '@/domain/lot/ports/LotPort'
import { LotTraceData } from '@/domain/entities/lot-trace-data'
import { Prisma, LotStatus } from '@prisma/client'
import { UnprocessableError } from '@/domain/errors'
import { certificateStatus } from '@/domain/certificate/status'
import { cycleForLotLine } from '@/infrastructure/db/farm/PrismaCropCycleRepository'

/** The next `{prefix}NNN` lot code. Takes a lock per prefix that lasts until the transaction ends, so two lots never share a number. */
export async function nextLotCode(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lot:${prefix}`}))`
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT COALESCE(MAX(substring(lot_code from '[0-9]+$')::int), 0) + 1 AS n
    FROM lots WHERE left(lot_code, ${prefix.length}::int) = ${prefix}`
  return `${prefix}${String(rows[0].n).padStart(3, '0')}`
}

export class PrismaLotRepository implements LotPort {
  cycleForLine(parcelId: string, harvestDate: Date) {
    return cycleForLotLine(prisma, parcelId, harvestDate)
  }

  async findAll(filters: LotFilters): Promise<LotSummary[]> {
    // F1 fix: use != null (not truthy) to prevent empty-string bypassing HTX scoping
    // F5 fix: use Prisma.LotWhereInput for compile-time type safety
    const where: Prisma.LotWhereInput = {}
    if (filters.htx_profile_id != null) where.htx_profile_id = filters.htx_profile_id
    if (filters.statuses?.length) where.status = { in: filters.statuses as LotStatus[] }
    else if (filters.status) where.status = filters.status as LotStatus

    const lots = await prisma.lot.findMany({
      where,
      include: { lot_parcels: true },
      orderBy: { created_at: 'desc' },
    })

    return lots.map(l => ({
      id: l.id,
      lot_code: l.lot_code,
      commodity: l.commodity,
      harvest_date: l.harvest_date,
      estimated_weight_kg: l.estimated_weight_kg,
      actual_weight_kg: l.actual_weight_kg,
      status: l.status,
      parcel_count: l.lot_parcels.length,
      created_at: l.created_at,
    }))
  }

  async findById(id: string): Promise<LotSummary | null> {
    const l = await prisma.lot.findUnique({
      where: { id },
      include: { lot_parcels: true },
    })
    if (!l) return null

    return {
      id: l.id,
      lot_code: l.lot_code,
      commodity: l.commodity,
      harvest_date: l.harvest_date,
      estimated_weight_kg: l.estimated_weight_kg,
      actual_weight_kg: l.actual_weight_kg,
      status: l.status,
      parcel_count: l.lot_parcels.length,
      created_at: l.created_at,
    }
  }

  async create(data: CreateLotData): Promise<LotSummary> {
    // Auto-generate lot_code: {htx_code}-{CROP}-{YYYYMMDD}-{NNN}
    const htxProfile = await prisma.htxProfile.findUnique({ where: { id: data.htx_profile_id } })
    const htxCode = htxProfile?.htx_code ?? 'HTX'
    const cropCode = data.commodity.toUpperCase().replace(/\s+/g, '').substring(0, 6)
    const dateStr = data.harvest_date.toISOString().slice(0, 10).replace(/-/g, '')

    const lines = await Promise.all(
      data.parcel_ids.map(async (parcelId) => ({ parcel_id: parcelId, cycle_id: await cycleForLotLine(prisma, parcelId, data.harvest_date) }))
    )

    const l = await prisma.$transaction(async (tx) => tx.lot.create({
      data: {
        lot_code: await nextLotCode(tx, `${htxCode}-${cropCode}-${dateStr}-`),
        commodity: data.commodity,
        harvest_date: data.harvest_date,
        estimated_weight_kg: data.estimated_weight_kg ?? null,
        actual_weight_kg: null,
        packaging_type: data.packaging_type ?? null,
        destination: data.destination ?? null,
        buyer_name: data.buyer_name ?? null,
        certificate_keys: data.certificate_keys ?? [],
        status: 'READY',
        created_by_id: data.created_by_id,
        htx_profile_id: data.htx_profile_id,
        lot_parcels: {
          create: lines,
        },
      },
      include: { lot_parcels: true },
    }))

    return {
      id: l.id,
      lot_code: l.lot_code,
      commodity: l.commodity,
      harvest_date: l.harvest_date,
      estimated_weight_kg: l.estimated_weight_kg,
      actual_weight_kg: l.actual_weight_kg,
      status: l.status,
      parcel_count: l.lot_parcels.length,
      created_at: l.created_at,
    }
  }

  async exportQr(id: string, snapshotData: LotTraceData, qrImageUrl?: string, certificateKeys?: string[], certificates?: { htxProfileId: string; ids: string[]; today: string }): Promise<ExportQrResult> {
    // Transaction: write public_page_data + set status = QR_EXPORTED
    const lot = await prisma.$transaction(async (tx) => {
      const currentLot = await tx.lot.findUnique({ where: { id } })
      if (!currentLot) throw new Error('Lot not found')
      if (currentLot.status === 'QR_EXPORTED') throw new Error('Lot already exported')

      if (certificates && certificates.ids.length > 0) {
        // A revoke that commits first is seen here; one that comes later waits for this lock and follows the export.
        const rows = await tx.$queryRaw<{ id: string; revoked_at: Date | null; expires_on: string }[]>`
          SELECT id, revoked_at, to_char(expires_on, 'YYYY-MM-DD') AS expires_on FROM htx_certificates
          WHERE id = ANY(${certificates.ids}) AND htx_profile_id = ${certificates.htxProfileId} ORDER BY id FOR UPDATE`
        const invalid = certificates.ids.filter((cid) => {
          const row = rows.find((r) => r.id === cid)
          return !row || certificateStatus(row, certificates.today) !== 'VALID'
        })
        if (invalid.length > 0) throw new UnprocessableError('CERTIFICATE_NOT_VALID', 'Có chứng nhận đã hết hạn hoặc đã thu hồi nên không gắn vào lô được.', { certificate_ids: invalid })
        await tx.lotCertificate.createMany({ data: certificates.ids.map((certificate_id) => ({ lot_id: id, certificate_id })) })
      }

      return tx.lot.update({
        where: { id },
        data: {
          status: 'QR_EXPORTED',
          public_page_data: JSON.parse(JSON.stringify(snapshotData)),
          // BUG-03 fix: never fallback to page URL (/lot/{code}) — UseCase guarantees Data URI or MinIO URL
          qr_image_url: qrImageUrl ?? '',
          ...(certificateKeys ? { certificate_keys: certificateKeys } : {}),
        },
      })
    })

    return {
      lot_code: lot.lot_code,
      qr_image_url: lot.qr_image_url ?? '',
      public_page_url: `/q/${encodeURIComponent(lot.lot_code)}`,
    }
  }
}
