// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { NotFoundError, DomainError } from '@/domain/errors'

export class DeleteParcelUseCase {
  constructor(private readonly parcelPort: ParcelPort) {}

  async execute(id: string) {
    const existing = await this.parcelPort.findById(id)
    if (!existing) throw new NotFoundError('Parcel not found')
    // BUG-08 fix: domain guard — block if linked to active lot (READY/QR_EXPORTED)
    const activeLinks = await this.parcelPort.countActiveLotLinks(id)
    if (activeLinks > 0) {
      throw new DomainError('Thửa đất đang liên kết với lô hàng đã xuất hoặc đang hoạt động, không thể xóa.')
    }
    try {
      return await this.parcelPort.delete(id)
    } catch (e: unknown) {
      // Fallback: handle race where lot created between count and delete (P2003 FK)
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('P2003') || msg.includes('Foreign key')) {
        throw new DomainError('Thửa đất đang liên kết với lô hàng đã xuất hoặc đang hoạt động, không thể xóa.')
      }
      throw e
    }
  }
}
