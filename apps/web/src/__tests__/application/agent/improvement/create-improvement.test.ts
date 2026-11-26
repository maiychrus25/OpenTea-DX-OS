/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateImprovementUseCase, createImprovementSchema } from '@/application/agent/improvement/CreateImprovementUseCase'
import { ValidationError } from '@/domain/errors'

const settingsValues = { thresholds: { silent_hours: 6 }, schedule: null }

function body(overrides: Record<string, unknown> = {}) {
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

function build(overrides: { insert?: { id: string } | null; createdSince?: boolean; proposalId?: string | null; runOwned?: boolean; settings?: unknown } = {}) {
  const improvements = {
    insertIfNew: jest.fn().mockResolvedValue(overrides.insert === undefined ? { id: '00000000-0000-4000-8000-0000000000a1' } : overrides.insert),
    remove: jest.fn().mockResolvedValue(undefined),
    linkProposal: jest.fn().mockResolvedValue(undefined),
  }
  const proposals = {
    create: jest.fn(async () => (overrides.proposalId === null ? null : { id: overrides.proposalId ?? 'prop-1' })),
    createdSince: jest.fn().mockResolvedValue(overrides.createdSince ?? false),
  }
  const loaders = {
    agent_settings: jest.fn(async () => (overrides.settings === undefined ? settingsValues : overrides.settings)),
    improvements: jest.fn(async () => ({ id: '00000000-0000-4000-8000-0000000000a1', kind: 'process', title_vi: 'Quy trình', rationale_vi: 'r', metric_key: 'm', template: null })),
  }
  const runOwned = jest.fn().mockResolvedValue(overrides.runOwned ?? true)
  const uc = new CreateImprovementUseCase({ improvements, proposals, loaders, runOwned } as never)
  return { uc, improvements, proposals, loaders, runOwned }
}

describe('POST /api/internal/agent/improvements (contract C5)', () => {
  it('a settings change stores the improvement and proposes agent.settings.update, linked to it', async () => {
    const { uc, improvements, proposals } = build()
    const result = await uc.execute('TC', createImprovementSchema.parse(body()))
    expect(result).toEqual({ deduped: false, id: '00000000-0000-4000-8000-0000000000a1', proposalId: 'prop-1' })
    expect(improvements.insertIfNew).toHaveBeenCalledWith(expect.objectContaining({ htxCode: 'TC', week: '2026-11-30', kind: 'setting' }))
    const created = proposals.create.mock.calls[0][0]
    expect(created).toMatchObject({
      htxCode: 'TC',
      agent: 'improvement',
      kind: 'agent.settings.update',
      payload: { agent: 'field-watch', thresholds: { silent_hours: 8 } },
      origin: 'agent',
    })
    expect(created.evidence.rows).toEqual([expect.objectContaining({ table: 'agent_settings', id: 'TC:field-watch' })])
    expect(improvements.linkProposal).toHaveBeenCalledWith('TC', '00000000-0000-4000-8000-0000000000a1', 'prop-1')
  })

  it('a process note proposes improvement.adopt for its own id', async () => {
    const { uc, proposals } = build()
    await uc.execute('TC', createImprovementSchema.parse(body({ kind: 'process', settings_change: null, template: null, metric_key: 'journal_missing_info_rate' })))
    expect(proposals.create.mock.calls[0][0]).toMatchObject({ kind: 'improvement.adopt', payload: { improvement_id: '00000000-0000-4000-8000-0000000000a1' } })
  })

  it('a repeat of the metric this week is deduped and proposes nothing', async () => {
    const { uc, proposals } = build({ insert: null })
    expect(await uc.execute('TC', createImprovementSchema.parse(body()))).toEqual({ deduped: true })
    expect(proposals.create).not.toHaveBeenCalled()
  })

  it('a settings value outside C2 is refused and the stored improvement is removed', async () => {
    const { uc, improvements } = build()
    await expect(uc.execute('TC', createImprovementSchema.parse(body({ settings_change: { agent: 'field-watch', thresholds: { silent_hours: 60 } } })))).rejects.toThrow(ValidationError)
    expect(improvements.remove).toHaveBeenCalledWith('TC', '00000000-0000-4000-8000-0000000000a1')
    expect(improvements.linkProposal).not.toHaveBeenCalled()
  })

  it('a proposal refused by the repeat window is deduped and its improvement is removed', async () => {
    const { uc, improvements } = build({ createdSince: true })
    expect(await uc.execute('TC', createImprovementSchema.parse(body()))).toEqual({ deduped: true })
    expect(improvements.remove).toHaveBeenCalledWith('TC', '00000000-0000-4000-8000-0000000000a1')
  })

  it('a settings change for an agent with no row is refused', async () => {
    const { uc, improvements } = build({ settings: null })
    await expect(uc.execute('TC', createImprovementSchema.parse(body()))).rejects.toThrow(ValidationError)
    expect(improvements.remove).toHaveBeenCalledWith('TC', '00000000-0000-4000-8000-0000000000a1')
  })

  it('a run that is not this cooperative is refused before anything is stored', async () => {
    const { uc, improvements, runOwned } = build({ runOwned: false })
    const runId = '00000000-0000-4000-8000-0000000000aa'
    await expect(uc.execute('TC', createImprovementSchema.parse(body({ run_id: runId })))).rejects.toThrow(ValidationError)
    expect(runOwned).toHaveBeenCalledWith('TC', runId)
    expect(improvements.insertIfNew).not.toHaveBeenCalled()
  })
})

describe('createImprovementSchema', () => {
  it.each([
    ['a week that is not a Monday', { week: '2026-12-01' }],
    ['a kind outside the three', { kind: 'budget' }],
    ['a weekday outside 1..7 in a template', { kind: 'template', settings_change: null, template: { weekday: 8, goal_key: 'harvest', title_vi: 'Nhắc' } }],
    ['a title longer than 120 characters', { title_vi: 'x'.repeat(121) }],
    ['a rationale longer than 600 characters', { rationale_vi: 'x'.repeat(601) }],
  ])('rejects %s', (_label, change) => {
    expect(createImprovementSchema.safeParse(body(change)).success).toBe(false)
  })

  it('accepts a template improvement', () => {
    const parsed = createImprovementSchema.safeParse(body({ kind: 'template', settings_change: null, template: { weekday: 1, goal_key: 'harvest', title_vi: 'Nhắc thu hoạch' } }))
    expect(parsed.success).toBe(true)
  })
})

describe('shape by kind', () => {
  it('a setting needs settings_change and no template; a template needs template only', async () => {
    const { uc } = build()
    await expect(uc.execute('TC', createImprovementSchema.parse(body({ settings_change: null })))).rejects.toThrow(ValidationError)
    await expect(uc.execute('TC', createImprovementSchema.parse(body({ kind: 'template', settings_change: null, template: null })))).rejects.toThrow(ValidationError)
  })
})
