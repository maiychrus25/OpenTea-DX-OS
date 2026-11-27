/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { GET, PUT } from '@/app/api/platform/htx/[code]/agent-settings/route'

const loadMock = jest.fn()
const availableMock = jest.fn()
const saveMock = jest.fn()
const readBudgetMock = jest.fn()
const findByCode = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/db/farm/PrismaHtxProfileRepository', () => ({
  PrismaHtxProfileRepository: jest.fn(() => ({ findByCode: (c: string) => findByCode(c) })),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn(() => ({ load: loadMock, availableProviders: availableMock, save: saveMock })),
}))
jest.mock('@/application/agent/agent-budget', () => ({ readMonthlyBudget: (...a: unknown[]) => readBudgetMock(...a) }))

const signIn = (role: string | null) =>
  (auth as jest.Mock).mockResolvedValue(role && { user: { id: 'pa-1', role, roles: [role], htxCode: role === 'manager' ? 'TC' : null } })
const ctx = (code = 'TC') => ({ params: { code } })
const get = (code?: string) => GET(new Request('http://web/x'), ctx(code))
const put = (body: unknown, code?: string) => PUT(new Request('http://web/x', { method: 'PUT', body: JSON.stringify(body) }), ctx(code))

const choice = { provider: 'ollama', model: null }
const validSave = {
  agents: {
    'journal-review': { provider: 'anthropic', model: null }, digest: choice, bulletin: choice, assistant: choice,
    'daily-campaign': choice, improvement: choice, 'app-builder': choice, strategy: choice,
  },
  report_time: '07:30',
  monthly_limit_usd: 10,
}

beforeEach(() => {
  jest.clearAllMocks()
  signIn('platform_admin')
  findByCode.mockImplementation(async (code: string) => (code === 'TC' || code === 'LB' ? { id: `htx-${code}`, name: code } : null))
  loadMock.mockResolvedValue({ agents: {}, monthlyLimit: 10 })
  availableMock.mockResolvedValue(['ollama', 'anthropic'])
  readBudgetMock.mockResolvedValue({ month: '2026-11', limit: 10, spent: 1, level: 'none' })
})

describe('platform agent settings of one cooperative', () => {
  test('GET reads the settings of the cooperative in the path, editable', async () => {
    const response = await get('LB')
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(loadMock).toHaveBeenCalledWith('LB')
    expect(body.data.can_edit).toBe(true)
    expect(body.data.providers).toEqual(['ollama', 'anthropic'])
  })

  test('PUT saves for the cooperative in the path, audited as the platform admin', async () => {
    const response = await put(validSave, 'LB')
    expect(response.status).toBe(200)
    expect(saveMock).toHaveBeenCalledWith('LB', expect.objectContaining({ actor: 'user:pa-1', reportTime: '07:30', monthlyLimit: 10, agents: validSave.agents }))
  })

  test('an unknown cooperative answers 404', async () => {
    expect((await get('ZZ')).status).toBe(404)
    expect((await put(validSave, 'ZZ')).status).toBe(404)
    expect(saveMock).not.toHaveBeenCalled()
  })

  test('every other role is refused, even a manager of that cooperative', async () => {
    for (const role of ['manager', 'officer', 'farmer', 'accountant']) {
      signIn(role)
      expect((await get()).status).toBe(403)
      expect((await put(validSave)).status).toBe(403)
    }
    expect(saveMock).not.toHaveBeenCalled()
    expect(loadMock).not.toHaveBeenCalled()
  })

  test('a provider whose key the agent did not report, a bad time and a bad budget are refused', async () => {
    const openai = { ...validSave, agents: { ...validSave.agents, digest: { provider: 'openai', model: 'gpt-x' } } }
    const refused = await put(openai)
    expect(refused.status).toBe(400)
    expect((await refused.json()).error.message).toBe('Nhà cung cấp này chưa được bật trên máy chủ')
    expect((await put({ ...validSave, report_time: '25:00' })).status).toBe(400)
    expect((await put({ ...validSave, monthly_limit_usd: 0 })).status).toBe(400)
    expect(saveMock).not.toHaveBeenCalled()
  })

  test('saving never turns an agent on or off', async () => {
    const withEnabled = { ...validSave, agents: { ...validSave.agents, digest: { enabled: true, provider: 'ollama', model: null } } }
    expect((await put(withEnabled)).status).toBe(200)
    expect(saveMock.mock.calls[0][1].agents.digest).toEqual({ provider: 'ollama', model: null })
  })
})
