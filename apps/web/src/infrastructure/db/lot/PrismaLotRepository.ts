// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { LotPort, LotSummary, CreateLotData, LotFilters, ExportQrResult } from '@/domain/lot/ports/LotPort'
import { LotTraceData } from '@/domain/entities/lot-trace-data'

export class PrismaLotRepository implements LotPort {
  async findAll(filters: LotFilters): Promise<LotSummary[]> {
    const where: Record<string, unknown> = {}
    if (filters.status) where.status = filters.status

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

    // Count existing lots for today to generate sequence number
    const existingCount = await prisma.lot.count({
      where: {
        lot_code: { startsWith: `${htxCode}-${cropCode}-${dateStr}` },
      },
    })
    const seq = String(existingCount + 1).padStart(3, '0')
    const lotCode = `${htxCode}-${cropCode}-${dateStr}-${seq}`

    const l = await prisma.lot.create({
      data: {
        lot_code: lotCode,
        commodity: data.commodity,
        harvest_date: data.harvest_date,
        estimated_weight_kg: data.estimated_weight_kg ?? null,
        actual_weight_kg: null,
        packaging_type: data.packaging_type ?? null,
        destination: data.destination ?? null,
        buyer_name: data.buyer_name ?? null,
        certificate_keys: data.certificate_keys ?? [],
        status: 'DRAFT',
        created_by_id: data.created_by_id,
        htx_profile_id: data.htx_profile_id,
        lot_parcels: {
          create: data.parcel_ids.map(parcelId => ({
            parcel_id: parcelId,
          })),
        },
      },
      include: { lot_parcels: true },
    })

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

  async exportQr(id: string, snapshotData: LotTraceData, qrImageUrl?: string, certificateKeys?: string[]): Promise<ExportQrResult> {
    // Transaction: write public_page_data + set status = QR_EXPORTED
    const lot = await prisma.$transaction(async (tx) => {
      const currentLot = await tx.lot.findUnique({ where: { id } })
      if (!currentLot) throw new Error('Lot not found')
      if (currentLot.status === 'QR_EXPORTED') throw new Error('Lot already exported')

      return tx.lot.update({
        where: { id },
        data: {
          status: 'QR_EXPORTED',
          public_page_data: JSON.parse(JSON.stringify(snapshotData)),
          qr_image_url: qrImageUrl ?? `/lot/${currentLot.lot_code}`,
          ...(certificateKeys ? { certificate_keys: certificateKeys } : {}),
        },
      })
    })

    return {
      lot_code: lot.lot_code,
      qr_image_url: lot.qr_image_url ?? '',
      public_page_url: `/lot/${lot.lot_code}`,
    }
  }
}
