// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort } from '@/domain/lot/ports/LotPort'
import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { NotFoundError, DomainError } from '@/domain/errors'
import * as QRCode from 'qrcode'
import { MinioStorageAdapter } from '@/infrastructure/storage/minio-storage.adapter'

export class ExportQrUseCase {
  constructor(
    private readonly lotPort: LotPort,
    private readonly traceRepo: LotTraceRepository,
  ) {}

  async execute(lotId: string) {
    const lot = await this.lotPort.findById(lotId)
    if (!lot) throw new NotFoundError('Lot not found')
    if (lot.status === 'QR_EXPORTED') throw new DomainError('Lot already exported')

    // Get trace data snapshot
    const traceData = await this.traceRepo.getLotByCode(lot.lot_code)
    if (!traceData) throw new NotFoundError('Trace data not found')

    // Generate QR code
    const publicUrl = `https://dx-agrimarket.example.com/lot/${lot.lot_code}` // Mock domain
    const qrBuffer = await QRCode.toBuffer(publicUrl, { type: 'png', margin: 1 })

    // Upload to MinIO
    const storagePort = new MinioStorageAdapter()
    const uploadResult = await storagePort.uploadFile(qrBuffer, `qr-${lot.lot_code}.png`, 'image/png')

    // Wait, the lotPort.exportQr needs to accept qrImageUrl, or we update traceData to include it?
    // PrismaLotRepository handles it using qr_image_url field. 
    // Wait, let's look at PrismaLotRepository.exportQr signature: exportQr(id: string, snapshotData: LotTraceData): Promise<ExportQrResult>
    // It currently hardcodes qr_image_url: `/lot/${currentLot.lot_code}`.
    // I need to update PrismaLotRepository as well. For now, let's just pass uploadResult.presignedUrl in a modified signature.
    
    return this.lotPort.exportQr(lotId, traceData, uploadResult.presignedUrl)
  }
}
