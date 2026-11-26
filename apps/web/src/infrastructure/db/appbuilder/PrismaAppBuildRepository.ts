// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Prisma } from '@prisma/client'
import {
  AppBuildError,
  type AppBuild,
  type AppBuildRepository,
  type AppBuildRequest,
  type BuildFile,
  type BuildFileName,
  type CatalogOwnership,
  type GateResult,
  type NewBuildRequest,
} from '@/domain/appbuilder/app-build'
import { prisma } from '@/infrastructure/db/prisma.client'

type RequestRow = {
  id: string
  htx_code: string
  requested_by: string
  requested_by_name: string | null
  request_text: string
  questions: string[] | null
  answer_text: string | null
  path: AppBuildRequest['path']
  app_id: string | null
  spec: Record<string, unknown> | null
  status: AppBuildRequest['status']
  error_vi: string | null
  announced_at: Date | null
  created_at: Date
  updated_at: Date
}

type BuildRow = {
  id: string
  request_id: string
  htx_code: string
  app_id: string
  version: string
  provider: string
  rounds: number
  status: AppBuild['status']
  gates: GateResult[] | null
  git_tag: string | null
  started_at: Date
  finished_at: Date | null
}

// Prisma.raw: a plain string inside a $queryRaw template is sent as a bound value, not as SQL.
const REQUEST_COLUMNS = Prisma.raw(`id::text AS id, htx_code, requested_by, requested_by_name, request_text, questions,
  answer_text, path, app_id, spec, status, error_vi, announced_at, created_at, updated_at`)
const BUILD_COLUMNS = Prisma.raw(`id::text AS id, request_id::text AS request_id, htx_code, app_id, version, provider,
  rounds, status, gates, git_tag, started_at, finished_at`)

const ACTOR = 'system:web'

