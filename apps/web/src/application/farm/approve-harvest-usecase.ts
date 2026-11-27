// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { NotificationPort } from '@/domain/ports/notification-port'
import { NotFoundError } from '@/domain/errors/NotFoundError'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'
import { openParcelBlock } from '@/domain/journal/blocking-sprays'
import { DomainError } from '@/domain/errors/DomainError'

export class ApproveHarvestUseCase {
  constructor(
    private readonly parcelPort: ParcelPort,
    private readonly journalPort: JournalPort,
    private readonly notificationPort: NotificationPort
  ) {}

  async execute(parcelId: string, officerId: string, userRole: string): Promise<ParcelSummary> {
    if (userRole !== 'officer' && userRole !== 'manager') {
      throw new ForbiddenError('Chỉ cán bộ hoặc quản lý mới có quyền duyệt thu hoạch')
    }

    const parcel = await this.parcelPort.findById(parcelId)
    if (!parcel) {
      throw new NotFoundError('Không tìm thấy thửa đất')
    }

    // Residue stays in the plant whatever the flush: every spraying of the parcel still inside its withdrawal blocks.
    // Drafts and rejected entries do not count; pending and change-requested ones do.
    const { entries } = await this.journalPort.findAll({ parcel_id: parcelId, limit: 100 })
    const maxSafeDate = openParcelBlock(entries, new Date())
    if (maxSafeDate) {
      throw new DomainError(`Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày ${maxSafeDate.toLocaleDateString('vi-VN')}`)
    }

    // Update parcel status
    const updatedParcel = await this.parcelPort.approveHarvest(parcelId, officerId)

    // Notify Manager
    await this.notificationPort.broadcastHarvestApproved(parcel.parcel_code, officerId)
    
    return updatedParcel
  }
}
