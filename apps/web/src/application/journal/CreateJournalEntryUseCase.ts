// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { JournalPort, CreateJournalData } from '@/domain/journal/ports/JournalPort'
import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { PesticidePort } from '@/domain/pesticide/ports/PesticidePort'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'
import { NotFoundError } from '@/domain/errors/NotFoundError'
import { applyWithdrawalFloor } from './apply-withdrawal-floor'

export class CreateJournalEntryUseCase {
  constructor(
    private readonly journalPort: JournalPort,
    private readonly parcelPort: ParcelPort,
    private readonly pesticides: PesticidePort
  ) {}

  /** The entry a sender already created with this `client_id`, so a replay never makes a second one. */
  async findExisting(data: Pick<CreateJournalData, 'submitted_by_id' | 'client_id'>) {
    if (!data.client_id) return null
    return this.journalPort.findByClientId(data.submitted_by_id, data.client_id)
  }

  async execute(data: CreateJournalData, userRole: string, userHouseholdId: string | undefined, htxProfileId: string) {
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
    const activities = await applyWithdrawalFloor(data.activities, this.pesticides, htxProfileId)
    return this.journalPort.create({ ...data, activities })
  }
}
