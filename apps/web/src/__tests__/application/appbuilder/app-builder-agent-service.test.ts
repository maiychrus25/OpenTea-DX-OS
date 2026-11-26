/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { AppBuilderAgentService, type ProposeInput } from '@/application/appbuilder/AppBuilderAgentService'
import { assertInstallable } from '@/application/appbuilder/install-check'
import { requestEvidenceRow } from '@/application/appbuilder/evidence'
import { AppBuildError, type AppBuild, type AppBuildRepository, type AppBuildRequest } from '@/domain/appbuilder/app-build'
import type { AppStoreSnapshot } from '@/domain/entities/app-store'

const spec = {
  app_id: 'gen-fertiliser-stock',
  name_vi: 'Kho phân bón',
  summary_vi: 'Theo dõi nhập xuất phân bón.',
  roles: [{ role: 'manager', can_vi: 'Xem tồn kho' }],
  screens: [{ path: '/', title_vi: 'Tồn kho', purpose_vi: 'Xem số lượng' }],
  data: [],
  agent_reads: [],
}

function request(over: Partial<AppBuildRequest> = {}): AppBuildRequest {
  return {
    id: '11111111-1111-4111-8111-111111111111', htxCode: 'TC', requestedBy: 'u1', requestedByName: 'An', requestText: 'cần app kho phân bón',
    questions: [], answerText: null, path: null, appId: null, spec: null, status: 'new', errorVi: null, announcedAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  }
}

/** A repository that keeps rows in memory and enforces the same transitions as the SQL. */
function fakeRepo(initial: AppBuildRequest[], builds: AppBuild[] = [], catalog: { id: string; ownerHtx: string | null; buildId: string | null }[] = []) {
  const rows = new Map(initial.map((r) => [r.id, r]))
  const move = (htx: string, id: string, from: string[], change: Partial<AppBuildRequest>) => {
    const row = rows.get(id)
    if (!row || row.htxCode !== htx || !from.includes(row.status)) return false
    rows.set(id, { ...row, ...change })
    return true
  }
  const repo: Partial<AppBuildRepository> = {
    findById: async (htx, id) => (rows.get(id)?.htxCode === htx ? rows.get(id)! : null),
    waitingForAgent: async (htx) =>
      Array.from(rows.values()).filter((r) => r.htxCode === htx && (r.status === 'new' || (r.status === 'asking' && r.answerText) || (['passed', 'failed'].includes(r.status) && !r.announcedAt))),
    setQuestions: async (h, id, questions) => move(h, id, ['new'], { status: 'asking', questions }),
    setRouted: async (h, id, path, target) => move(h, id, ['new', 'asking'], { status: 'routed', path, appId: target }),
    setSpec: async (h, id, appId, s) => {
      if ([...catalog].some((c) => c.id === appId) || builds.some((b) => b.appId === appId)) throw new AppBuildError('APP_ID_TAKEN', 'taken')
      return move(h, id, ['new', 'asking'], { status: 'spec_proposed', path: 'build', appId, spec: s })
    },
    claimAnnounce: async (h, id, now) => {
      const row = rows.get(id)
      if (!row || row.htxCode !== h || row.announcedAt || !['passed', 'failed'].includes(row.status)) return null
      rows.set(id, { ...row, announcedAt: now })
      return rows.get(id)!
    },
    releaseAnnounce: async (_h, id) => void rows.set(id, { ...rows.get(id)!, announcedAt: null }),
    latestBuild: async (_h, requestId) => builds.find((b) => b.requestId === requestId) ?? null,
    buildById: async (id) => builds.find((b) => b.id === id) ?? null,
    catalogOwnership: async (id) => {
      const c = catalog.find((x) => x.id === id)
      return c ? { appId: c.id, ownerHtx: c.ownerHtx, buildId: c.buildId } : null
    },
  }
  return { repo: repo as AppBuildRepository, rows }
}

