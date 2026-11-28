/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET, PUT } from '@/app/api/agent/settings/cross-check/route'
import { GET as getInternalSettings } from '@/app/api/internal/agent/settings/route'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { requireTenant } from '@/lib/api/tenant'

const findMock = jest.fn()
const upsertMock = jest.fn()
const loadMock = jest.fn()

jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn() }))
jest.mock('@/application/agent/agent-budget', () => ({
  readMonthlyBudget: jest.fn(async () => ({ month: '2026-11', limit: null, spent: 0, level: 'none' })),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn().mockImplementation(() => ({
    findForEvidence: findMock,
    upsertThresholds: upsertMock,
    load: loadMock,
    availableProviders: jest.fn(async () => ['ollama']),
  })),
}))

const DEFAULTS = { grace_days: 10, fresh_norm_kg_per_ha_flush: 1800, norm_tolerance: 1.35, realert_extra: 0.2 }
const tenant = (role: string) => (requireTenant as jest.Mock).mockResolvedValue({ userId: 'u1', role, htxCode: 'TC', htxProfileId: 'p1' })
const put = (body: unknown) =>
  PUT(new Request('http://web/api/agent/settings/cross-check', { method: 'PUT', body: JSON.stringify(body) }), {})

beforeEach(() => {
  jest.clearAllMocks()
  findMock.mockResolvedValue(null)
  upsertMock.mockResolvedValue(undefined)
})

describe('GET /api/agent/settings/cross-check', () => {
  test.each(['manager', 'officer'])('serves %s the defaults when nothing is stored', async (role) => {
    tenant(role)
    const response = await GET(new Request('http://web/api/agent/settings/cross-check'), {})
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual({ thresholds: DEFAULTS, can_edit: role === 'manager' })
  })

  test('fills the stored values over the defaults and ignores unknown keys', async () => {
    tenant('manager')
    findMock.mockResolvedValue({ thresholds: { grace_days: 14, norm_tolerance: 1.5, stray: 1 }, schedule: null })
    const response = await GET(new Request('http://web/api/agent/settings/cross-check'), {})
    expect((await response.json()).data.thresholds).toEqual({ ...DEFAULTS, grace_days: 14, norm_tolerance: 1.5 })
  })

  test('a farmer gets 403', async () => {
    tenant('farmer')
    expect((await GET(new Request('http://web/api/agent/settings/cross-check'), {})).status).toBe(403)
  })
})

describe('PUT /api/agent/settings/cross-check', () => {
  test('saves the given thresholds for the manager, under the manager as the actor', async () => {
    tenant('manager')
    findMock.mockResolvedValue({ thresholds: { grace_days: 14, norm_tolerance: 1.4 }, schedule: null }) // as read back after the save
    const response = await put({ grace_days: 14, norm_tolerance: 1.4 })
    expect(response.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith('TC', 'cross-check', { grace_days: 14, norm_tolerance: 1.4 }, 'user:u1')
    expect((await response.json()).data.thresholds).toEqual({ ...DEFAULTS, grace_days: 14, norm_tolerance: 1.4 })
  })

  test.each(['officer', 'farmer', 'accountant'])('%s gets 403 and nothing is saved', async (role) => {
    tenant(role)
    expect((await put({ grace_days: 14 })).status).toBe(403)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  test.each([
    ['grace_days', 3], ['grace_days', 30],
    ['fresh_norm_kg_per_ha_flush', 300], ['fresh_norm_kg_per_ha_flush', 6000],
    ['norm_tolerance', 1], ['norm_tolerance', 3], ['norm_tolerance', 1.35],
    ['realert_extra', 0.05], ['realert_extra', 1], ['realert_extra', 0.25],
  ])('accepts %s = %s', async (key, value) => {
    tenant('manager')
    expect((await put({ [key]: value })).status).toBe(200)
  })

  test.each([
    ['grace_days', 2], ['grace_days', 31], ['grace_days', 10.5],
    ['fresh_norm_kg_per_ha_flush', 299], ['fresh_norm_kg_per_ha_flush', 6001], ['fresh_norm_kg_per_ha_flush', 1800.5],
    ['norm_tolerance', 0.99], ['norm_tolerance', 3.01], ['norm_tolerance', 1.355],
    ['realert_extra', 0.04], ['realert_extra', 1.01], ['realert_extra', 0.205],
    ['grace_days', '10'],
  ])('rejects %s = %s with 400', async (key, value) => {
    tenant('manager')
    expect((await put({ [key]: value })).status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  test.each([['an empty body', {}], ['an unknown key', { grace_days: 10, provider: 'openai' }]])('rejects %s with 400', async (_name, body) => {
    tenant('manager')
    expect((await put(body)).status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe('the agent reads the thresholds with its settings', () => {
  test('cross-check appears under agents when the cooperative saved some', async () => {
    ;(requireAgentCaller as jest.Mock).mockResolvedValue({ htxCode: 'TC' })
    loadMock.mockResolvedValue({ agents: {}, monthlyLimit: null, crossCheckThresholds: { grace_days: 14 } })
    const response = await getInternalSettings(new Request('http://web/api/internal/agent/settings'), {})
    expect((await response.json()).data.agents['cross-check']).toEqual({
      enabled: true, provider: 'ollama', model: null, thresholds: { grace_days: 14 },
    })
  })
})
