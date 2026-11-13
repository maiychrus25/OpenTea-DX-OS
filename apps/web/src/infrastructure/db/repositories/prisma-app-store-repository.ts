// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import { AppStoreError, type AppStoreRepository, type AppStoreSnapshot, type StoreAction } from '@/domain/entities/app-store'
import { prisma } from '@/infrastructure/db/prisma.client'

type CatalogRow = {
  id: string
  name: string
  version: string
  description: string
  license: string
  publisher: string
  roles: string[]
  has_public: boolean
}

/** A unique violation of the one-open-request index, which Prisma reports as P2010 for raw SQL. */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  return error.code === 'P2002' || (error.code === 'P2010' && (error.meta as { code?: string } | undefined)?.code === '23505')
}

/** The App Store tables in schema `platform`, read and written with tagged templates only. Never cached. */
export class PrismaAppStoreRepository implements AppStoreRepository {
  async snapshot(htxCode: string): Promise<AppStoreSnapshot> {
    const [apps, open, enablements, latest] = await Promise.all([
      prisma.$queryRaw<CatalogRow[]>`
        SELECT id, name, version, description, license, publisher, roles, has_public
        FROM platform.app_catalog ORDER BY name, id`,
      prisma.$queryRaw<{ app_id: string; action: 'ENABLE' | 'DISABLE' }[]>`
        SELECT app_id, action FROM platform.app_requests
        WHERE htx_code = ${htxCode} AND status IN ('PENDING', 'RUNNING')`,
      prisma.$queryRaw<{ app_id: string; htx_code: string }[]>`
        SELECT app_id, htx_code FROM platform.app_enablements WHERE htx_code IN (${htxCode}, '*')`,
      prisma.$queryRaw<{ app_id: string; status: string; error: string | null }[]>`
        SELECT DISTINCT ON (app_id) app_id, status, error FROM platform.app_requests
        WHERE htx_code = ${htxCode} ORDER BY app_id, created_at DESC`,
    ])
    return {
      apps: apps.map(({ has_public, ...app }) => ({ ...app, hasPublic: has_public })),
      open: open.map(row => ({ appId: row.app_id, action: row.action })),
      enablements: enablements.map(row => ({ appId: row.app_id, htxCode: row.htx_code })),
      latest: latest.map(row => ({ appId: row.app_id, status: row.status, error: row.error })),
    }
  }

  async workerAlive(): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ alive: boolean }[]>`
      SELECT (
        EXISTS (SELECT 1 FROM platform.app_worker WHERE seen_at > now() - interval '30 seconds')
        -- A long install does not poll, but it is proof the worker is there.
        OR EXISTS (SELECT 1 FROM platform.app_requests WHERE status = 'RUNNING' AND started_at > now() - interval '15 minutes')
      ) AS alive`
    return rows[0]?.alive === true
  }

  async createRequest(appId: string, htxCode: string, action: StoreAction, requestedBy: string): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO platform.app_requests (app_id, htx_code, action, requested_by)
        VALUES (${appId}, ${htxCode}, ${action}, ${requestedBy})`
    } catch (cause) {
      if (isUniqueViolation(cause)) throw new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.')
      throw cause
    }
  }
}
