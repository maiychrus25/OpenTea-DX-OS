/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET as getStatus } from '@/app/api/agent/autopilot/route'
import { POST as postEnable } from '@/app/api/agent/autopilot/enable/route'
import { POST as postStop } from '@/app/api/agent/autopilot/stop/route'
import { AutopilotService } from '@/application/agent/autopilot/AutopilotService'
import { disabledConfig } from '@/domain/agent/autopilot'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import { ForbiddenError } from '@/domain/errors'
import { requireTenant } from '@/lib/api/tenant'
import { auth } from '@/auth'

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/application/agent/autopilot/manager-activity', () => ({ touchManagerActivity: jest.fn(async () => undefined) }))

const repo = {
  get: jest.fn(async () => disabledConfig('TC')),
  matchRates: jest.fn(async () => []),
  dayCounts: jest.fn(async () => ({ autoRuns: 0, blocked: 0, failuresLastHour: 0 })),
  countPending: jest.fn(async () => 0),
  enable: jest.fn(async () => undefined),
  stop: jest.fn(async () => ({ returned: 2 })),
}
const notifier = { enabled: jest.fn(async () => undefined), stopped: jest.fn(async () => undefined) }
jest.mock('@/application/telegram/telegram-services', () => ({ autopilotService: () => mockService() }))
function mockService() {
  return new AutopilotService({ autopilot: repo as unknown as AutopilotRepository, notifier })
}

const manager = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'p' }
const officer = { ...manager, userId: 'off-1', role: 'officer' }
const nowSeconds = () => Math.floor(Date.now() / 1000)
const post = (path: string, body?: unknown) =>
  new Request(`http://web/api/agent/autopilot${path}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const validBody = { unlocked_kinds: [], daily_cap: 30, acknowledged: true }

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireTenant as jest.Mock).mockResolvedValue(manager)
  ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Lan' }, authTime: nowSeconds() - 30 })
})

describe('GET /api/agent/autopilot', () => {
  test('a manager and an officer read the status; a farmer is refused', async () => {
    const res = await getStatus(new Request('http://web/api/agent/autopilot'), undefined)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toMatchObject({ enabled: false, can_enable: true, today: { ran: 0 } })
    ;(requireTenant as jest.Mock).mockResolvedValueOnce(officer)
    expect((await (await getStatus(new Request('http://web/api/agent/autopilot'), undefined)).json()).data.can_enable).toBe(false)
    ;(requireTenant as jest.Mock).mockResolvedValueOnce({ ...manager, role: 'farmer' })
    expect((await getStatus(new Request('http://web/api/agent/autopilot'), undefined)).status).toBe(403)
  })
})

describe('POST /api/agent/autopilot/enable', () => {
  test('a manager with a fresh sign-in turns it on', async () => {
    const res = await postEnable(post('/enable', validBody), undefined)
    expect(res.status).toBe(200)
    expect(repo.enable).toHaveBeenCalledWith('TC', expect.objectContaining({ userId: 'mgr-1', userName: 'Lan', dailyCap: 30 }))
  })

  test('an old sign-in answers 401 REAUTH_REQUIRED and writes nothing', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Lan' }, authTime: nowSeconds() - 600 })
    const res = await postEnable(post('/enable', validBody), undefined)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('REAUTH_REQUIRED')
    expect(repo.enable).not.toHaveBeenCalled()
  })

  test('a session with no auth_time answers 401 REAUTH_REQUIRED', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { name: 'Lan' } })
    expect((await postEnable(post('/enable', validBody), undefined)).status).toBe(401)
  })

  test('an officer cannot turn it on', async () => {
    ;(requireTenant as jest.Mock).mockResolvedValueOnce(officer)
    expect((await postEnable(post('/enable', validBody), undefined)).status).toBe(403)
    expect(repo.enable).not.toHaveBeenCalled()
  })

  test.each([
    ['not acknowledged', { ...validBody, acknowledged: false }],
    ['a kind that is not unlockable', { ...validBody, unlocked_kinds: ['journal.reject'] }],
    ['harvest.approve, which is human-only', { ...validBody, unlocked_kinds: ['harvest.approve'] }],
    ['journal.approve, which is human-only', { ...validBody, unlocked_kinds: ['journal.approve'] }],
    ['a cap over 50', { ...validBody, daily_cap: 51 }],
    ['a missing body', undefined],
  ])('%s answers 400', async (_name, body) => {
    const res = await postEnable(post('/enable', body), undefined)
    expect(res.status).toBe(400)
    expect(repo.enable).not.toHaveBeenCalled()
  })
})

describe('POST /api/agent/autopilot/stop', () => {
  test('a manager and an officer stop it', async () => {
    expect((await postStop(post('/stop'), undefined)).status).toBe(200)
    ;(requireTenant as jest.Mock).mockResolvedValueOnce(officer)
    const res = await postStop(post('/stop'), undefined)
    expect((await res.json()).data).toMatchObject({ returned: 2, was_on: true })
    expect(repo.stop).toHaveBeenLastCalledWith('TC', 'manual', 'off-1')
  })

  test('a farmer cannot', async () => {
    ;(requireTenant as jest.Mock).mockRejectedValueOnce(new ForbiddenError('Forbidden'))
    expect((await postStop(post('/stop'), undefined)).status).toBe(403)
  })
})
