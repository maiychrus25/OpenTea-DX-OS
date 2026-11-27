/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { seasonProgress, seasonReportLines } from '@/application/agent/strategy/season-progress'
import { CampaignCandidatesUseCase } from '@/application/agent/campaign/CampaignCandidatesUseCase'
import { ImprovementInputsUseCase } from '@/application/agent/improvement/ImprovementInputsUseCase'
import type { Figures, StrategyPlan } from '@/domain/agent/strategy'

const plan: StrategyPlan = {
  id: 'plan-1',
  htxCode: 'TC',
  season: '2026-Q4',
  goals: [
    { key: 'yield_kg', label_vi: 'Sản lượng', unit_vi: 'kg', baseline: 1000, target: 1050, direction: 'up' },
    { key: 'diseased_parcel_rate', label_vi: 'Thửa có bệnh', unit_vi: '%', baseline: 10, target: 9, direction: 'down' },
    { key: 'journal_on_time_rate', label_vi: 'Nhật ký đúng hạn', unit_vi: '%', baseline: 80, target: 84, direction: 'up' },
    { key: 'shop_revenue_vnd', label_vi: 'Doanh thu cửa hàng', unit_vi: 'đồng', baseline: 5_000_000, target: 5_250_000, direction: 'up' },
  ],
  priorities: [],
  initiatives: [],
  warnings: [],
  status: 'adopted',
  proposalId: null,
  adoptedBy: 'mgr-1',
  adoptedAt: new Date('2026-10-02T00:00:00Z'),
  runId: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
}
const current: Figures = { yield_kg: 200, journal_on_time_rate: 70, diseased_parcel_rate: null, shop_revenue_vnd: 1_000_000 }
// 8 Nov 2026 12:00 in Vietnam: 38 of the quarter's 92 days have passed (5 whole weeks).
const NOW = new Date('2026-11-08T05:00:00Z')

describe('seasonProgress (contract C6)', () => {
  it('pro-rates what adds up over the quarter and keeps a rate target whole', () => {
    const progress = seasonProgress(plan, current, NOW)
    expect(progress).toHaveLength(4)
    const yieldKg = progress.find((p) => p.key === 'yield_kg')!
    expect(yieldKg).toMatchObject({ target: 1050, baseline: 1000, current: 200, weeks_elapsed: 5, label_vi: 'Sản lượng', direction: 'up' })
    expect(yieldKg.pro_rated_target).toBeCloseTo(1050 * (38.5 / 92), 0)
    expect(progress.find((p) => p.key === 'journal_on_time_rate')).toMatchObject({ target: 84, pro_rated_target: 84, current: 70 })
    expect(progress.find((p) => p.key === 'diseased_parcel_rate')).toMatchObject({ current: null, pro_rated_target: 9 })
  })

  it('has nothing for no plan', () => {
    expect(seasonProgress(null, current, NOW)).toEqual([])
  })
})

describe('seasonReportLines (contract C6)', () => {
  it('shows the current figure against last year, at most three, without the target', () => {
    const lines = seasonReportLines(plan, { ...current, diseased_parcel_rate: 8 })
    expect(lines).toEqual([
      'Sản lượng: 200 (cùng kỳ năm trước: 1000)',
      'Thửa có bệnh: 8 (cùng kỳ năm trước: 10)',
      'Nhật ký đúng hạn: 70 (cùng kỳ năm trước: 80)',
    ])
    expect(lines.join('\n')).not.toMatch(/1050|\b9\b|84/)
  })

  it('leaves out a goal with no figure yet and has nothing for no plan', () => {
    expect(seasonReportLines(plan, current).join('\n')).not.toContain('Thửa có bệnh')
    expect(seasonReportLines(null, current)).toEqual([])
  })
})

