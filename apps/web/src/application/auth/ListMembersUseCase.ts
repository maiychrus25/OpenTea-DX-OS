// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { UserPort, UserSummary } from '@/domain/auth/ports/UserPort'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'

export class ListMembersUseCase {
  constructor(private readonly userRepo: UserPort) {}

  async execute(userRole: string, filterRole?: string): Promise<UserSummary[]> {
    if (userRole !== 'MANAGER' && userRole !== 'OFFICER') {
      throw new ForbiddenError('Chỉ cán bộ và quản lý mới được xem danh sách thành viên')
    }

    return await this.userRepo.findAll(filterRole)
  }
}