function mapRequest(r: RequestRow): AppBuildRequest {
  return {
    id: r.id,
    htxCode: r.htx_code,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    requestText: r.request_text,
    questions: r.questions ?? [],
    answerText: r.answer_text,
    path: r.path,
    appId: r.app_id,
    spec: r.spec,
    status: r.status,
    errorVi: r.error_vi,
    announcedAt: r.announced_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapBuild(r: BuildRow): AppBuild {
  return {
    id: r.id,
    requestId: r.request_id,
    htxCode: r.htx_code,
    appId: r.app_id,
    version: r.version,
    provider: r.provider,
    rounds: r.rounds,
    status: r.status,
    gates: r.gates ?? [],
    gitTag: r.git_tag,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }
}

/** A unique violation, which Prisma reports as P2002 or, for raw SQL, P2010 carrying the Postgres code. */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  return error.code === 'P2002' || (error.code === 'P2010' && (error.meta as { code?: string } | undefined)?.code === '23505')
}

/** Persistence adapter for the mini-app factory tables; every read and write is scoped by cooperative. */
export class PrismaAppBuildRepository implements AppBuildRepository {
  /** Every write names its audit actor, as the other platform repositories do. */
  private write<T>(actor: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${actor}, true)`
      return fn(tx)
    })
  }

  async create(input: NewBuildRequest): Promise<AppBuildRequest> {
    try {
      const rows = await this.write(`user:${input.requestedBy}`, (tx) => tx.$queryRaw<RequestRow[]>`
        INSERT INTO platform.app_build_requests (htx_code, requested_by, requested_by_name, request_text)
        VALUES (${input.htxCode}, ${input.requestedBy}, ${input.requestedByName?.slice(0, 120) ?? null}, ${input.requestText})
        RETURNING ${REQUEST_COLUMNS}`)
      return mapRequest(rows[0])
    } catch (cause) {
      if (isUniqueViolation(cause)) throw new AppBuildError('REQUEST_ACTIVE', 'HTX đang có một yêu cầu xây app chưa xong.')
      throw cause
    }
  }

  async findById(htxCode: string, id: string): Promise<AppBuildRequest | null> {
    const rows = await prisma.$queryRaw<RequestRow[]>`
      SELECT ${REQUEST_COLUMNS} FROM platform.app_build_requests WHERE htx_code = ${htxCode} AND id = ${id}::uuid`
    return rows[0] ? mapRequest(rows[0]) : null
  }

  async list(htxCode: string, limit: number): Promise<AppBuildRequest[]> {
    const rows = await prisma.$queryRaw<RequestRow[]>`
      SELECT ${REQUEST_COLUMNS} FROM platform.app_build_requests WHERE htx_code = ${htxCode}
      ORDER BY created_at DESC LIMIT ${limit}`
    return rows.map(mapRequest)
  }

  async waitingForAgent(htxCode: string): Promise<AppBuildRequest[]> {
    const rows = await prisma.$queryRaw<RequestRow[]>`
      SELECT ${REQUEST_COLUMNS} FROM platform.app_build_requests
      WHERE htx_code = ${htxCode} AND (status = 'new' OR (status = 'asking' AND answer_text IS NOT NULL)
             OR (status IN ('passed', 'failed') AND announced_at IS NULL))
      ORDER BY created_at`
    return rows.map(mapRequest)
  }

  /** Runs one conditional update; true when a row matched, so a request that moved meanwhile is left alone. */
  private async moved(actor: string, run: (tx: Prisma.TransactionClient) => Promise<number>): Promise<boolean> {
    return (await this.write(actor, run)) === 1
  }

  setQuestions(htxCode: string, id: string, questions: string[]): Promise<boolean> {
    return this.moved(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET status = 'asking', questions = ${JSON.stringify(questions)}::jsonb, updated_at = now()
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status = 'new'`)
  }

  setAnswer(htxCode: string, id: string, answerText: string): Promise<boolean> {
    return this.moved(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET answer_text = ${answerText}, updated_at = now()
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status = 'asking' AND answer_text IS NULL`)
  }

  setRouted(htxCode: string, id: string, path: 'store' | 'book', target: string): Promise<boolean> {
    return this.moved(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET status = 'routed', path = ${path}, app_id = ${target}, updated_at = now()
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status IN ('new', 'asking')`)
  }

  async setSpec(htxCode: string, id: string, appId: string, spec: Record<string, unknown>): Promise<boolean> {
    return this.write(ACTOR, async (tx) => {
      const taken = await tx.$queryRaw<{ taken: boolean }[]>`
        SELECT (
          EXISTS (SELECT 1 FROM platform.app_catalog WHERE id = ${appId})
          OR EXISTS (SELECT 1 FROM platform.app_builds WHERE app_id = ${appId})
          OR EXISTS (SELECT 1 FROM platform.app_build_requests WHERE app_id = ${appId} AND id <> ${id}::uuid
                     AND status IN ('spec_proposed', 'spec_approved', 'building', 'passed', 'installed'))
        ) AS taken`
      if (taken[0]?.taken) throw new AppBuildError('APP_ID_TAKEN', 'Mã app này đã có người dùng.')
      const changed = await tx.$executeRaw`
        UPDATE platform.app_build_requests
        SET status = 'spec_proposed', path = 'build', app_id = ${appId}, spec = ${JSON.stringify(spec)}::jsonb, updated_at = now()
        WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status IN ('new', 'asking')`
      return changed === 1
    })
  }

  approveSpec(htxCode: string, id: string): Promise<boolean> {
    return this.moved(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET status = 'spec_approved', updated_at = now()
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status = 'spec_proposed'`)
  }

  cancel(htxCode: string, id: string): Promise<boolean> {
    return this.moved(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET status = 'cancelled', updated_at = now()
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND status IN ('new', 'asking', 'spec_proposed')`)
  }

  async markInstalledByApp(htxCode: string, appId: string): Promise<boolean> {
    return (await this.write(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET status = 'installed', updated_at = now()
      WHERE htx_code = ${htxCode} AND app_id = ${appId} AND status IN ('routed', 'passed')`)) > 0
  }

  async latestStoreRequestId(htxCode: string, appId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM platform.app_requests WHERE htx_code = ${htxCode} AND app_id = ${appId}
      ORDER BY created_at DESC LIMIT 1`
    return rows[0]?.id ?? null
  }

  async claimAnnounce(htxCode: string, id: string, now: Date): Promise<AppBuildRequest | null> {
    const rows = await this.write(ACTOR, (tx) => tx.$queryRaw<RequestRow[]>`
      UPDATE platform.app_build_requests SET announced_at = ${now}
      WHERE htx_code = ${htxCode} AND id = ${id}::uuid AND announced_at IS NULL AND status IN ('passed', 'failed')
      RETURNING ${REQUEST_COLUMNS}`)
    return rows[0] ? mapRequest(rows[0]) : null
  }

  async releaseAnnounce(htxCode: string, id: string): Promise<void> {
    await this.write(ACTOR, (tx) => tx.$executeRaw`
      UPDATE platform.app_build_requests SET announced_at = NULL WHERE htx_code = ${htxCode} AND id = ${id}::uuid`)
  }

  async latestBuild(htxCode: string, requestId: string): Promise<AppBuild | null> {
    const rows = await prisma.$queryRaw<BuildRow[]>`
      SELECT ${BUILD_COLUMNS} FROM platform.app_builds
      WHERE htx_code = ${htxCode} AND request_id = ${requestId}::uuid ORDER BY started_at DESC LIMIT 1`
    return rows[0] ? mapBuild(rows[0]) : null
  }

  async buildFile(htxCode: string, buildId: string, name: BuildFileName): Promise<BuildFile | null> {
    const rows = await prisma.$queryRaw<{ content_type: string; bytes: Uint8Array }[]>`
      SELECT f.content_type, f.bytes FROM platform.app_build_files f
      JOIN platform.app_builds b ON b.id = f.build_id
      WHERE b.htx_code = ${htxCode} AND f.build_id = ${buildId}::uuid AND f.name = ${name}`
    return rows[0] ? { contentType: rows[0].content_type, bytes: rows[0].bytes } : null
  }

  async screenshotOfBuild(buildId: string, name: BuildFileName): Promise<BuildFile | null> {
    const rows = await prisma.$queryRaw<{ content_type: string; bytes: Uint8Array }[]>`
      SELECT content_type, bytes FROM platform.app_build_files WHERE build_id = ${buildId}::uuid AND name = ${name}`
    return rows[0] ? { contentType: rows[0].content_type, bytes: rows[0].bytes } : null
  }

  async requestOfApp(appId: string): Promise<AppBuildRequest | null> {
    const ownership = await this.catalogOwnership(appId)
    const build = ownership?.buildId ? await this.buildById(ownership.buildId) : null
    return build ? this.findById(build.htxCode, build.requestId) : null
  }

  async catalogOwnership(appId: string): Promise<CatalogOwnership | null> {
    const rows = await prisma.$queryRaw<{ id: string; owner_htx: string | null; build_id: string | null }[]>`
      SELECT id, owner_htx, build_id::text AS build_id FROM platform.app_catalog WHERE id = ${appId}`
    return rows[0] ? { appId: rows[0].id, ownerHtx: rows[0].owner_htx, buildId: rows[0].build_id } : null
  }

  async buildById(buildId: string): Promise<AppBuild | null> {
    const rows = await prisma.$queryRaw<BuildRow[]>`
      SELECT ${BUILD_COLUMNS} FROM platform.app_builds WHERE id = ${buildId}::uuid`
    return rows[0] ? mapBuild(rows[0]) : null
  }

  async openSpecProposalId(htxCode: string, requestId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM platform.agent_proposals
      WHERE htx_code = ${htxCode} AND kind = 'app.spec.approve' AND status = 'proposed' AND payload->>'request_id' = ${requestId}
      ORDER BY created_at DESC LIMIT 1`
    return rows[0]?.id ?? null
  }
}
