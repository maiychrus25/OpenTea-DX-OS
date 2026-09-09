// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { AuthManagementPort } from '@/domain/auth/ports/auth-management.port'

export class ApproveMemberUseCase {
  constructor(private readonly authPort: AuthManagementPort) {}

  async execute(userId: string): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required')
    }
    await this.authPort.updateUserStatus(userId, true)
  }
}
