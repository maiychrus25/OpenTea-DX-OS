// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { MOCK_OFFICER_METRICS, MOCK_TASK_SCHEDULE } from '@/components/features/officer-dashboard/mock-data'

describe('Officer Dashboard Mock Data', () => {
  it('should have exactly 4 metrics with correct values', () => {
    expect(MOCK_OFFICER_METRICS).toHaveLength(4)
    expect(MOCK_OFFICER_METRICS[0].value).toBe('05')
    expect(MOCK_OFFICER_METRICS[1].value).toBe('12')
    expect(MOCK_OFFICER_METRICS[2].value).toBe('04')
    expect(MOCK_OFFICER_METRICS[3].value).toBe('14/18')
  })

  it('should have correct tones for metrics', () => {
    expect(MOCK_OFFICER_METRICS[0].tone).toBe('amber')
    expect(MOCK_OFFICER_METRICS[1].tone).toBe('amber')
    expect(MOCK_OFFICER_METRICS[2].tone).toBe('blue')
    expect(MOCK_OFFICER_METRICS[3].tone).toBe('green')
  })

  it('should have exactly 3 tasks in schedule', () => {
    expect(MOCK_TASK_SCHEDULE).toHaveLength(3)
  })

  it('should have correct fields in tasks', () => {
    MOCK_TASK_SCHEDULE.forEach(task => {
      expect(task).toHaveProperty('time')
      expect(task).toHaveProperty('task')
      expect(task).toHaveProperty('target')
      expect(task).toHaveProperty('status')
      expect(task).toHaveProperty('tone')
    })
  })
})
