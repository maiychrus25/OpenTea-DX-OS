// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { AuthManagementPort } from '@/domain/auth/ports/auth-management.port'

import { HouseholdPort } from '@/domain/farm/ports/HouseholdPort'

export class DeleteMemberUseCase {
  constructor(
    private readonly authPort: AuthManagementPort,
    private readonly householdPort: HouseholdPort
  ) {}

  async execute(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required')
    }
    // Unlink first: once the account is gone the manager cannot retry, and the phone would stay taken.
    await this.householdPort.unlinkFromKeycloak(userId)
    await this.authPort.deleteUser(userId)
  }
}
