/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { strategyPlanValues } from '@/application/agent/actions/strategy-evidence'
import { CreateStrategyPlanUseCase, createStrategyPlanSchema } from '@/application/agent/strategy/CreateStrategyPlanUseCase'
import { StrategyInputsUseCase } from '@/application/agent/strategy/StrategyInputsUseCase'
import { ValidationError } from '@/domain/errors'
import type { Figures, StrategyPlan } from '@/domain/agent/strategy'

const PLAN_ID = '00000000-0000-4000-8000-0000000000b1'
const lastYear: Figures = { yield_kg: 1000, journal_on_time_rate: 80, diseased_parcel_rate: 10, shop_revenue_vnd: null }

function body(overrides: Record<string, unknown> = {}) {
  return {
    season: '2026-Q4',
    goals: [{ key: 'yield_kg', target: 1050 }],
    priorities: ['Tăng Sản lượng'],
    initiatives: [{ kind: 'training', title_vi: 'Tập huấn thu hái' }],
    run_id: null,
    ...overrides,
  }
}

function build(opts: { insert?: { id: string } | null; runOwned?: boolean } = {}) {
  let stored: StrategyPlan | null = null
  const plans = {
    insertDraftIfNone: jest.fn(async (input) => {
      if (opts.insert === null) return null
      stored = {
        id: PLAN_ID, htxCode: input.htxCode, season: input.season, goals: input.goals, priorities: input.priorities,
        initiatives: input.initiatives, warnings: input.warnings, status: 'draft', proposalId: null, adoptedBy: null,
        adoptedAt: null, runId: input.runId, createdAt: new Date(),
      }
      return { id: PLAN_ID }
    }),
    remove: jest.fn(async () => undefined),
    linkProposal: jest.fn(async () => undefined),
    findById: jest.fn(async () => stored),
  }
  const proposals = { create: jest.fn(async () => ({ id: 'prop-1' })), createdSince: jest.fn(async () => false) }
  const loaders = { strategy_plans: jest.fn(async () => (stored ? strategyPlanValues(stored) : null)) }
  const figures = jest.fn(async () => lastYear)
  const runOwned = jest.fn(async () => opts.runOwned ?? true)
  const uc = new CreateStrategyPlanUseCase({ plans, proposals, loaders, figures, runOwned } as never)
  return { uc, plans, proposals, figures }
}

describe('CreateStrategyPlanUseCase (contract C3)', () => {
  it('stores a draft with the baseline from last year, proposes strategy.adopt and links it', async () => {
    const { uc, plans, proposals, figures } = build()
    const result = await uc.execute('TC', createStrategyPlanSchema.parse(body()))
    expect(result).toEqual({ existing: false, id: PLAN_ID, proposalId: 'prop-1' })
    expect(figures).toHaveBeenCalledWith('TC', '2025-Q4')
    expect(plans.insertDraftIfNone).toHaveBeenCalledWith(
      expect.objectContaining({
        htxCode: 'TC',
        season: '2026-Q4',
        goals: [{ key: 'yield_kg', label_vi: 'Sản lượng', unit_vi: 'kg', baseline: 1000, target: 1050, direction: 'up' }],
        warnings: [],
      })
    )
    const created = (proposals.create.mock.calls[0] as unknown[])[0] as Record<string, any>
    expect(created).toMatchObject({ agent: 'strategy', kind: 'strategy.adopt', payload: { plan_id: PLAN_ID }, origin: 'agent' })
    expect(created.evidence.rows).toEqual([expect.objectContaining({ table: 'strategy_plans', id: PLAN_ID })])
    expect(plans.linkProposal).toHaveBeenCalledWith('TC', PLAN_ID, 'prop-1')
  })

  it('a target below last year carries the warning (W-2)', async () => {
    const { uc, plans } = build()
    await uc.execute('TC', createStrategyPlanSchema.parse(body({ goals: [{ key: 'yield_kg', target: 900 }, { key: 'diseased_parcel_rate', target: 12 }] })))
    expect(plans.insertDraftIfNone).toHaveBeenCalledWith(
      expect.objectContaining({
        warnings: ['Mục tiêu Sản lượng thấp hơn cùng kỳ năm trước', 'Mục tiêu Thửa có bệnh thấp hơn cùng kỳ năm trước'],
      })
    )
  })

  it('answers existing when the season already has a draft and proposes nothing (W-3)', async () => {
    const { uc, proposals } = build({ insert: null })
    expect(await uc.execute('TC', createStrategyPlanSchema.parse(body()))).toEqual({ existing: true })
    expect(proposals.create).not.toHaveBeenCalled()
  })

  it('refuses a goal with no figure for last year: missing data is not a target', async () => {
    const { uc, plans } = build()
    await expect(uc.execute('TC', createStrategyPlanSchema.parse(body({ goals: [{ key: 'shop_revenue_vnd', target: 100 }] })))).rejects.toThrow(ValidationError)
    expect(plans.insertDraftIfNone).not.toHaveBeenCalled()
  })

  it('a plan without goals is allowed: no data, only priorities and initiatives (A-2)', async () => {
    const { uc } = build()
    expect(await uc.execute('TC', createStrategyPlanSchema.parse(body({ goals: [] })))).toMatchObject({ existing: false })
  })

  it('removes the draft again when the proposal cannot be made', async () => {
    const { uc, plans, proposals } = build()
    proposals.create.mockRejectedValueOnce(new ValidationError('INVALID_EVIDENCE'))
    await expect(uc.execute('TC', createStrategyPlanSchema.parse(body()))).rejects.toThrow(ValidationError)
    expect(plans.remove).toHaveBeenCalledWith('TC', PLAN_ID)
    expect(plans.linkProposal).not.toHaveBeenCalled()
  })

  it('refuses a run that is not the cooperative’s', async () => {
    const { uc, plans } = build({ runOwned: false })
    await expect(
      uc.execute('TC', createStrategyPlanSchema.parse(body({ run_id: '00000000-0000-4000-8000-0000000000c1' })))
    ).rejects.toThrow(ValidationError)
    expect(plans.insertDraftIfNone).not.toHaveBeenCalled()
  })
})

