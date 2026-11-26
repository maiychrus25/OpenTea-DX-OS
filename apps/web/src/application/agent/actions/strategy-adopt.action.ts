// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import type { Evidence } from '@/domain/agent/proposal'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { PrismaStrategyPlanRepository } from '@/infrastructure/db/agent/PrismaStrategyPlanRepository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const strategyAdoptPayloadSchema = z.object({ plan_id: z.string().uuid() }).strict()

export type StrategyAdoptPayload = z.infer<typeof strategyAdoptPayloadSchema>

const PREVIEW_PRIORITIES = 3

type PreviewGoal = { label_vi: string; unit_vi: string; baseline: string; target: string }

/**
 * Adopts A11's season plan (contract C4). The plan row moves to `adopted` and the season's previous adopted plan to
 * `superseded` in one transaction; A9, A10 and the Monday report read the adopted plan from then on.
 */
export const strategyAdoptAction: ActionDefinition<StrategyAdoptPayload> = {
  kind: 'strategy.adopt',
  titleVi: 'Áp dụng kế hoạch mùa vụ',
  risk: 'medium',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'unlockable',
  channels: ['web', 'telegram'],
  payloadSchema: strategyAdoptPayloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: 'strategy_plans',
  repeatAfterHours: null,
  expiresAfterHours: 168,
  preview(_payload, _subjects, evidence?: Evidence) {
    const values = evidence?.rows.find((r) => r.table === 'strategy_plans')?.values
    if (!values) return ['Áp dụng kế hoạch mùa vụ']
    const goals = (values.goals ?? []) as PreviewGoal[]
    const priorities = (values.priorities ?? []) as string[]
    const warnings = (values.warnings ?? []) as string[]
    return [
      `Mùa vụ ${String(values.season)}`,
      ...goals.map((goal) => `${goal.label_vi}: ${goal.target} ${goal.unit_vi} (cùng kỳ: ${goal.baseline})`),
      ...priorities.slice(0, PREVIEW_PRIORITIES),
      ...(warnings.length > 0 ? ['Cảnh báo: mục tiêu thấp hơn cùng kỳ năm trước'] : []),
    ]
  },
  subjects(payload) {
    return [payload.plan_id]
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const result = await new PrismaStrategyPlanRepository().adopt(approver.htxCode, payload.plan_id, approver.userId, new Date())
    if (result === 'not_found') throw new NotFoundError('Không tìm thấy kế hoạch mùa vụ')
    if (result === 'not_draft') throw new ValidationError('Kế hoạch mùa vụ này không còn là bản nháp')
    return { plan_id: payload.plan_id, status: 'adopted' }
  },
}