const snapshot = (enabled: string[] = []): AppStoreSnapshot => ({
  apps: [
    { id: 'tea-shop', name: 'Cửa hàng chè', version: '1', description: 'Bán chè', license: 'MIT', publisher: 'x', roles: [], hasPublic: false, menu: [], hasDatabase: false, requiresCore: null, store: {}, installedOnServer: true, installedVersion: '1' },
    { id: 'custom-books', name: 'Sổ tự tạo', version: '1', description: 'Sổ', license: 'MIT', publisher: 'x', roles: [], hasPublic: false, menu: [], hasDatabase: true, requiresCore: null, store: {}, installedOnServer: true, installedVersion: '1' },
  ],
  open: [], latest: [], enablements: enabled.map((appId) => ({ appId, htxCode: 'TC' })),
})

function service(repo: AppBuildRepository, providers: ('claude-code' | 'codex-cli')[] = []) {
  const proposals: ProposeInput[] = []
  const questions: string[][] = []
  const finished: unknown[] = []
  const svc = new AppBuilderAgentService({
    repo,
    store: { snapshot: async () => snapshot(['custom-books']) },
    providers: async () => providers,
    propose: async (input) => (proposals.push(input), `proposal-${proposals.length}`),
    notifier: { questionsAsked: async (_r, q) => void questions.push(q), finished: async (r) => void finished.push(r.status) },
  })
  return { svc, proposals, questions, finished }
}

