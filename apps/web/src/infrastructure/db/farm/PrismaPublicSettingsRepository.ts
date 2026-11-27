// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'

export interface PublicSettings { public_show_names: boolean }

export class PrismaPublicSettingsRepository {
  async getPublicSettings(htxProfileId: string): Promise<PublicSettings> {
    const htx = await prisma.htxProfile.findUniqueOrThrow({ where: { id: htxProfileId }, select: { public_show_names: true } })
    return { public_show_names: htx.public_show_names }
  }

  async setPublicShowNames(htxProfileId: string, userId: string, value: boolean): Promise<PublicSettings> {
    return prisma.$transaction(async (tx) => {
      // Row audit events of this write name the person.
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${userId}`}, true)`
      const htx = await tx.htxProfile.update({ where: { id: htxProfileId }, data: { public_show_names: value }, select: { public_show_names: true } })
      return { public_show_names: htx.public_show_names }
    })
  }
}
