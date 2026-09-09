// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { HtxProfilePort, HtxProfile } from '@/domain/farm/ports/HtxProfilePort'

export class PrismaHtxProfileRepository implements HtxProfilePort {
  async findFirst(): Promise<HtxProfile | null> {
    const htx = await prisma.htxProfile.findFirst()
    if (!htx) return null
    return {
      id: htx.id,
      name: htx.name,
    }
  }
}
