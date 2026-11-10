// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { HouseholdPort } from '@/domain/farm/ports/HouseholdPort'

export class ListHouseholdsUseCase {
  constructor(private readonly householdPort: Pick<HouseholdPort, 'findAll'>) {}

  async execute(htxProfileId: string) {
    return this.householdPort.findAll(htxProfileId)
  }
}
