// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort, CreateLotData } from '@/domain/lot/ports/LotPort'
import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { DomainError } from '@/domain/errors/DomainError'

export class CreateLotUseCase {
  constructor(
    private readonly lotPort: LotPort,
    private readonly parcelPort: ParcelPort,
    private readonly journalPort: JournalPort
  ) {}

  async execute(data: CreateLotData) {
    if (data.parcel_ids.length === 0) {
      throw new DomainError('Cần ít nhất 1 thửa đất để tạo lô hàng')
    }

    // 1. Kiểm tra parcel hợp lệ & Validate Parcel Status & Withdrawal Period
    await Promise.all(
      data.parcel_ids.map(async (parcelId) => {
        const parcel = await this.parcelPort.findById(parcelId)
        if (!parcel) {
          throw new DomainError(`Không tìm thấy thửa đất có ID: ${parcelId}`)
        }

        // 2. Validate Parcel Status
        if (!['GROWING', 'HARVEST_APPROVED', 'HARVESTED'].includes(parcel.status)) {
          throw new DomainError(`Thửa đất ${parcel.parcel_code} không ở trạng thái hợp lệ để thu hoạch. Status: ${parcel.status}`)
        }

        // 3. Kiểm tra Withdrawal Period (Thời gian cách ly)
        const journals = await this.journalPort.findAll({ parcel_id: parcelId, limit: 100 })
        
        let maxSafeDate: Date | null = null
        for (const entry of journals.entries) {
          if (entry.status === 'REJECTED') continue
          
          for (const act of entry.activities) {
            if (act.safe_harvest_date) {
              const safeDate = new Date(act.safe_harvest_date)
              if (!maxSafeDate || safeDate > maxSafeDate) {
                maxSafeDate = safeDate
              }
            }
          }
        }

        if (maxSafeDate) {
          const harvestDate = new Date(data.harvest_date)
          if (harvestDate < maxSafeDate) {
            throw new DomainError(`WITHDRAWAL_NOT_PASSED: Thửa đất ${parcel.parcel_code} chưa qua thời gian cách ly. An toàn thu hoạch từ ngày ${maxSafeDate.toISOString().slice(0, 10)}`)
          }
        }
      })
    )

    // Tất cả valid -> Tạo lô
    return this.lotPort.create(data)
  }
}
