// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort, CreateJournalData } from '@/domain/journal/ports/JournalPort'
import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'
import { NotFoundError } from '@/domain/errors/NotFoundError'

export class CreateJournalEntryUseCase {
  constructor(
    private readonly journalPort: JournalPort,
    private readonly parcelPort: ParcelPort
  ) {}

  async execute(data: CreateJournalData, userRole: string, userHouseholdId?: string) {
    if (userRole === 'FARMER') {
      if (!userHouseholdId) {
        throw new ForbiddenError('Tài khoản nông dân chưa được liên kết với nông hộ')
      }
      const parcel = await this.parcelPort.findById(data.parcel_id)
      if (!parcel) {
        throw new NotFoundError('Không tìm thấy thửa đất')
      }
      if (parcel.household_id !== userHouseholdId) {
        throw new ForbiddenError('Bạn không có quyền ghi nhật ký cho thửa đất này')
      }
    }
    return this.journalPort.create(data)
  }
}
