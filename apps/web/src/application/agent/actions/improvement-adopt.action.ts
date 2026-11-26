// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { BroadcastAnnouncementUseCase } from '@/application/notification/broadcast-announcement-usecase'
import type { Evidence } from '@/domain/agent/proposal'
import { ValidationError, NotFoundError } from '@/domain/errors'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaImprovementRepository } from '@/infrastructure/db/agent/PrismaImprovementRepository'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const improvementAdoptPayloadSchema = z.object({ improvement_id: z.string().uuid() }).strict()

export type ImprovementAdoptPayload = z.infer<typeof improvementAdoptPayloadSchema>

/**
 * Applies a process note or a campaign template (contract C2). The proposal's decision moves the improvement to
 * `adopted`; this action only does what adoption means for its kind.
 */
export const improvementAdoptAction: ActionDefinition<ImprovementAdoptPayload> = {
  kind: 'improvement.adopt',
  titleVi: 'Áp dụng cải tiến',
  risk: 'low',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'never',
  channels: ['web', 'telegram'],
  payloadSchema: improvementAdoptPayloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: 'improvements',
  repeatAfterHours: null,
  expiresAfterHours: 168,
  preview(_payload, _subjects, evidence?: Evidence) {
    const row = evidence?.rows.find((r) => r.table === 'improvements')
    const title = String(row?.values?.title_vi ?? 'Áp dụng cải tiến')
    const rationale = row?.values?.rationale_vi
    return rationale ? [title, String(rationale)] : [title]
  },
  subjects(payload) {
    return [payload.improvement_id]
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const improvement = await new PrismaImprovementRepository().findById(approver.htxCode, payload.improvement_id)
    if (!improvement) throw new NotFoundError('Không tìm thấy cải tiến')
    if (improvement.kind === 'setting') throw new ValidationError('Cải tiến cài đặt được áp dụng qua đề xuất đổi cài đặt')

    if (improvement.kind === 'template') {
      return { improvement_id: improvement.id, kind: improvement.kind, template: improvement.template }
    }
    // A process note goes to the cooperative's officers and managers, as the internal notification does.
    const admin = new KeycloakAdminAdapter()
    const members = await Promise.all(
      ['officer', 'manager'].map((role) => admin.listUsersByRole(role, approver.htxCode))
    )
    const recipientIds = Array.from(new Set(members.flat().map((member) => member.id)))
    await new BroadcastAnnouncementUseCase(new PrismaNotificationRepository()).execute(
      improvement.titleVi,
      improvement.rationaleVi,
      approver.userId,
      recipientIds
    )
    return { improvement_id: improvement.id, kind: improvement.kind, recipients: recipientIds.length }
  },
}
