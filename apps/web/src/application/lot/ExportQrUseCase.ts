// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort } from '@/domain/lot/ports/LotPort'
import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { NotFoundError, DomainError } from '@/domain/errors'
import * as QRCode from 'qrcode'

export class ExportQrUseCase {
  constructor(
    private readonly lotPort: LotPort,
    private readonly traceRepo: LotTraceRepository,
  ) {}

  async execute(lotId: string, certificateKeys?: string[]) {
    const lot = await this.lotPort.findById(lotId)
    if (!lot) throw new NotFoundError('Lot not found')
    if (lot.status === 'QR_EXPORTED') throw new DomainError('Lot already exported')

    // Get trace data snapshot
    const traceData = await this.traceRepo.getLotByCode(lot.lot_code)
    if (!traceData) throw new NotFoundError('Trace data not found')

    // Check withdrawal period and parcel status
    if (!traceData.is_harvest_safe) {
      throw new DomainError('WITHDRAWAL_NOT_PASSED: Lô hàng chưa an toàn để thu hoạch hoặc chứa thửa đất vi phạm thời gian cách ly')
    }

    const hasInvalidParcel = traceData.parcels.some(p => p.status !== 'HARVESTED' && p.status !== 'TENDING' && p.status !== 'HARVEST_APPROVED')
    if (hasInvalidParcel) {
      throw new DomainError('Một hoặc nhiều thửa đất không ở trạng thái hợp lệ để xuất QR')
    }

    if (traceData.certificate_keys && certificateKeys) {
      traceData.certificate_keys = Array.from(new Set([...traceData.certificate_keys, ...certificateKeys]))
    } else if (certificateKeys) {
      traceData.certificate_keys = certificateKeys
    }

    // Generate QR code pointing to the public lot page
    const publicUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'}/lot/${lot.lot_code}`
    let qrImageUrl = `/lot/${lot.lot_code}`

    try {
      // Try MinIO upload if available
      const { MinioStorageAdapter } = await import('@/infrastructure/storage/minio-storage.adapter')
      const qrBuffer = await QRCode.toBuffer(publicUrl, { type: 'png', margin: 1 })
      const storagePort = new MinioStorageAdapter()
      const uploadResult = await storagePort.uploadFile(qrBuffer, `qr-${lot.lot_code}.png`, 'image/png')
      qrImageUrl = uploadResult.presignedUrl
    } catch {
      // MinIO not available — fallback to local URL path (non-critical for MVP)
    }

    return this.lotPort.exportQr(lotId, traceData, qrImageUrl, certificateKeys)
  }
}

