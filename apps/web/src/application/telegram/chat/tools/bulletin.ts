// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GetLatestBulletinUseCase } from '@/application/bulletin/GetLatestBulletinUseCase'
import { NotFoundError } from '@/domain/errors'
import type { Bulletin } from '@/domain/repositories/IBulletinRepository'
import { selectDiseaseModel } from '@/domain/disease/select-disease-model'
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { toEnglishCommodity } from '@/lib/translations'
import type { ChatTool } from '../types'
import { reply } from './common'

/** The newest bulletin of the cooperative's primary crop, as the route reads it; null when there is none. */
export async function latestBulletin(htxCode: string): Promise<Bulletin | null> {
  const htx = await new PrismaHtxProfileRepository(prisma).getProfile(htxCode)
  const crop = htx?.crop_types?.[0]
  const commodity = !crop || selectDiseaseModel(crop) === 'tea' ? 'Tea' : toEnglishCommodity(crop)
  try {
    return await new GetLatestBulletinUseCase(new PrismaBulletinRepository(prisma)).execute(commodity, htxCode)
  } catch (error) {
    if (error instanceof NotFoundError) return null
    throw error
  }
}

/** Routes: `GET /api/bulletin`, with the cooperative's primary crop as the commodity, as the route does. */
export const bulletinTool: ChatTool = {
  name: 'bulletin',
  titleVi: 'Bản tin',
  roles: ['officer', 'manager'],
  routes: ['GET /api/bulletin'],
  args: [],
  async run(user) {
    const bulletin = await latestBulletin(user.tenant.htxCode)
    if (!bulletin) return reply('Bản tin', [])
    // `listen` puts the Nghe button under the text (issue #80, C4).
    return { ...reply('Bản tin', bulletin.bulletin_vi.split('\n').map((line) => line.trim()).filter(Boolean)), listen: true }
  },
}