describe('createStrategyPlanSchema limits', () => {
  it.each([
    ['a season that is not a quarter', { season: '2026-Q5' }],
    ['six priorities', { priorities: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['a priority over 160 characters', { priorities: ['x'.repeat(161)] }],
    ['six initiatives', { initiatives: Array.from({ length: 6 }, () => ({ kind: 'training', title_vi: 'x' })) }],
    ['an unknown initiative kind', { initiatives: [{ kind: 'loan', title_vi: 'x' }] }],
    ['an unknown goal key', { goals: [{ key: 'profit', target: 1 }] }],
    ['the same goal twice', { goals: [{ key: 'yield_kg', target: 1 }, { key: 'yield_kg', target: 2 }] }],
    ['a negative target', { goals: [{ key: 'yield_kg', target: -1 }] }],
  ])('refuses %s', (_name, over) => {
    expect(createStrategyPlanSchema.safeParse(body(over)).success).toBe(false)
  })
})

describe('StrategyInputsUseCase (contract C3)', () => {
  it('answers the three figure sets, the adopted plan and whether a draft exists', async () => {
    const figures = jest.fn(async (_htx: string, season: string) => ({ ...lastYear, yield_kg: Number(season.slice(0, 4)) }))
    const plans = {
      adoptedFor: jest.fn(async () => ({ id: PLAN_ID, season: '2026-Q4' })),
      draftExists: jest.fn(async () => true),
    }
    const inputs = await new StrategyInputsUseCase({ plans, figures } as never).execute('TC', '2026-Q1')
    expect(figures.mock.calls.map((c) => c[1])).toEqual(['2026-Q1', '2025-Q1', '2025-Q4'])
    expect(inputs).toEqual({
      season: '2026-Q1',
      current: { ...lastYear, yield_kg: 2026 },
      last_year: { ...lastYear, yield_kg: 2025 },
      previous: { ...lastYear, yield_kg: 2025 },
      adopted: { id: PLAN_ID, season: '2026-Q4' },
      draft_exists: true,
    })
  })

  it('answers adopted null when the season has no adopted plan', async () => {
    const plans = { adoptedFor: jest.fn(async () => null), draftExists: jest.fn(async () => false) }
    const inputs = await new StrategyInputsUseCase({ plans, figures: jest.fn(async () => lastYear) } as never).execute('TC', '2026-Q4')
    expect(inputs.adopted).toBeNull()
    expect(inputs.draft_exists).toBe(false)
  })
})