describe('A12 service (contract C4)', () => {
  it('lists new requests, answered ones and finished ones not yet announced, with the C4 fields on open ones', async () => {
    const { repo } = fakeRepo([
      request(),
      request({ id: '22222222-2222-4222-8222-222222222222', status: 'asking', answerText: 'tất cả' }),
      request({ id: '33333333-3333-4333-8333-333333333333', status: 'asking' }),
      request({ id: '44444444-4444-4444-8444-444444444444', status: 'passed' }),
      request({ id: '55555555-5555-4555-8555-555555555555', status: 'failed', announcedAt: new Date() }),
    ])
    const { svc } = service(repo, ['claude-code'])
    const list = await svc.waiting('TC')
    expect(list.map((r) => r.status)).toEqual(['new', 'asking', 'passed'])
    expect(list[0]).toMatchObject({ request_text: 'cần app kho phân bón', code_providers: ['claude-code'], custom_books_enabled: true })
    expect((list[0] as { store_apps: { id: string; enabled: boolean }[] }).store_apps.find((a) => a.id === 'custom-books')?.enabled).toBe(true)
    expect(list[2]).toEqual({ id: '44444444-4444-4444-8444-444444444444', status: 'passed' })
  })

  it('moves a new request to asking and sends the questions, at most 5', async () => {
    const { repo, rows } = fakeRepo([request()])
    const { svc, questions } = service(repo)
    await svc.askQuestions('TC', request().id, ['Ai dùng?', 'Ghi gì?'])
    expect(rows.get(request().id)?.status).toBe('asking')
    expect(questions).toEqual([['Ai dùng?', 'Ghi gì?']])
    await expect(svc.askQuestions('TC', request().id, ['một'])).rejects.toMatchObject({ code: 'WRONG_STATE' })
    const other = fakeRepo([request()])
    await expect(service(other.repo).svc.askQuestions('TC', request().id, ['1', '2', '3', '4', '5', '6'])).rejects.toThrow()
  })

  it('routes to the store with a miniapp.install proposal that cites the routed request', async () => {
    const { repo } = fakeRepo([request()])
    const { svc, proposals } = service(repo)
    expect(await svc.route('TC', request().id, { path: 'store', target: 'tea-shop', reason_vi: 'Đã có app' })).toBe('proposal-1')
    expect(proposals[0]).toMatchObject({ kind: 'miniapp.install', payload: { app_id: 'tea-shop' } })
    expect(proposals[0].evidence.rows[0].values).toMatchObject({ status: 'routed', path: 'store', app_id: 'tea-shop' })
  })

  it('routes to a book through the custom-books action when it is enabled', async () => {
    const { repo } = fakeRepo([request()])
    const { svc, proposals } = service(repo)
    await svc.route('TC', request().id, { path: 'book', target: 'cashbook', reason_vi: 'Sổ quỹ' })
    expect(proposals[0]).toMatchObject({ kind: 'app.custom-books.book.create', payload: { template: 'cashbook' } })
    expect(proposals[0].evidence.rows[0].table).toBe('app:custom-books')
  })

  it('refuses a store target that is not in the store and a book template that does not exist', async () => {
    const { repo } = fakeRepo([request()])
    const { svc } = service(repo)
    await expect(svc.route('TC', request().id, { path: 'store', target: 'nope', reason_vi: 'x' })).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
    await expect(svc.route('TC', request().id, { path: 'book', target: 'nope', reason_vi: 'x' })).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
    await expect(svc.route('TC', request().id, { path: 'store', target: 'tea-shop', reason_vi: 'x'.repeat(301) })).rejects.toThrow()
  })

  it('proposes the spec: the request becomes spec_proposed and the proposal carries the whole spec as evidence', async () => {
    const { repo, rows } = fakeRepo([request()])
    const { svc, proposals } = service(repo)
    await svc.proposeSpec('TC', request().id, spec)
    expect(rows.get(request().id)).toMatchObject({ status: 'spec_proposed', appId: 'gen-fertiliser-stock' })
    expect(proposals[0]).toMatchObject({ kind: 'app.spec.approve', payload: { request_id: request().id } })
    expect(proposals[0].evidence.rows[0].values).toMatchObject({ status: 'spec_proposed', spec })
  })

  it('answers APP_ID_TAKEN when a build already holds the id, and leaves the request as it was (test W-2)', async () => {
    const taken = { id: 'b1', requestId: 'other', htxCode: 'LB', appId: 'gen-fertiliser-stock', version: '0.1.0', provider: 'replay', rounds: 1, status: 'passed', gates: [], gitTag: null, startedAt: new Date(), finishedAt: null } as AppBuild
    const { repo, rows } = fakeRepo([request()], [taken])
    const { svc, proposals } = service(repo)
    await expect(svc.proposeSpec('TC', request().id, spec)).rejects.toMatchObject({ code: 'APP_ID_TAKEN', status: 409 })
    expect(rows.get(request().id)?.status).toBe('new')
    expect(proposals).toHaveLength(0)
    await svc.proposeSpec('TC', request().id, { ...spec, app_id: 'gen-fertiliser-stock-2' })
    expect(rows.get(request().id)?.appId).toBe('gen-fertiliser-stock-2')
  })

  it('never sees a request of another cooperative', async () => {
    const { repo } = fakeRepo([request({ htxCode: 'LB' })])
    await expect(service(repo).svc.proposeSpec('TC', request().id, spec)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' })
  })

  describe('announce (ruling 1)', () => {
    const build = { id: 'b1', requestId: request().id, htxCode: 'TC', appId: 'gen-fertiliser-stock', version: '0.1.0', provider: 'replay', rounds: 1, status: 'passed', gates: [{ name: 'a', ok: true, detail_vi: '' }], gitTag: 'v0.1.0', startedAt: new Date(), finishedAt: new Date() } as AppBuild

    it('queues the message and the install proposal once, and does nothing the second time', async () => {
      const { repo } = fakeRepo([request({ status: 'passed', appId: 'gen-fertiliser-stock', spec })], [build])
      const { svc, proposals, finished } = service(repo)
      expect(await svc.announce('TC', request().id)).toBe('proposal-1')
      expect(await svc.announce('TC', request().id)).toBeNull()
      expect(proposals).toHaveLength(1)
      expect(finished).toEqual(['passed'])
      expect(proposals[0]).toMatchObject({ kind: 'miniapp.install', payload: { app_id: 'gen-fertiliser-stock' } })
      expect(proposals[0].evidence.rows[0].values).toMatchObject({ status: 'passed', gates_passed: 1, gates_total: 1 })
    })

    it('queues only the failure message for a failed request and answers a null proposal', async () => {
      const { repo } = fakeRepo([request({ status: 'failed', errorVi: 'Trượt cổng tests' })])
      const { svc, proposals, finished } = service(repo)
      expect(await svc.announce('TC', request().id)).toBeNull()
      expect(proposals).toHaveLength(0)
      expect(finished).toEqual(['failed'])
    })

    it('releases the claim when the proposal cannot be created, so A12 can retry', async () => {
      const { repo, rows } = fakeRepo([request({ status: 'passed', appId: 'gen-fertiliser-stock', spec })], [build])
      const svc = new AppBuilderAgentService({
        repo, store: { snapshot: async () => snapshot() }, providers: async () => [],
        propose: async () => { throw new Error('boom') },
        notifier: { questionsAsked: async () => undefined, finished: async () => undefined },
      })
      await expect(svc.announce('TC', request().id)).rejects.toThrow('boom')
      expect(rows.get(request().id)?.announcedAt).toBeNull()
    })
  })
})

describe('miniapp.install check (test 28)', () => {
  const passedBuild = { id: 'b1', requestId: request().id, htxCode: 'TC', appId: 'gen-x-app', version: '0.1.0', provider: 'r', rounds: 1, status: 'passed', gates: [], gitTag: null, startedAt: new Date(), finishedAt: null } as AppBuild
  const approved = request({ status: 'passed', appId: 'gen-x-app', spec })

  it('lets a store app through and the owner install a passed build', async () => {
    const { repo } = fakeRepo([approved], [passedBuild], [{ id: 'tea-shop', ownerHtx: null, buildId: null }, { id: 'gen-x-app', ownerHtx: 'TC', buildId: 'b1' }])
    await expect(assertInstallable(repo, 'TC', 'tea-shop')).resolves.toBeUndefined()
    await expect(assertInstallable(repo, 'TC', 'gen-x-app')).resolves.toBeUndefined()
  })

  it('refuses a generated app of another cooperative', async () => {
    const { repo } = fakeRepo([approved], [passedBuild], [{ id: 'gen-x-app', ownerHtx: 'TC', buildId: 'b1' }])
    await expect(assertInstallable(repo, 'LB', 'gen-x-app')).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
  })

  it('refuses a generated app whose build did not pass, or whose request has no approved spec', async () => {
    const failed = fakeRepo([approved], [{ ...passedBuild, status: 'failed' }], [{ id: 'gen-x-app', ownerHtx: 'TC', buildId: 'b1' }])
    await expect(assertInstallable(failed.repo, 'TC', 'gen-x-app')).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
    const noSpec = fakeRepo([request({ status: 'passed', appId: 'gen-x-app', spec: null })], [passedBuild], [{ id: 'gen-x-app', ownerHtx: 'TC', buildId: 'b1' }])
    await expect(assertInstallable(noSpec.repo, 'TC', 'gen-x-app')).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
  })

  it('refuses a generated app with no build at all, and an app that is not in the catalogue', async () => {
    const { repo } = fakeRepo([approved], [], [{ id: 'gen-x-app', ownerHtx: 'TC', buildId: null }])
    await expect(assertInstallable(repo, 'TC', 'gen-x-app')).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
    await expect(assertInstallable(repo, 'TC', 'ghost')).rejects.toMatchObject({ code: 'NOT_INSTALLABLE' })
  })

  it('keeps the evidence of a request stable, so an unchanged request is never stale', () => {
    const row = requestEvidenceRow(approved, passedBuild)
    expect(requestEvidenceRow(approved, passedBuild).sha256).toBe(row.sha256)
    expect(requestEvidenceRow({ ...approved, status: 'installed' }, passedBuild).sha256).not.toBe(row.sha256)
  })
})
