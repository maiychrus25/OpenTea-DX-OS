/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { computeMetrics, type ImprovementStats } from '@/application/agent/improvement/improvement-metrics'

const stats: ImprovementStats = {
  proposalStats: [
    { agent: 'field-watch', kind: 'notification.internal', template: 'sensor_silent', approved: 1, rejected: 6, expired: 0, medianWaitHours: 3.5 },
    { agent: 'disease-watch', kind: 'disease.inspection', template: null, approved: 0, rejected: 0, expired: 2, medianWaitHours: null },
  ],
  journalReview: { reviewed: 30, returnedMissingInfo: 14 },
  campaignGoals: [{ goalKey: 'harvest', days: 10, missedDays: 4 }],
  medianWaitHours: 26,
}

describe('computeMetrics (contract C4 formulas)', () => {
  it('reject_rate is rejected over decided, for a template key', () => {
    expect(computeMetrics(['reject_rate:field-watch:sensor_silent'], stats)).toEqual({
      'reject_rate:field-watch:sensor_silent': 6 / 7,
    })
  })

  it('reject_rate of a kind without a template uses the kind', () => {
    expect(computeMetrics(['reject_rate:disease-watch:disease.inspection'], stats)).toEqual({})
  })

  it('journal_missing_info_rate is returned over reviewed', () => {
    expect(computeMetrics(['journal_missing_info_rate'], stats)).toEqual({ journal_missing_info_rate: 14 / 30 })
  })

  it('median_wait_hours and missed_days are counts or hours', () => {
    expect(computeMetrics(['median_wait_hours', 'missed_days:harvest'], stats)).toEqual({
      median_wait_hours: 26,
      'missed_days:harvest': 4,
    })
  })

  it('a key with no data gets no value, so no measurement', () => {
    expect(computeMetrics(['missed_days:unknown', 'reject_rate:x:y', 'journal_missing_info_rate'], {
      ...stats,
      journalReview: { reviewed: 0, returnedMissingInfo: 0 },
    })).toEqual({})
  })
})
