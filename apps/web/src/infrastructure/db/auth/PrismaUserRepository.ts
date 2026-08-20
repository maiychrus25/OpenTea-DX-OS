// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { UserPort, UserSummary } from '@/domain/auth/ports/UserPort'
import { Role } from '@prisma/client'

export class PrismaUserRepository implements UserPort {
  async findAll(role?: string): Promise<UserSummary[]> {
    const whereClause = role ? { role: role.toUpperCase() as Role } : {}
    
    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
    })

    return users.map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      phone: u.phone,
      household_id: u.household_id,
      is_active: u.is_active,
    }))
  }
}
