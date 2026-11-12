// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { InstalledApp } from '@/domain/entities/installed-app'
import { prisma } from '@/infrastructure/db/prisma.client'

type InstalledAppRow = Omit<InstalledApp, 'publicPrefixes'> & { public_prefixes: string[] }

const toInstalledApp = ({ public_prefixes, ...app }: InstalledAppRow): InstalledApp => ({ ...app, publicPrefixes: public_prefixes })

/**
 * Platform data that belongs to no HTX, read with Prisma because anonymous public requests carry no token (ruling R1).
 * Never cached: an app removed while its page is open must answer 404 on the next request.
 */
export class PrismaInstalledAppRepository {
  async find(id: string): Promise<InstalledApp | null> {
    const rows = await prisma.$queryRaw<InstalledAppRow[]>`
      SELECT id, name, version, menu, COALESCE(manifest #> '{routes,public}', '[]'::jsonb) AS public_prefixes
      FROM platform.installed_apps WHERE id = ${id}`
    return rows[0] ? toInstalledApp(rows[0]) : null
  }

  async list(): Promise<InstalledApp[]> {
    const rows = await prisma.$queryRaw<InstalledAppRow[]>`
      SELECT id, name, version, menu, COALESCE(manifest #> '{routes,public}', '[]'::jsonb) AS public_prefixes
      FROM platform.installed_apps ORDER BY id`
    return rows.map(toInstalledApp)
  }
}
