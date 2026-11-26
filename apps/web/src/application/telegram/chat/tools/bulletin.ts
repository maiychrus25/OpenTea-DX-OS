// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetLatestBulletinUseCase } from '@/application/bulletin/GetLatestBulletinUseCase'
import { NotFoundError } from '@/domain/errors'
import { selectDiseaseModel } from '@/domain/disease/select-disease-model'
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { toEnglishCommodity } from '@/lib/translations'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Routes: `GET /api/bulletin`, with the cooperative's primary crop as the commodity, as the route does. */
export const bulletinTool: ChatTool = {
  name: 'bulletin',
  titleVi: 'Bản tin',
  roles: ['officer', 'manager'],
  routes: ['GET /api/bulletin'],
  args: [],
  async run(user) {
    const htx = await new PrismaHtxProfileRepository(prisma).getProfile(user.tenant.htxCode)
    const crop = htx?.crop_types?.[0]
    const commodity = !crop || selectDiseaseModel(crop) === 'tea' ? 'Tea' : toEnglishCommodity(crop)
    try {
      const bulletin = await new GetLatestBulletinUseCase(new PrismaBulletinRepository(prisma)).execute(commodity, user.tenant.htxCode)
      return reply('Bản tin', bulletin.bulletin_vi.split('\n').map((line) => line.trim()).filter(Boolean))
    } catch (error) {
      if (error instanceof NotFoundError) return reply('Bản tin', [])
      throw error
    }
  },
}
