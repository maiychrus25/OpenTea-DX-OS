/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { POST as postImprovement } from '@/app/api/internal/agent/improvements/route'
import { GET as getInputs } from '@/app/api/internal/agent/improvements/inputs/route'
import { POST as postEffect } from '@/app/api/internal/agent/improvements/[id]/effect/route'

const IMPROVEMENT_ID = '00000000-0000-4000-8000-0000000000a1'
const repo = {
  insertIfNew: jest.fn(),
  remove: jest.fn(),
  linkProposal: jest.fn(),
  findById: jest.fn(),
  listSince: jest.fn(),
  recordEffect: jest.fn(),
}
const proposals = { create: jest.fn(), createdSince: jest.fn() }
const statsReader = {
  proposalStats: jest.fn(),
  overallMedianWaitHours: jest.fn(),
  journalReview: jest.fn(),
  campaignGoals: jest.fn(),
}
const settingsRepo = { findForEvidence: jest.fn() }

jest.mock('@/lib/api/internal-agent-auth', () => ({
  requireAgentCaller: jest.fn(async () => ({ htxCode: 'TC' })),
}))
jest.mock('@/infrastructure/db/agent/PrismaImprovementRepository', () => ({
  PrismaImprovementRepository: jest.fn().mockImplementation(() => mockRepo()),
}))
jest.mock('@/infrastructure/db/agent/PrismaImprovementStatsReader', () => ({
  PrismaImprovementStatsReader: jest.fn().mockImplementation(() => mockStats()),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentSettingsRepository', () => ({
  PrismaAgentSettingsRepository: jest.fn().mockImplementation(() => mockSettings()),
}))
jest.mock('@/infrastructure/db/agent/PrismaStrategyPlanRepository', () => ({
  PrismaStrategyPlanRepository: jest.fn().mockImplementation(() => ({ adoptedFor: async () => null })),
}))
jest.mock('@/infrastructure/db/agent/PrismaProposalRepository', () => ({
  PrismaProposalRepository: jest.fn().mockImplementation(() => mockProposals()),
}))
jest.mock('@/infrastructure/db/agent/PrismaAgentRunRepository', () => ({
  PrismaAgentRunRepository: jest.fn().mockImplementation(() => ({ existsForHtx: jest.fn(async () => true) })),
}))
jest.mock('@/application/telegram/telegram-services', () => ({
  notifyProposalCreated: jest.fn(async () => undefined),
}))

// The factories above run before the variables are initialised, so they read them through these accessors.
function mockRepo() {
  return repo
}
function mockStats() {
  return statsReader
}
function mockSettings() {
  return settingsRepo
}
function mockProposals() {
  return proposals
}

function settingsBody(overrides: Record<string, unknown> = {}) {
  return {
    week: '2026-11-30',
    kind: 'setting',
    metric_key: 'reject_rate:field-watch:sensor_silent',
    title_vi: 'Nới ngưỡng cảm biến im lặng lên 8 giờ',
    rationale_vi: 'Số liệu.',
    baseline: 0.85,
    evidence: { window_days: 28 },
    settings_change: { agent: 'field-watch', thresholds: { silent_hours: 8 } },
    ...overrides,
  }
}

function postJson(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('POST /api/internal/agent/improvements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    settingsRepo.findForEvidence.mockResolvedValue({ thresholds: { silent_hours: 6 }, schedule: null })
    repo.insertIfNew.mockResolvedValue({ id: IMPROVEMENT_ID })
    proposals.createdSince.mockResolvedValue(false)
    proposals.create.mockResolvedValue({ id: 'prop-1' })
  })

  it('answers 201 with the improvement id and its proposal id, under data', async () => {
    const res = await postImprovement(postJson('http://localhost/api/internal/agent/improvements', settingsBody()), {} as never)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: IMPROVEMENT_ID, proposal_id: 'prop-1' } })
  })

  it('answers 200 deduped for a repeat of the week and metric', async () => {
    repo.insertIfNew.mockResolvedValueOnce(null)
    const res = await postImprovement(postJson('http://localhost/api/internal/agent/improvements', settingsBody()), {} as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { deduped: true } })
  })

  it('answers 400 for a threshold outside C2 and removes the stored row', async () => {
    const res = await postImprovement(
      postJson('http://localhost/api/internal/agent/improvements', settingsBody({ settings_change: { agent: 'field-watch', thresholds: { silent_hours: 60 } } })),
      {} as never
    )
    expect(res.status).toBe(400)
    expect(repo.remove).toHaveBeenCalledWith('TC', IMPROVEMENT_ID)
  })

  it('answers 400 for a week that is not a Monday', async () => {
    const res = await postImprovement(postJson('http://localhost/api/internal/agent/improvements', settingsBody({ week: '2026-12-01' })), {} as never)
    expect(res.status).toBe(400)
    expect(repo.insertIfNew).not.toHaveBeenCalled()
  })
})

describe('GET /api/internal/agent/improvements/inputs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    statsReader.proposalStats.mockResolvedValue([])
    statsReader.overallMedianWaitHours.mockResolvedValue(null)
    statsReader.journalReview.mockResolvedValue({ reviewed: 0, returnedMissingInfo: 0 })
    statsReader.campaignGoals.mockResolvedValue([])
    repo.listSince.mockResolvedValue([])
    settingsRepo.findForEvidence.mockResolvedValue(null)
  })

  it('answers the figures for the week under data', async () => {
    const res = await getInputs(new Request('http://localhost/api/internal/agent/improvements/inputs?week=2026-11-30'), {} as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.week).toBe('2026-11-30')
    expect(body.data.journal_review).toEqual({ window_days: 28, reviewed: 0, returned_missing_info: 0 })
    expect(statsReader.proposalStats).toHaveBeenCalledWith('TC', expect.any(Date))
  })

  it('answers 400 without a Monday week', async () => {
    const res = await getInputs(new Request('http://localhost/api/internal/agent/improvements/inputs'), {} as never)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/internal/agent/improvements/{id}/effect', () => {
  const context = (id: string) => ({ params: Promise.resolve({ id }) })
  const body = { after: '2w', value: 0.4, verdict: 'helped' }

  beforeEach(() => jest.clearAllMocks())

  it('answers 200 when the measurement is stored', async () => {
    repo.recordEffect.mockResolvedValueOnce('ok')
    const res = await postEffect(postJson(`http://localhost/api/internal/agent/improvements/${IMPROVEMENT_ID}/effect`, body), context(IMPROVEMENT_ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { id: IMPROVEMENT_ID, after: '2w' } })
  })

  it('answers 404 for another cooperative or an unknown id', async () => {
    repo.recordEffect.mockResolvedValueOnce('not_found')
    const res = await postEffect(postJson('http://localhost/x', body), context(IMPROVEMENT_ID))
    expect(res.status).toBe(404)
  })

  it('answers 409 when the improvement is not adopted or the period is already measured', async () => {
    repo.recordEffect.mockResolvedValueOnce('conflict')
    const res = await postEffect(postJson('http://localhost/x', body), context(IMPROVEMENT_ID))
    expect(res.status).toBe(409)
  })

  it('answers 400 for an id that is not a uuid', async () => {
    const res = await postEffect(postJson('http://localhost/x', body), context('not-a-uuid'))
    expect(res.status).toBe(400)
  })
})
