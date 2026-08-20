// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { HouseholdPort, HouseholdSummary } from '@/domain/farm/ports/HouseholdPort'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'
import { NotFoundError } from '@/domain/errors/NotFoundError'

export class GetHouseholdUseCase {
  constructor(private readonly householdRepo: HouseholdPort) {}

  async execute(id: string, userRole: string, userHouseholdId?: string): Promise<HouseholdSummary> {
    const household = await this.householdRepo.findById(id)
    if (!household) {
      throw new NotFoundError('Không tìm thấy nông hộ')
    }

    if (userRole === 'FARMER') {
      if (household.id !== userHouseholdId) {
        throw new ForbiddenError('Bạn không có quyền xem thông tin nông hộ này')
      }
    }

    return household
  }
}
