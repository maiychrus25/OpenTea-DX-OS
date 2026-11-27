// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'

export interface PesticideRow {
  id: string
  trade_name: string
  active_ingredient: string
  group: string
  default_phi_days: number
  phi_needs_label_check: boolean
  active: boolean
}

/**
 * The model `PesticideProduct` is created by the S1 track (spec S1 section 4.1). Until it merges, this worktree's Prisma
 * client has no such delegate, so the minimal shape used here is declared locally.
 * shortcut: a local cast, remove it once S1 is merged and `prisma.pesticideProduct` is typed.
 */
export interface PesticideDelegate {
  findMany(args: { orderBy: Record<string, 'asc' | 'desc'> }): Promise<PesticideRow[]>
  findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>
  update(args: { where: { id: string }; data: Pick<PesticideRow, 'default_phi_days' | 'phi_needs_label_check' | 'active'> }): Promise<PesticideRow>
}

export const pesticideProducts = (): PesticideDelegate => (prisma as unknown as { pesticideProduct: PesticideDelegate }).pesticideProduct
