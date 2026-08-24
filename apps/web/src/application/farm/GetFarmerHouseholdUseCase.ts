// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { HouseholdPort } from '@/domain/farm/ports/HouseholdPort'

export class GetFarmerHouseholdUseCase {
  constructor(private readonly householdPort: HouseholdPort) {}

  async execute(userId: string) {
    return this.householdPort.findByKeycloakUserId(userId)
  }
}
