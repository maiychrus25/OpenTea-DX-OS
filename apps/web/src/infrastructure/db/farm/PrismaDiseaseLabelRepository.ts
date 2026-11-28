// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { DiseaseLabelPort, DiseaseLabelView } from '@/domain/disease/ports/disease-label.port'

export class PrismaDiseaseLabelRepository implements DiseaseLabelPort {
  async list(): Promise<DiseaseLabelView[]> {
    return prisma.diseaseLabel.findMany({
      orderBy: [{ is_target: 'desc' }, { sort_order: 'asc' }],
      select: { code: true, name_vi: true, scientific_name: true, group: true, is_target: true, sort_order: true },
    })
  }

  async exists(code: string): Promise<boolean> {
    return (await prisma.diseaseLabel.count({ where: { code } })) > 0
  }
}
