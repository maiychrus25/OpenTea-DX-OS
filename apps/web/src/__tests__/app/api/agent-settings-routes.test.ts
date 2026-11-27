/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET as getInternalSettings } from '@/app/api/internal/agent/settings/route'
import { GET as getSettings } from '@/app/api/agent/settings/route'
import { PATCH as patchRun } from '@/app/api/internal/agent/runs/[id]/route'
import { POST as postHeartbeat } from '@/app/api/internal/agent/heartbeat/route'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'
import { requireTenant } from '@/lib/api/tenant'

const loadMock = jest.fn()
const availableMock = jest.fn()
const finishMock = jest.fn()
const spentMock = jest.fn()
const readBudgetMock = jest.fn()
const alertMock = jest.fn()
const touchHeartbeatMock = jest.fn()

jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({ requireTenant: jest.fn() }))
jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn().mockImplementation(() => ({
    load: loadMock,
    availableProviders: availableMock,
    save: jest.fn(),
  })),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentRunRepository', () => ({
  PrismaAgentRunRepository: jest.fn().mockImplementation(() => ({
    finish: finishMock,
    spentBetween: spentMock,
  })),
}))
jest.mock('@/application/agent/agent-budget', () => ({
  readMonthlyBudget: (...args: unknown[]) => readBudgetMock(...args),
  alertBudgetThresholds: (...args: unknown[]) => alertMock(...args),
}))
jest.mock('@/application/telegram/telegram-services', () => ({
  telegramRepository: () => ({ touchHeartbeat: touchHeartbeatMock }),
}))

// The route handlers take a Next.js context argument, which these routes do not use.
const getInternalCall = (req: Request) => getInternalSettings(req, {})
const heartbeatCall = (req: Request) => postHeartbeat(req, {})
const getSettingsCall = () => getSettings(new Request('http://web/api/agent/settings'), {})

const RUN_UUID = '00000000-0000-0000-0000-000000000010'

const savedSettings = {
  'journal-review': { enabled: true, provider: 'anthropic', model: 'claude-haiku-5-5', schedule: null, thresholds: {} },
  digest: { enabled: false, provider: 'ollama', model: null, schedule: '07:30', thresholds: {} },
  bulletin: { enabled: false, provider: 'ollama', model: null, schedule: null, thresholds: {} },
  assistant: { enabled: false, provider: 'ollama', model: null, schedule: null, thresholds: {} },
  'daily-campaign': { enabled: false, provider: 'ollama', model: null, schedule: null, thresholds: {} },
  improvement: { enabled: false, provider: 'ollama', model: null, schedule: null, thresholds: {} },
  'app-builder': { enabled: false, provider: 'ollama', model: null, schedule: null, thresholds: {} },
  strategy: { enabled: false, provider: 'ollama', model: null, schedule: null, thresholds: {} },
}

function tenant(role: 'manager' | 'officer' | 'farmer', htxCode = 'TC') {
  return { userId: 'u-1', role, htxCode, htxProfileId: 'p-1' }
}

