// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { NotificationPort } from '@/domain/ports/notification-port'
import { NotFoundError } from '@/domain/errors/NotFoundError'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'
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

    // Check withdrawal period
    const { entries } = await this.journalPort.findAll({ parcel_id: parcelId, status: 'APPROVED' })
    let maxSafeDate: Date | null = null

    for (const entry of entries) {
      for (const activity of entry.activities) {
        if (activity.safe_harvest_date) {
          const date = new Date(activity.safe_harvest_date)
          if (!maxSafeDate || date > maxSafeDate) {
            maxSafeDate = date
          }
        }
      }
    }

    if (maxSafeDate) {
      const now = new Date()
      if (now < maxSafeDate) {
        throw new DomainError(`Chưa qua thời gian cách ly. An toàn thu hoạch từ ngày ${maxSafeDate.toLocaleDateString('vi-VN')}`)
      }
    }

    // Update parcel status
    const updatedParcel = await this.parcelPort.approveHarvest(parcelId, officerId)

    // Notify Manager
    await this.notificationPort.broadcastHarvestApproved(parcel.parcel_code, officerId)
    
    return updatedParcel
  }
}
