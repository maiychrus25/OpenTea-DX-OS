// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, ParcelFilters } from '@/domain/farm/ports/ParcelPort'
import { ForbiddenError } from '@/domain/errors'

export class ListParcelsUseCase {
  constructor(private readonly parcelPort: Pick<ParcelPort, 'findAll'>) {}

  async execute(filters: ParcelFilters, userRole: string, userHouseholdId?: string) {
    if (userRole === 'FARMER') {
      if (!userHouseholdId) {
        throw new ForbiddenError('Tài khoản nông dân chưa được liên kết với nông hộ')
      }
      filters.household_id = userHouseholdId // Force override to prevent seeing other households
    }
    return this.parcelPort.findAll(filters)
  }
}
