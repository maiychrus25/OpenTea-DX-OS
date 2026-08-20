// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, ParcelFilters } from '@/domain/farm/ports/ParcelPort'

export class ListParcelsUseCase {
  constructor(private readonly parcelPort: ParcelPort) {}

  async execute(filters: ParcelFilters, userRole: string, userHouseholdId?: string) {
    if (userRole === 'FARMER') {
      filters.household_id = userHouseholdId // Force override to prevent seeing other households
    }
    return this.parcelPort.findAll(filters)
  }
}
