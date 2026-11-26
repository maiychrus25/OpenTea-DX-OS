/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

const agentService = { waiting: jest.fn(), askQuestions: jest.fn(), route: jest.fn(), proposeSpec: jest.fn(), announce: jest.fn() }
const intake = { create: jest.fn(), answer: jest.fn(), cancel: jest.fn() }
const buildRepo = { latestBuild: jest.fn(), buildFile: jest.fn(), screenshotOfBuild: jest.fn() }

jest.mock('@/application/appbuilder/app-builder-services', () => ({
  appBuilderAgentService: () => agentService,
  appRequestIntake: () => intake,
}))
jest.mock('@/infrastructure/db/appbuilder/PrismaAppBuildRepository', () => ({ PrismaAppBuildRepository: jest.fn(() => buildRepo) }))
jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn(async () => ({ htxCode: 'TC' })) }))
jest.mock('@/lib/api/internal-telegram-auth', () => ({ requireTelegramCaller: jest.fn(async () => ({})) }))
jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))

import { auth } from '@/auth'
import { AppBuildError } from '@/domain/appbuilder/app-build'
import { requireTenant } from '@/lib/api/tenant'
import { GET as listRequests } from '@/app/api/internal/agent/app-builder/requests/route'
import { POST as postSpec } from '@/app/api/internal/agent/app-builder/requests/[id]/spec/route'
import { POST as postAnnounce } from '@/app/api/internal/agent/app-builder/requests/[id]/announce/route'
import { POST as postQuestions } from '@/app/api/internal/agent/app-builder/requests/[id]/questions/route'
import { POST as postRoute } from '@/app/api/internal/agent/app-builder/requests/[id]/route/route'
import { POST as createRequest } from '@/app/api/agent/app-requests/route'
import { GET as getFile } from '@/app/api/agent/app-requests/[id]/files/[name]/route'
import { GET as getMedia } from '@/app/api/internal/telegram/media/route'

const ID = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ id: ID }) }
const post = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => jest.clearAllMocks())

describe('the A12 routes', () => {
  it('answer the work list as {data: {requests}} for the token cooperative', async () => {
    agentService.waiting.mockResolvedValue([{ id: ID, status: 'new' }])
    const res = await listRequests(new Request('http://x/api'), undefined)
    expect(await res.json()).toEqual({ data: { requests: [{ id: ID, status: 'new' }] } })
    expect(agentService.waiting).toHaveBeenCalledWith('TC')
  })

  it('pass the spec body itself, and answer APP_ID_TAKEN as a 409 with that code', async () => {
    agentService.proposeSpec.mockRejectedValue(new AppBuildError('APP_ID_TAKEN', 'Mã app này đã có người dùng.'))
    const res = await postSpec(post({ app_id: 'gen-x' }), ctx)
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('APP_ID_TAKEN')
    expect(agentService.proposeSpec).toHaveBeenCalledWith('TC', ID, { app_id: 'gen-x' })
  })

  it('answer announce with the proposal id, and null for an announced request', async () => {
    agentService.announce.mockResolvedValueOnce('p1').mockResolvedValueOnce(null)
    expect(await (await postAnnounce(post({}), ctx)).json()).toEqual({ data: { proposal_id: 'p1' } })
    expect(await (await postAnnounce(post({}), ctx)).json()).toEqual({ data: { proposal_id: null } })
  })

  it('send questions and the route body through, and refuse an id that is not a uuid', async () => {
    agentService.route.mockResolvedValue('p2')
    await postQuestions(post({ questions: ['a'] }), ctx)
    expect(agentService.askQuestions).toHaveBeenCalledWith('TC', ID, ['a'])
    expect(await (await postRoute(post({ path: 'store' }), ctx)).json()).toEqual({ data: { proposal_id: 'p2' } })
    expect((await postSpec(post({}), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(400)
  })
})

describe('the manager routes', () => {
  it('refuse a request without a session, and a farmer', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await createRequest(post({ request_text: 'cần app kho phân bón' }))).status).toBe(401)
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u', name: 'N' } })
    ;(requireTenant as jest.Mock).mockResolvedValue({ role: 'farmer', htxCode: 'TC', userId: 'u' })
    expect((await createRequest(post({ request_text: 'cần app kho phân bón' }))).status).toBe(403)
    expect(intake.create).not.toHaveBeenCalled()
  })

  it('create a request for the session cooperative (never the body one) and answer 409 when one is open', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u', name: 'Quản lý' } })
    ;(requireTenant as jest.Mock).mockResolvedValue({ role: 'manager', htxCode: 'TC', userId: 'u' })
    intake.create.mockResolvedValueOnce({ id: ID, status: 'new' })
    const res = await createRequest(post({ request_text: 'cần app kho phân bón', htx_code: 'LB' }))
    expect(res.status).toBe(201)
    expect(intake.create).toHaveBeenCalledWith({ htxCode: 'TC', userId: 'u', userName: 'Quản lý' }, 'cần app kho phân bón')
    intake.create.mockRejectedValueOnce(new AppBuildError('REQUEST_ACTIVE', 'HTX đang có một yêu cầu xây app chưa xong.'))
    const again = await createRequest(post({ request_text: 'cần app kho phân bón' }))
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe('REQUEST_ACTIVE')
  })

  it('serve a build file with its type to the manager, and 404 for an unknown name or a missing build', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u' } })
    ;(requireTenant as jest.Mock).mockResolvedValue({ role: 'manager', htxCode: 'TC', userId: 'u' })
    buildRepo.latestBuild.mockResolvedValue({ id: 'b1' })
    buildRepo.buildFile.mockResolvedValue({ contentType: 'image/png', bytes: new Uint8Array([1, 2]) })
    const ok = await getFile(new Request('http://x'), { params: Promise.resolve({ id: ID, name: 'mobile-dark.png' }) })
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(buildRepo.buildFile).toHaveBeenCalledWith('TC', 'b1', 'mobile-dark.png')
    expect((await getFile(new Request('http://x'), { params: Promise.resolve({ id: ID, name: '../etc' }) })).status).toBe(404)
  })
})

describe('the relay media route', () => {
  const url = (q: string) => new Request(`http://x/api/internal/telegram/media?${q}`)

  it('serves one of the four screenshots', async () => {
    buildRepo.screenshotOfBuild.mockResolvedValue({ contentType: 'image/png', bytes: new Uint8Array([9]) })
    const res = await getMedia(url(`build=${ID}&name=desktop-light.png`))
    expect(res.status).toBe(200)
    expect(buildRepo.screenshotOfBuild).toHaveBeenCalledWith(ID, 'desktop-light.png')
  })

  it('refuses the review and the spec files, and a bad build id', async () => {
    expect((await getMedia(url(`build=${ID}&name=review.md`))).status).toBe(400)
    expect((await getMedia(url('build=x&name=desktop-light.png'))).status).toBe(400)
  })

  it('answers 404 when the build has no such photo', async () => {
    buildRepo.screenshotOfBuild.mockResolvedValue(null)
    expect((await getMedia(url(`build=${ID}&name=desktop-light.png`))).status).toBe(404)
  })
})
