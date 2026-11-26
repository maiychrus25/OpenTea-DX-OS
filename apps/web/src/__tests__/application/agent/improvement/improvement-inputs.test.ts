/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ImprovementInputsUseCase } from '@/application/agent/improvement/ImprovementInputsUseCase'
import type { Improvement } from '@/domain/agent/ports/ImprovementRepository'

const NOW = new Date('2026-11-30T05:00:00Z') // 12:00 on Monday 30 November in Vietnam

function improvement(overrides: Partial<Improvement> = {}): Improvement {
  return {
    id: 'imp-1',
    htxCode: 'TC',
    week: '2026-11-23',
    kind: 'setting',
    metricKey: 'reject_rate:field-watch:sensor_silent',
    titleVi: 'Nới ngưỡng',
    rationaleVi: 'r',
    baseline: 0.85,
    evidence: {},
    proposalId: 'prop-1',
    status: 'adopted',
    decidedBy: 'mgr-1',
    adoptedAt: new Date('2026-11-24T02:00:00Z'),
    effect: {},
    template: null,
    createdAt: new Date('2026-11-23T23:30:00Z'),
    ...overrides,
  }
}

function useCase(overrides: { settings?: Record<string, unknown>; improvements?: Improvement[] } = {}) {
  const deps = {
    improvements: { listSince: jest.fn().mockResolvedValue(overrides.improvements ?? [improvement()]) },
    stats: {
      proposalStats: jest.fn().mockResolvedValue([
        { agent: 'field-watch', kind: 'notification.internal', template: 'sensor_silent', approved: 1, rejected: 6, expired: 0, medianWaitHours: 3.5 },
      ]),
      overallMedianWaitHours: jest.fn().mockResolvedValue(3.5),
      journalReview: jest.fn().mockResolvedValue({ reviewed: 30, returnedMissingInfo: 14 }),
      campaignGoals: jest.fn().mockResolvedValue([{ goalKey: 'harvest', days: 10, missedDays: 4 }]),
    },
    settings: {
      findForEvidence: jest.fn(async (_htx: string, agent: string) =>
        agent === 'field-watch' ? { thresholds: { silent_hours: 6 }, schedule: null } : null
      ),
    },
  }
  return { deps, uc: new ImprovementInputsUseCase(deps) }
}

describe('GET /api/internal/agent/improvements/inputs (contract C3)', () => {
  it('reads every figure for the cooperative over the windows of the contract', async () => {
    const { deps, uc } = useCase()
    const inputs = await uc.execute('TC', '2026-11-30', NOW)
    expect(deps.stats.proposalStats).toHaveBeenCalledWith('TC', new Date(NOW.getTime() - 28 * 86_400_000))
    expect(deps.stats.campaignGoals).toHaveBeenCalledWith('TC', '2026-11-16')
    expect(deps.improvements.listSince).toHaveBeenCalledWith('TC', '2026-10-05')
    expect(inputs.week).toBe('2026-11-30')
    expect(inputs.proposal_stats).toEqual([
      { agent: 'field-watch', kind: 'notification.internal', template: 'sensor_silent', window_days: 28, approved: 1, rejected: 6, expired: 0, median_wait_hours: 3.5 },
    ])
    expect(inputs.journal_review).toEqual({ window_days: 28, reviewed: 30, returned_missing_info: 14 })
    expect(inputs.campaign_goals).toEqual([{ goal_key: 'harvest', days: 10, missed_days: 4 }])
  })

  it('lists settings only for agents that have a row, with their thresholds and schedule', async () => {
    const { uc } = useCase()
    const inputs = await uc.execute('TC', '2026-11-30', NOW)
    expect(inputs.settings).toEqual({ 'field-watch': { thresholds: { silent_hours: 6 }, schedule: null } })
  })

  it('maps improvements in snake case and answers the metric value of each key', async () => {
    const { uc } = useCase()
    const inputs = await uc.execute('TC', '2026-11-30', NOW)
    expect(inputs.improvements).toEqual([
      {
        id: 'imp-1',
        kind: 'setting',
        metric_key: 'reject_rate:field-watch:sensor_silent',
        status: 'adopted',
        baseline: 0.85,
        adopted_at: '2026-11-24T02:00:00.000Z',
        effect: {},
      },
    ])
    expect(inputs.metrics).toEqual({ 'reject_rate:field-watch:sensor_silent': 6 / 7 })
  })
})
