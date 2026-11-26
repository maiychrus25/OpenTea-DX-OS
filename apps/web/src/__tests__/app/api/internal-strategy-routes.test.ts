/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { GET as getInputs } from '@/app/api/internal/agent/strategy/inputs/route'
import { POST as postPlan } from '@/app/api/internal/agent/strategy/plans/route'

const PLAN_ID = '00000000-0000-4000-8000-0000000000b1'
const planRow = {
  id: PLAN_ID, htxCode: 'TC', season: '2026-Q4', goals: [], priorities: [], initiatives: [], warnings: [], status: 'draft',
  proposalId: null, adoptedBy: null, adoptedAt: null, runId: null, createdAt: new Date(),
}
const plans = {
  insertDraftIfNone: jest.fn(),
  remove: jest.fn(),
  linkProposal: jest.fn(),
  findById: jest.fn(),
  adoptedFor: jest.fn(),
  draftExists: jest.fn(),
}
const proposals = { create: jest.fn(), createdSince: jest.fn() }
const figures = { yield_kg: 1000, journal_on_time_rate: null, diseased_parcel_rate: null, shop_revenue_vnd: null }

jest.mock('@/lib/api/internal-agent-auth', () => ({ requireAgentCaller: jest.fn(async () => ({ htxCode: 'TC' })) }))
jest.mock('@/infrastructure/db/agent/PrismaStrategyPlanRepository', () => ({
  PrismaStrategyPlanRepository: jest.fn().mockImplementation(() => plans),
}))
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({
  PrismaProposalRepository: jest.fn().mockImplementation(() => proposals),
}))
jest.mock('@/infrastructure/db/agent/PrismaAutopilotRepository', () => ({
  PrismaAutopilotRepository: jest.fn().mockImplementation(() => ({ get: jest.fn(async () => ({ enabled: false, unlockedKinds: [] })) })),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentRunRepository', () => ({
  PrismaAgentRunRepository: jest.fn().mockImplementation(() => ({ existsForHtx: jest.fn(async () => true) })),
}))
jest.mock('@/application/agent/strategy/season-figures', () => ({ seasonFigures: jest.fn(async () => figures) }))
jest.mock('@/application/telegram/telegram-services', () => ({ notifyProposalCreated: jest.fn(async () => undefined) }))
jest.mock('@/application/agent/actions/journal-evidence', () => ({
  EVIDENCE_LOADERS: { strategy_plans: jest.fn(async () => ({ id: 'x' })) },
  isEvidenceStale: jest.fn(),
}))
jest.mock('@/application/agent/actions/strategy-evidence', () => ({ strategyPlanValues: jest.fn(() => ({ id: 'x' })) }))

function post(body: unknown) {
  return new Request('http://localhost/api/internal/agent/strategy/plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const valid = { season: '2026-Q4', goals: [{ key: 'yield_kg', target: 1050 }], priorities: ['Tăng Sản lượng'], initiatives: [], run_id: null }

describe('POST /api/internal/agent/strategy/plans', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    plans.insertDraftIfNone.mockResolvedValue({ id: PLAN_ID })
    plans.findById.mockResolvedValue(planRow)
    proposals.create.mockResolvedValue({ id: 'prop-1' })
    proposals.createdSince.mockResolvedValue(false)
  })

  it('answers 201 with the plan id and its proposal id, under data', async () => {
    const res = await postPlan(post(valid), {} as never)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: PLAN_ID, proposal_id: 'prop-1' } })
  })

  it('answers 200 existing when the season already has a draft', async () => {
    plans.insertDraftIfNone.mockResolvedValueOnce(null)
    const res = await postPlan(post(valid), {} as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { existing: true } })
  })

  it('answers 400 for a season that is not a quarter and stores nothing', async () => {
    const res = await postPlan(post({ ...valid, season: '2026-Q9' }), {} as never)
    expect(res.status).toBe(400)
    expect(plans.insertDraftIfNone).not.toHaveBeenCalled()
  })
})

describe('GET /api/internal/agent/strategy/inputs', () => {
  it('answers the figures of the season under data', async () => {
    plans.adoptedFor.mockResolvedValue(null)
    plans.draftExists.mockResolvedValue(false)
    const res = await getInputs(new Request('http://localhost/api/internal/agent/strategy/inputs?season=2026-Q4'), {} as never)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({
      season: '2026-Q4', current: figures, last_year: figures, previous: figures, adopted: null, draft_exists: false,
    })
  })

  it('answers 400 without a quarter', async () => {
    const res = await getInputs(new Request('http://localhost/api/internal/agent/strategy/inputs'), {} as never)
    expect(res.status).toBe(400)
  })
})
