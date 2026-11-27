/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Lesson 6 (M5): the internal campaign routes run from the agent with no browser session. Sessions and core tokens
// throw here, so the routes only pass if they read and write through the repositories with explicit scope.
import { GET as candidates } from '@/app/api/internal/agent/campaigns/candidates/route'
import { POST as createCampaign } from '@/app/api/internal/agent/campaigns/route'
import { auth } from '@/auth'
import { getCoreToken } from '@/lib/auth/core-token'
import { requireAgentCaller } from '@/lib/api/internal-agent-auth'

const PROPOSAL_ID = '11111111-1111-4111-8111-111111111111'
const RUN_ID = '0b3c5d7e-1f2a-4b5c-8d9e-0f1a2b3c4d5e'

jest.mock('@/auth', () => ({
  auth: jest.fn(() => {
    throw new Error('the internal route must not read a session')
  }),
}))
jest.mock('@/lib/auth/core-token', () => ({
  getCoreToken: jest.fn(async () => {
    throw new Error('the internal route must not fetch a core token')
  }),
}))
jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn() }))
jest.mock('@/application/telegram/telegram-services', () => ({ notifyCampaignCreated: jest.fn(async () => undefined) }))
jest.mock('@/infrastructure/db/agent/PrismaAgentRunRepository', () => ({
  PrismaAgentRunRepository: jest.fn().mockImplementation(() => ({ existsForHtx: async () => true })),
}))
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({
  PrismaProposalRepository: jest.fn().mockImplementation(() => ({
    findById: async () => ({ id: PROPOSAL_ID, htxCode: 'TC', kind: 'notification.internal', status: 'proposed', payload: {} }),
    list: async () => [],
  })),
}))
jest.mock('@/infrastructure/db/agent/PrismaStrategyPlanRepository', () => ({
  PrismaStrategyPlanRepository: jest.fn().mockImplementation(() => ({ adoptedFor: async () => null })),
}))
jest.mock('@/infrastructure/db/agent/PrismaCampaignRepository', () => ({
  PrismaCampaignRepository: jest.fn().mockImplementation(() => ({
    create: async () => ({ id: 'camp-1', created: true }),
  })),
}))
jest.mock('@/infrastructure/db/agent/PrismaCampaignCandidateSource', () => ({
  PrismaCampaignCandidateSource: jest.fn().mockImplementation(() => ({
    rainParcelCodes: async () => [],
    withdrawalRows: async () => [],
    parcelCodesByIds: async () => new Map(),
    parcelCodesOfEntries: async () => new Map(),
    estimatedKgByParcelIds: async () => new Map(),
    staffPresent: async () => null,
  })),
}))

describe('internal campaign routes need no browser session (lesson 6)', () => {
  beforeEach(() => {
    ;(requireAgentCaller as jest.Mock).mockResolvedValue({ htxCode: 'TC' })
  })

  test('candidates answers without touching auth or the core token', async () => {
    const res = await candidates(new Request('http://localhost/api/internal/agent/campaigns/candidates?day=2026-11-27'), {} as never)
    expect(res.status).toBe(200)
    expect(auth).not.toHaveBeenCalled()
    expect(getCoreToken).not.toHaveBeenCalled()
  })

  test('creation stores the campaign without touching auth or the core token', async () => {
    const body = {
      day: '2026-11-27',
      items: [{ proposal_id: PROPOSAL_ID, position: 1 }],
      dropped: [],
      summary_vi: 'Tóm tắt.',
      run_id: RUN_ID,
    }
    const res = await createCampaign(
      new Request('http://localhost/api/internal/agent/campaigns', { method: 'POST', body: JSON.stringify(body) }),
      {} as never
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'camp-1' })
    expect(auth).not.toHaveBeenCalled()
    expect(getCoreToken).not.toHaveBeenCalled()
  })
})
