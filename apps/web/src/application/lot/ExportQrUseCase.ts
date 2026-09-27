// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort } from '@/domain/lot/ports/LotPort'
import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { NotFoundError, DomainError } from '@/domain/errors'
import * as QRCode from 'qrcode'
import { LotTraceData } from '@/domain/entities/lot-trace-data'

import { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'
import { StoragePort } from '@/domain/disease/ports/storage.port'

export class ExportQrUseCase {
  constructor(
    private readonly lotPort: LotPort,
    private readonly traceRepo: LotTraceRepository,
    private readonly storagePort: StoragePort,
    private readonly docStoragePort: DocumentStoragePort,
  ) {}

  async execute(lotId: string, certificateKeys?: string[], baseUrl?: string) {
    const lot = await this.lotPort.findById(lotId)
    if (!lot) throw new NotFoundError('Lot not found')
    if (lot.status === 'QR_EXPORTED') throw new DomainError('Lot already exported')
    // Guard: only READY lots can be exported (prevent DRAFT export, EC-S01)
    if (lot.status !== 'READY') throw new DomainError('Chỉ lô hàng ở trạng thái READY mới được xuất QR')

    // Get trace data snapshot
    const traceData = await this.traceRepo.getLotByCode(lot.lot_code)
    if (!traceData) throw new NotFoundError('Trace data not found')

    // Guard: lot must have at least 1 parcel (EC-S02)
    if (!traceData.parcels || traceData.parcels.length === 0) {
      throw new DomainError('Lô hàng phải có ít nhất 1 thửa đất liên kết')
    }

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

    // Generate QR code pointing to the public lot page — baseUrl injected from route handler (headers.host) to keep hexagonal purity
    const rawBaseUrl = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const resolvedBaseUrl = rawBaseUrl.replace(/\/+$/, '')
    const publicUrl = `${resolvedBaseUrl}/lot/${encodeURIComponent(lot.lot_code)}`
    let qrImageUrl: string

    try {
      // Try upload via injected StoragePort
      const qrBuffer = await QRCode.toBuffer(publicUrl, { type: 'png', margin: 1 })
      const uploadResult = await this.storagePort.uploadFile(qrBuffer, `qr-${lot.lot_code}.png`, 'image/png')
      qrImageUrl = uploadResult.presignedUrl
    } catch {
      // MinIO not available — fallback to Data URI so <img> never breaks (BUG-03)
      // Nested try to handle DataURI failure separately (Blind #9)
      try {
        qrImageUrl = await QRCode.toDataURL(publicUrl, { margin: 1 })
      } catch (e) {
        throw new DomainError(`Không thể tạo mã QR: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const result = await this.lotPort.exportQr(lotId, traceData, qrImageUrl, certificateKeys)

    // Background task: Auto-archive to P.A.R.A
    this.archiveToPara(lot.lot_code, publicUrl, traceData).catch((e) => {
      console.error('[ExportQrUseCase] Failed to auto-archive to P.A.R.A:', e)
    })

    return result
  }

  private async archiveToPara(lotCode: string, publicUrl: string, traceData: LotTraceData) {
    try {
      // 1. Upload QR Code image
      const qrBuffer = await QRCode.toBuffer(publicUrl, { type: 'png', margin: 1 })
      await this.docStoragePort.uploadDocument(`para/Archives/Lô hàng đã xuất/Mã_QR_Lô_${lotCode}.png`, qrBuffer, 'image/png')
      
      // 2. Upload Traceability text summary
      const summary = `HỒ SƠ TRUY XUẤT LÔ HÀNG
-------------------------
Mã lô: ${lotCode}
Sản phẩm: ${traceData.commodity}
HTX: ${traceData.htx_name || 'Đang cập nhật'}
Ngày đóng gói: ${traceData.packaging_date ? new Date(traceData.packaging_date).toLocaleDateString('vi-VN') : 'N/A'}
Tổng khối lượng: ${traceData.total_weight_kg || 'N/A'} kg
Trạng thái an toàn: ${traceData.is_harvest_safe ? 'An toàn' : 'Cần kiểm tra'}
Nguồn gốc thửa đất: ${traceData.parcels?.map((p) => p.parcel_code).join(', ')}

Chi tiết truy xuất có thể xem tại: ${publicUrl}
Dữ liệu được xuất tại: ${new Date().toISOString()}
`;
      await this.docStoragePort.uploadDocument(`para/Archives/Lô hàng đã xuất/Hồ_sơ_truy_xuất_Lô_${lotCode}.txt`, summary, 'text/plain')
    } catch (e) {
      throw e
    }
  }
}

