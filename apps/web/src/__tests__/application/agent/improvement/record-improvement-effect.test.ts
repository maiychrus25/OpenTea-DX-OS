/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { RecordImprovementEffectUseCase, improvementEffectSchema } from '@/application/agent/improvement/RecordImprovementEffectUseCase'

const NOW = new Date('2026-12-14T00:00:00Z')

describe('POST /api/internal/agent/improvements/{id}/effect (contract C5)', () => {
  it('stores the measurement and passes the cooperative, the improvement and the time through', async () => {
    const recordEffect = jest.fn().mockResolvedValue('ok')
    const result = await new RecordImprovementEffectUseCase({ recordEffect }).execute('TC', 'imp-1', { after: '2w', value: 0.4, verdict: 'helped' }, NOW)
    expect(result).toBe('ok')
    expect(recordEffect).toHaveBeenCalledWith('TC', 'imp-1', '2w', { value: 0.4, verdict: 'helped', at: NOW })
  })

  it('answers not_found for another cooperative and conflict when the state refuses it', async () => {
    const recordEffect = jest.fn().mockResolvedValueOnce('not_found').mockResolvedValueOnce('conflict')
    const useCase = new RecordImprovementEffectUseCase({ recordEffect })
    expect(await useCase.execute('HX', 'imp-1', { after: '4w', value: 0.1, verdict: 'no_effect' }, NOW)).toBe('not_found')
    expect(await useCase.execute('TC', 'imp-1', { after: '4w', value: 0.1, verdict: 'no_effect' }, NOW)).toBe('conflict')
  })

  it('the body is exactly after, value and verdict', () => {
    expect(improvementEffectSchema.safeParse({ after: '2w', value: 0.5, verdict: 'drop' }).success).toBe(true)
    expect(improvementEffectSchema.safeParse({ after: '1w', value: 0.5, verdict: 'drop' }).success).toBe(false)
    expect(improvementEffectSchema.safeParse({ after: '2w', value: 0.5, verdict: 'great' }).success).toBe(false)
    expect(improvementEffectSchema.safeParse({ after: '2w', value: 0.5, verdict: 'drop', status: 'measured' }).success).toBe(false)
  })
})
