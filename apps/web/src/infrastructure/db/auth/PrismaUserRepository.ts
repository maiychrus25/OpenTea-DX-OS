// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { UserPort, UserSummary } from '@/domain/auth/ports/UserPort'

export class PrismaUserRepository implements UserPort {
  async findAll(role?: string): Promise<UserSummary[]> {
    // Mock data since User model is not in Prisma schema (managed by Keycloak)
    const allUsers: UserSummary[] = [
      { id: 'u1', email: 'manager@example.com', full_name: 'Manager', role: 'MANAGER', is_active: true, phone: null, household_id: null },
      { id: 'u2', email: 'officer@example.com', full_name: 'Officer 1', role: 'OFFICER', is_active: true, phone: null, household_id: null },
      { id: 'u3', email: 'farmer1@example.com', full_name: 'Farmer 1', role: 'FARMER', household_id: 'hh1', is_active: true, phone: null },
    ]
    
    if (role) {
      return allUsers.filter(u => u.role === role.toUpperCase())
    }
    return allUsers
  }
}
