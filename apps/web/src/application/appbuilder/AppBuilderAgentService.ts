// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { canonicalJson, sha256Hex } from '@/domain/agent/evidence'
import type { Evidence, EvidenceRow } from '@/domain/agent/proposal'
import { evidenceDigest } from '@/domain/agent/evidence'
import { AppBuildError, type AppBuildRepository, type AppBuildRequest } from '@/domain/appbuilder/app-build'
import { appStatus } from '@/application/apps/app-store.usecase'
import type { AppStoreRepository } from '@/domain/entities/app-store'
import { requestEvidenceRow } from './evidence'
import { appSpecSchema, questionsSchema, type AppSpec } from './app-spec'

/** Templates of the custom-books mini-app (contract C9). */
export const BOOK_TEMPLATES = ['cashbook', 'meeting', 'handover', 'visitors', 'blank'] as const
export type CodeProvider = 'claude-code' | 'codex-cli'
const CUSTOM_BOOKS = 'custom-books'

export const routeBodySchema = z
  .object({ path: z.enum(['store', 'book']), target: z.string().trim().min(1).max(60), reason_vi: z.string().trim().min(1).max(300) })
  .strict()
export type RouteBody = z.infer<typeof routeBodySchema>

export interface ProposeInput {
  htxCode: string
  kind: string
  payload: Record<string, unknown>
  reasonVi: string
  evidence: Evidence
}

export interface AgentServiceDeps {
  repo: AppBuildRepository
  store: Pick<AppStoreRepository, 'snapshot'>
  /** The code-writing tools whose provider keys the agent holds. */
  providers(htxCode: string): Promise<CodeProvider[]>
  /** Creates the proposal as agent `app-builder` and queues its Telegram messages; null when it was a duplicate. */
  propose(input: ProposeInput): Promise<string | null>
  notifier: {
    questionsAsked(request: AppBuildRequest, questions: string[]): Promise<void>
    finished(request: AppBuildRequest, build: Awaited<ReturnType<AppBuildRepository['latestBuild']>>): Promise<void>
  }
}

const wrongState = () => new AppBuildError('WRONG_STATE', 'Yêu cầu không ở bước này')
const evidenceOf = (...rows: EvidenceRow[]): Evidence => ({ rows, sha256: evidenceDigest(rows) })

/** What A12 reads and does, always for the cooperative of its token (contract C4). */
export class AppBuilderAgentService {
  constructor(private readonly deps: AgentServiceDeps) {}

  async waiting(htxCode: string) {
    const [requests, snapshot, providers] = await Promise.all([
      this.deps.repo.waitingForAgent(htxCode),
      this.deps.store.snapshot(htxCode),
      this.deps.providers(htxCode),
    ])
    const storeApps = snapshot.apps
      .filter((app) => !app.ownerHtx)
      .map((app) => ({
        id: app.id,
        name_vi: app.name,
        description_vi: app.description,
        enabled: ['enabled', 'enabled_all'].includes(appStatus(app.id, snapshot, htxCode).status),
      }))
    const customBooksEnabled = storeApps.some((app) => app.id === CUSTOM_BOOKS && app.enabled)
    return requests.map((request) =>
      request.status === 'passed' || request.status === 'failed'
        ? { id: request.id, status: request.status }
        : {
            id: request.id,
            status: request.status,
            request_text: request.requestText,
            questions: request.questions,
            answer_text: request.answerText,
            store_apps: storeApps,
            book_templates: [...BOOK_TEMPLATES],
            custom_books_enabled: customBooksEnabled,
            code_providers: providers,
          }
    )
  }

  async askQuestions(htxCode: string, id: string, rawQuestions: unknown): Promise<void> {
    const questions = questionsSchema.parse(rawQuestions)
    const request = await this.mustFind(htxCode, id)
    if (!(await this.deps.repo.setQuestions(htxCode, id, questions))) throw wrongState()
    await this.deps.notifier.questionsAsked(request, questions)
  }