describe('Agent settings routes (C1, C2, C3 and the manager tab)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(requireAgentCaller as jest.Mock).mockResolvedValue({ sub: 'sa-tc', azp: 'dxos-agent-tc', htxCode: 'TC', roles: ['agent'] })
    loadMock.mockResolvedValue({ agents: savedSettings, monthlyLimit: 10 })
    availableMock.mockResolvedValue(['ollama', 'anthropic'])
    readBudgetMock.mockResolvedValue({ month: '2026-11', limit: 10, spent: 8.5, level: 'warn' })
    finishMock.mockResolvedValue(true)
    touchHeartbeatMock.mockResolvedValue(undefined)
  })

  test('C1: the agent gets its providers, the report time and the budget, with defaults for unset agents', async () => {
    loadMock.mockResolvedValueOnce({ agents: { 'journal-review': savedSettings['journal-review'] }, monthlyLimit: null })
    readBudgetMock.mockResolvedValueOnce({ month: '2026-11', limit: null, spent: 0, level: 'none' })

    const res = await getInternalCall(new Request('http://web/api/internal/agent/settings'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.agents['journal-review']).toEqual({ enabled: true, provider: 'anthropic', model: 'claude-haiku-5-5', thresholds: {} })
    expect(body.data.agents.digest).toEqual({ enabled: false, provider: 'ollama', model: null, thresholds: {} })
    expect(body.data.report_time).toBe('18:00')
    expect(body.data.budget).toEqual({ monthly_limit_usd: null, spent_usd: 0, month: '2026-11', exhausted: false })
  })

  test('C1: the report time comes from the digest row, and exhausted is reported', async () => {
    readBudgetMock.mockResolvedValueOnce({ month: '2026-11', limit: 10, spent: 10, level: 'exhausted' })
    const body = await (await getInternalCall(new Request('http://web/api/internal/agent/settings'))).json()
    expect(body.data.report_time).toBe('07:30')
    expect(body.data.budget.exhausted).toBe(true)
    expect(loadMock).toHaveBeenCalledWith('TC')
  })

  test('C2: the run finish carries provider, model and external calls, and triggers the budget check when it cost money', async () => {
    const res = await patchRun(
      new Request(`http://web/api/internal/agent/runs/${RUN_UUID}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'ok', provider: 'anthropic', model: 'claude-haiku-5-5', tokens_in: 900, tokens_out: 120,
          cost_estimate_usd: 0.0021, external_calls: 1,
        }),
      }),
      { params: { id: RUN_UUID } }
    )

    expect(res.status).toBe(200)
    expect(finishMock).toHaveBeenCalledWith('TC', RUN_UUID, expect.objectContaining({
      provider: 'anthropic', model: 'claude-haiku-5-5', tokensIn: 900, tokensOut: 120,
      costEstimate: 0.0021, externalCalls: 1,
    }))
    expect(alertMock).toHaveBeenCalledWith('TC')
  })

  test('C2: a run with no cost does not check the budget, and the legacy cost_estimate field still counts', async () => {
    await patchRun(
      new Request(`http://web/api/internal/agent/runs/${RUN_UUID}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'ok', cost_estimate: 0 }),
      }),
      { params: { id: RUN_UUID } }
    )
    expect(alertMock).not.toHaveBeenCalled()

    await patchRun(
      new Request(`http://web/api/internal/agent/runs/${RUN_UUID}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'ok', cost_estimate: 0.5 }),
      }),
      { params: { id: RUN_UUID } }
    )
    expect(finishMock).toHaveBeenLastCalledWith('TC', RUN_UUID, expect.objectContaining({ costEstimate: 0.5 }))
    expect(alertMock).toHaveBeenCalledTimes(1)
  })

  test('C3: the heartbeat stores the providers the agent container holds', async () => {
    const res = await heartbeatCall(new Request('http://web/api/internal/agent/heartbeat', {
      method: 'POST', body: JSON.stringify({ version: '0.3.0', providers: ['ollama', 'anthropic'] }),
    }))
    expect(res.status).toBe(200)
    expect(touchHeartbeatMock).toHaveBeenCalledWith('agent:TC', '0.3.0', { providers: ['ollama', 'anthropic'] })
  })

  test('C3: a heartbeat with an unknown provider is refused', async () => {
    const res = await heartbeatCall(new Request('http://web/api/internal/agent/heartbeat', {
      method: 'POST', body: JSON.stringify({ providers: ['gemini'] }),
    }))
    expect(res.status).toBe(400)
    expect(touchHeartbeatMock).not.toHaveBeenCalled()
  })

  test('tab: a manager reads the settings with the providers listed, read-only (the platform admin edits; S2)', async () => {
    ;(requireTenant as jest.Mock).mockResolvedValue(tenant('manager'))
    const res = await getSettingsCall()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.providers).toEqual(['ollama', 'anthropic'])
    expect(body.data.can_edit).toBe(false)
    expect(body.data.budget.spent_usd).toBe(8.5)
  })

  test('tab: an officer reads the settings read-only, and a farmer cannot read them', async () => {
    ;(requireTenant as jest.Mock).mockResolvedValue(tenant('officer'))
    const officer = await (await getSettingsCall()).json()
    expect(officer.data.can_edit).toBe(false)

    ;(requireTenant as jest.Mock).mockResolvedValue(tenant('farmer'))
    expect((await getSettingsCall()).status).toBe(403)
  })
})
