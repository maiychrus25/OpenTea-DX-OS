// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import {
  AppStoreError,
  type AppStoreRepository,
  type AppStoreSnapshot,
  type InstallPhase,
  type RequestStatus,
  type StoreAction,
  type StoreHistoryEntry,
  type StoreMenuEntry,
} from '@/domain/entities/app-store'
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
  menu: StoreMenuEntry[]
  store: unknown
  requires_core: string | null
  has_database: boolean
  installed_on_server: boolean
  installed_version: string | null
}

type HistoryRow = {
  id: string
  app_id: string
  app_name: string
  action: StoreAction
  status: RequestStatus
  requested_by_name: string | null
  created_at: Date
  finished_at: Date | null
  error: string | null
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
        SELECT c.id, c.name, c.version, c.description, c.license, c.publisher, c.roles, c.has_public,
               c.menu, c.store, c.requires_core, c.has_database,
               EXISTS (SELECT 1 FROM platform.installed_apps i WHERE i.id = c.id) AS installed_on_server,
               (SELECT i.version FROM platform.installed_apps i WHERE i.id = c.id) AS installed_version
        FROM platform.app_catalog c ORDER BY c.name, c.id`,
      prisma.$queryRaw<{ app_id: string; action: 'ENABLE' | 'DISABLE'; phase: InstallPhase | null }[]>`
        SELECT app_id, action, phase FROM platform.app_requests
        WHERE htx_code = ${htxCode} AND status IN ('PENDING', 'RUNNING')`,
      prisma.$queryRaw<{ app_id: string; htx_code: string }[]>`
        SELECT app_id, htx_code FROM platform.app_enablements WHERE htx_code IN (${htxCode}, '*')`,
      prisma.$queryRaw<{ app_id: string; status: string; error: string | null; phase: InstallPhase | null }[]>`
        SELECT DISTINCT ON (app_id) app_id, status, error, phase FROM platform.app_requests
        WHERE htx_code = ${htxCode} ORDER BY app_id, created_at DESC`,
    ])
    return {
      apps: apps.map(({ has_public, requires_core, has_database, installed_on_server, installed_version, ...app }) => ({
        ...app,
        hasPublic: has_public,
        requiresCore: requires_core,
        hasDatabase: has_database,
        installedOnServer: installed_on_server,
        installedVersion: installed_version,
      })),
      open: open.map(row => ({ appId: row.app_id, action: row.action, phase: row.phase })),
      enablements: enablements.map(row => ({ appId: row.app_id, htxCode: row.htx_code })),
      latest: latest.map(row => ({ appId: row.app_id, status: row.status, error: row.error, phase: row.phase })),
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

  async history(htxCode: string, appId: string | null, limit: number): Promise<StoreHistoryEntry[]> {
    const rows = await prisma.$queryRaw<HistoryRow[]>`
      SELECT r.id, r.app_id, COALESCE(c.name, r.app_id) AS app_name, r.action, r.status,
             r.requested_by_name, r.created_at, r.finished_at, r.error
      FROM platform.app_requests r LEFT JOIN platform.app_catalog c ON c.id = r.app_id
      WHERE (${appId}::text IS NULL OR r.app_id = ${appId}) AND r.htx_code = ${htxCode}
      ORDER BY r.created_at DESC LIMIT ${limit}`
    return rows.map(row => ({
      id: row.id,
      appId: row.app_id,
      appName: row.app_name,
      action: row.action,
      status: row.status,
      requestedByName: row.requested_by_name,
      createdAt: row.created_at.toISOString(),
      finishedAt: row.finished_at?.toISOString() ?? null,
      error: row.error,
    }))
  }

  async screenshots(appId: string): Promise<{ position: number; caption: string }[]> {
    return prisma.$queryRaw<{ position: number; caption: string }[]>`
      SELECT position, caption FROM platform.app_catalog_screenshots WHERE app_id = ${appId} ORDER BY position`
  }

  async screenshot(appId: string, position: number): Promise<{ contentType: string; bytes: Uint8Array } | null> {
    const rows = await prisma.$queryRaw<{ content_type: string; bytes: Uint8Array }[]>`
      SELECT content_type, bytes FROM platform.app_catalog_screenshots WHERE app_id = ${appId} AND position = ${position}`
    return rows[0] ? { contentType: rows[0].content_type, bytes: rows[0].bytes } : null
  }

  async createRequest(
    appId: string,
    htxCode: string,
    action: StoreAction,
    requestedBy: string,
    requestedByName: string | null,
  ): Promise<void> {
    try {
      await prisma.$executeRaw`
        INSERT INTO platform.app_requests (app_id, htx_code, action, requested_by, requested_by_name)
        VALUES (${appId}, ${htxCode}, ${action}, ${requestedBy}, ${requestedByName?.slice(0, 120) ?? null})`
    } catch (cause) {
      if (isUniqueViolation(cause)) throw new AppStoreError('REQUEST_OPEN', 'Ứng dụng này đang được xử lý. Vui lòng đợi.')
      throw cause
    }
  }
}