  /** Returns the id of the proposal that carries the decision to the manager. */
  async route(htxCode: string, id: string, rawBody: unknown): Promise<string | null> {
    const body = routeBodySchema.parse(rawBody)
    const request = await this.mustFind(htxCode, id)
    const snapshot = await this.deps.store.snapshot(htxCode)
    const storeApp = (appId: string) => snapshot.apps.find((app) => app.id === appId && !app.ownerHtx)
    if (body.path === 'store' && !storeApp(body.target)) throw new AppBuildError('NOT_INSTALLABLE', 'Không có ứng dụng này trong kho')
    if (body.path === 'book' && !(BOOK_TEMPLATES as readonly string[]).includes(body.target)) {
      throw new AppBuildError('NOT_INSTALLABLE', 'Mẫu sổ không có trong Sổ tự tạo')
    }
    const target = body.path === 'store' ? body.target : CUSTOM_BOOKS
    if (!(await this.deps.repo.setRouted(htxCode, id, body.path, target))) throw wrongState()
    const routed = await this.mustFind(htxCode, id)

    const booksOn = appStatus(CUSTOM_BOOKS, snapshot, htxCode).status
    const customBooksEnabled = booksOn === 'enabled' || booksOn === 'enabled_all'
    if (body.path === 'book' && customBooksEnabled) {
      const row: EvidenceRow = {
        table: `app:${CUSTOM_BOOKS}`,
        id: request.id,
        sha256: sha256Hex(canonicalJson({ request_id: request.id })),
        values: { request_id: request.id },
      }
      return this.proposeOrRestore(request, {
        htxCode,
        kind: `app.${CUSTOM_BOOKS}.book.create`,
        payload: { template: body.target, name_vi: request.requestText.slice(0, 80) },
        reasonVi: body.reason_vi,
        evidence: evidenceOf(row),
      })
    }
    return this.proposeOrRestore(request, {
      htxCode,
      kind: 'miniapp.install',
      payload: { app_id: target },
      reasonVi: body.reason_vi,
      evidence: evidenceOf(requestEvidenceRow(routed, null)),
    })
  }

  /** A request whose proposal could not be created goes back to where it was: left as it is, nobody could ever decide it. */
  private async proposeOrRestore(previous: AppBuildRequest, input: ProposeInput): Promise<string | null> {
    try {
      return await this.deps.propose(input)
    } catch (err) {
      await this.deps.repo.restore(previous.htxCode, previous.id, previous)
      throw err
    }
  }

  /** The body is the C2 spec itself. APP_ID_TAKEN (409) comes from the repository. */
  async proposeSpec(htxCode: string, id: string, rawSpec: unknown): Promise<string | null> {
    const spec: AppSpec = appSpecSchema.parse(rawSpec)
    const previous = await this.mustFind(htxCode, id)
    if (!(await this.deps.repo.setSpec(htxCode, id, spec.app_id, spec))) throw wrongState()
    const proposed = await this.mustFind(htxCode, id)
    return this.proposeOrRestore(previous, {
      htxCode,
      kind: 'app.spec.approve',
      payload: { request_id: id },
      reasonVi: `Đặc tả app "${spec.name_vi}" chờ bạn duyệt trước khi viết mã.`,
      evidence: evidenceOf(requestEvidenceRow(proposed, null)),
    })
  }

  /** Idempotent: the second call finds the request announced and does nothing. */
  async announce(htxCode: string, id: string, now: Date = new Date()): Promise<string | null> {
    await this.mustFind(htxCode, id)
    const claimed = await this.deps.repo.claimAnnounce(htxCode, id, now)
    if (!claimed) return null
    try {
      const build = await this.deps.repo.latestBuild(htxCode, id)
      await this.deps.notifier.finished(claimed, build)
      if (claimed.status !== 'passed' || !claimed.appId) return null
      const name = typeof claimed.spec?.name_vi === 'string' ? claimed.spec.name_vi : claimed.appId
      return await this.deps.propose({
        htxCode,
        kind: 'miniapp.install',
        payload: { app_id: claimed.appId },
        reasonVi: `Cài app "${name}" cho HTX. App do AI xây, đã qua cổng kiểm tra.`,
        evidence: evidenceOf(requestEvidenceRow(claimed, build)),
      })
    } catch (err) {
      await this.deps.repo.releaseAnnounce(htxCode, id)
      throw err
    }
  }

  private async mustFind(htxCode: string, id: string): Promise<AppBuildRequest> {
    const request = await this.deps.repo.findById(htxCode, id)
    if (!request) throw new AppBuildError('REQUEST_NOT_FOUND', 'Không tìm thấy yêu cầu')
    return request
  }
}