describe('A9 candidates carry the adopted plan (contract C6)', () => {
  const useCase = (adopted: StrategyPlan | null) =>
    new CampaignCandidatesUseCase(
      { list: jest.fn().mockResolvedValue([]) },
      {
        rainParcelCodes: jest.fn().mockResolvedValue([]),
        withdrawalRows: jest.fn().mockResolvedValue([]),
        parcelCodesByIds: jest.fn().mockResolvedValue(new Map()),
        parcelCodesOfEntries: jest.fn().mockResolvedValue(new Map()),
      estimatedKgByParcelIds: jest.fn().mockResolvedValue(new Map()), staffPresent: jest.fn().mockResolvedValue(null),
      },
      { adoptedFor: jest.fn().mockResolvedValue(adopted) }
    )

  it('maps the plan goals to campaign goal keys, leaving out the shop', async () => {
    const result = await useCase(plan).execute('TC', '2026-11-27', NOW)
    expect(result.season_goal_keys).toEqual(['harvest', 'inspection', 'journal_backlog'])
  })

  it('is empty with no adopted plan', async () => {
    expect((await useCase(null).execute('TC', '2026-11-27', NOW)).season_goal_keys).toEqual([])
  })

  it('reads the plan of the day’s own quarter', async () => {
    const adoptedFor = jest.fn().mockResolvedValue(null)
    const uc = new CampaignCandidatesUseCase({ list: jest.fn().mockResolvedValue([]) }, {
      rainParcelCodes: jest.fn().mockResolvedValue([]), withdrawalRows: jest.fn().mockResolvedValue([]),
      parcelCodesByIds: jest.fn().mockResolvedValue(new Map()), parcelCodesOfEntries: jest.fn().mockResolvedValue(new Map()),
      estimatedKgByParcelIds: jest.fn().mockResolvedValue(new Map()), staffPresent: jest.fn().mockResolvedValue(null),
    }, { adoptedFor })
    await uc.execute('TC', '2027-01-02', NOW)
    expect(adoptedFor).toHaveBeenCalledWith('TC', '2027-Q1')
  })
})

describe('A10 inputs carry the season progress (contract C6)', () => {
  it('adds season_progress for the adopted plan of the current quarter', async () => {
    const uc = new ImprovementInputsUseCase({
      improvements: { listSince: jest.fn().mockResolvedValue([]) },
      stats: {
        proposalStats: jest.fn().mockResolvedValue([]), overallMedianWaitHours: jest.fn().mockResolvedValue(null),
        journalReview: jest.fn().mockResolvedValue({ reviewed: 0, returnedMissingInfo: 0 }), campaignGoals: jest.fn().mockResolvedValue([]),
      },
      settings: { findForEvidence: jest.fn().mockResolvedValue(null) },
      strategy: { plans: { adoptedFor: jest.fn().mockResolvedValue(plan) }, figures: jest.fn().mockResolvedValue(current) },
    })
    const inputs = await uc.execute('TC', '2026-11-09', NOW)
    expect(inputs.season_progress.map((p) => p.key)).toEqual(['yield_kg', 'diseased_parcel_rate', 'journal_on_time_rate', 'shop_revenue_vnd'])
  })

  it('measures a season_goal improvement by the goal’s current figure', async () => {
    const uc = new ImprovementInputsUseCase({
      improvements: { listSince: jest.fn().mockResolvedValue([{ id: 'i', kind: 'process', metricKey: 'season_goal:yield_kg', status: 'adopted', baseline: 100, adoptedAt: null, effect: {} }]) },
      stats: {
        proposalStats: jest.fn().mockResolvedValue([]), overallMedianWaitHours: jest.fn().mockResolvedValue(null),
        journalReview: jest.fn().mockResolvedValue({ reviewed: 0, returnedMissingInfo: 0 }), campaignGoals: jest.fn().mockResolvedValue([]),
      },
      settings: { findForEvidence: jest.fn().mockResolvedValue(null) },
      strategy: { plans: { adoptedFor: jest.fn().mockResolvedValue(plan) }, figures: jest.fn().mockResolvedValue(current) },
    })
    expect((await uc.execute('TC', '2026-11-09', NOW)).metrics['season_goal:yield_kg']).toBe(200)
  })

  it('is an empty list when no strategy source is wired or no plan is adopted', async () => {
    const base = {
      improvements: { listSince: jest.fn().mockResolvedValue([]) },
      stats: {
        proposalStats: jest.fn().mockResolvedValue([]), overallMedianWaitHours: jest.fn().mockResolvedValue(null),
        journalReview: jest.fn().mockResolvedValue({ reviewed: 0, returnedMissingInfo: 0 }), campaignGoals: jest.fn().mockResolvedValue([]),
      },
      settings: { findForEvidence: jest.fn().mockResolvedValue(null) },
    }
    expect((await new ImprovementInputsUseCase(base).execute('TC', '2026-11-09', NOW)).season_progress).toEqual([])
    const none = { plans: { adoptedFor: jest.fn().mockResolvedValue(null) }, figures: jest.fn() }
    expect((await new ImprovementInputsUseCase({ ...base, strategy: none }).execute('TC', '2026-11-09', NOW)).season_progress).toEqual([])
    expect(none.figures).not.toHaveBeenCalled()
  })
})
