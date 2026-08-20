// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { HouseholdPort, UpdateHouseholdData, HouseholdSummary } from '@/domain/farm/ports/HouseholdPort'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'
import { NotFoundError } from '@/domain/errors/NotFoundError'

export class UpdateHouseholdUseCase {
  constructor(private readonly householdRepo: HouseholdPort) {}

  async execute(id: string, data: UpdateHouseholdData, userRole: string, userHouseholdId?: string): Promise<HouseholdSummary> {
    const existing = await this.householdRepo.findById(id)
    if (!existing) {
      throw new NotFoundError('Không tìm thấy nông hộ')
    }

    if (userRole === 'FARMER') {
      if (existing.id !== userHouseholdId) {
        throw new ForbiddenError('Bạn không có quyền sửa thông tin nông hộ này')
      }
    }

    return await this.householdRepo.update(id, data)
  }
}
