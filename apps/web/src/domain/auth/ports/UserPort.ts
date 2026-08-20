// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface UserSummary {
  id: string
  email: string
  full_name: string
  role: 'MANAGER' | 'OFFICER' | 'FARMER'
  phone: string | null
  household_id: string | null
  is_active: boolean
}

export interface UserPort {
  findAll(role?: string): Promise<UserSummary[]>
}
