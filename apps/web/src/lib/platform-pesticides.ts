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

/** The shared pesticide catalogue (spec S1 §4.1), edited by the platform admin. */
export const pesticideProducts = () => prisma.pesticideProduct
