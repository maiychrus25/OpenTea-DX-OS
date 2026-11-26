/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ACTION_CATALOG } from '@/application/agent/action-catalog'
import { strategyAdoptAction } from '@/application/agent/actions/strategy-adopt.action'
import { strategyPlanValues } from '@/application/agent/actions/strategy-evidence'
import { autoEligibility, windowFor } from '@/application/agent/autopilot/eligibility'
import { canonicalJson, evidenceDigest, sha256Hex } from '@/domain/agent/evidence'
import type { EvidenceRow } from '@/domain/agent/proposal'
import type { StrategyPlan } from '@/domain/agent/strategy'
import type { Tenant } from '@/lib/api/tenant'

const mockAdopt = jest.fn()
jest.mock('@/infrastructure/db/agent/PrismaStrategyPlanRepository', () => ({
  PrismaStrategyPlanRepository: jest.fn().mockImplementation(() => ({ adopt: (...a: unknown[]) => mockAdopt(...a) })),
}))

beforeEach(() => jest.clearAllMocks())

const manager: Tenant = { userId: 'mgr-1', role: 'manager', htxCode: 'TC', htxProfileId: 'htx-tc' }
const PLAN_ID = '00000000-0000-4000-8000-0000000000b1'

function plan(over: Partial<StrategyPlan> = {}): StrategyPlan {
  return {
    id: PLAN_ID,
    htxCode: 'TC',
    season: '2026-Q4',
    goals: [
      { key: 'yield_kg', label_vi: 'Sản lượng', unit_vi: 'kg', baseline: 1000, target: 1050, direction: 'up' },
      { key: 'diseased_parcel_rate', label_vi: 'Thửa có bệnh', unit_vi: '%', baseline: 10, target: 9, direction: 'down' },
    ],
    priorities: ['Tăng Sản lượng', 'Giảm Thửa có bệnh', 'Tập huấn', 'Không hiện'],
    initiatives: [],
    warnings: [],
    status: 'draft',
    proposalId: null,
    adoptedBy: null,
    adoptedAt: null,
    runId: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...over,
  }
}

function evidenceOf(p: StrategyPlan) {
  const values = strategyPlanValues(p)
  const row: EvidenceRow = { table: 'strategy_plans', id: p.id, sha256: sha256Hex(canonicalJson(values)), values }
  return { rows: [row], sha256: evidenceDigest([row]) }
}

describe('strategy.adopt', () => {
  it('is an unlockable, medium-risk, manager-approved action with a 48 hour window', () => {
    expect(ACTION_CATALOG['strategy.adopt']).toBe(strategyAdoptAction)
    expect(strategyAdoptAction).toMatchObject({
      titleVi: 'Áp dụng kế hoạch mùa vụ',
      risk: 'medium',
      approverRoles: ['manager'],
      origins: ['agent'],
      autonomy: 'unlockable',
      subjectTable: 'strategy_plans',
    })
    expect(windowFor(strategyAdoptAction)).toBe(48 * 3_600_000)
  })

  it('payload is exactly the plan id', () => {
    expect(strategyAdoptAction.payloadSchema.safeParse({ plan_id: PLAN_ID }).success).toBe(true)
    expect(strategyAdoptAction.payloadSchema.safeParse({ plan_id: 'x' }).success).toBe(false)
    expect(strategyAdoptAction.payloadSchema.safeParse({ plan_id: PLAN_ID, season: '2026-Q4' }).success).toBe(false)
  })

  it('previews the season, each goal against last year, three priorities and no warning line', () => {
    expect(strategyAdoptAction.preview({ plan_id: PLAN_ID }, undefined, evidenceOf(plan()))).toEqual([
      'Mùa vụ 2026-Q4',
      'Sản lượng: 1050 kg (cùng kỳ: 1000)',
      'Thửa có bệnh: 9 % (cùng kỳ: 10)',
      'Tăng Sản lượng',
      'Giảm Thửa có bệnh',
      'Tập huấn',
    ])
  })

  it('previews the warning line when the plan has warnings (W-2)', () => {
    const warned = plan({ warnings: ['Mục tiêu Sản lượng thấp hơn cùng kỳ năm trước'] })
    expect(strategyAdoptAction.preview({ plan_id: PLAN_ID }, undefined, evidenceOf(warned))).toContain(
      'Cảnh báo: mục tiêu thấp hơn cùng kỳ năm trước'
    )
  })

  it('adopts through the repository with the approver as the actor', async () => {
    mockAdopt.mockResolvedValueOnce('adopted')
    const result = await strategyAdoptAction.execute({ plan_id: PLAN_ID }, manager)
    expect(mockAdopt).toHaveBeenCalledWith('TC', PLAN_ID, 'mgr-1', expect.any(Date))
    expect(result).toEqual({ plan_id: PLAN_ID, status: 'adopted' })
  })

  it('refuses a plan that is not in this cooperative or no longer a draft', async () => {
    mockAdopt.mockResolvedValueOnce('not_found')
    await expect(strategyAdoptAction.execute({ plan_id: PLAN_ID }, manager)).rejects.toThrow()
    mockAdopt.mockResolvedValueOnce('not_draft')
    await expect(strategyAdoptAction.execute({ plan_id: PLAN_ID }, manager)).rejects.toThrow()
  })

  it('is stale when the plan row changed', async () => {
    const draft = plan()
    const evidence = evidenceOf(draft)
    const loaders = { strategy_plans: async () => strategyPlanValues(draft) }
    expect(await strategyAdoptAction.isStale({ plan_id: PLAN_ID }, evidence, { htxCode: 'TC', loaders })).toBe(false)
    const adopted = { strategy_plans: async () => strategyPlanValues(plan({ status: 'adopted' })) }
    expect(await strategyAdoptAction.isStale({ plan_id: PLAN_ID }, evidence, { htxCode: 'TC', loaders: adopted })).toBe(true)
  })
})

describe('strategy.adopt eligibility (test 37)', () => {
  const open = { unlockedKinds: ['strategy.adopt'] }
  const check = (p: StrategyPlan) =>
    autoEligibility({ origin: 'agent', payload: { plan_id: p.id }, evidence: evidenceOf(p) }, strategyAdoptAction, open)

  it('a clean plan runs on its own once the kind is opened', () => {
    expect(check(plan())).toEqual({ eligible: true, reason: 'ok' })
  })

  it('a plan with warnings never does', () => {
    expect(check(plan({ warnings: ['Mục tiêu Sản lượng thấp hơn cùng kỳ năm trước'] }))).toEqual({
      eligible: false,
      reason: 'rule_warning',
    })
  })
})
