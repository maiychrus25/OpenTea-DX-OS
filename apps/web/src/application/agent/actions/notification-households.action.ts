// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ValidationError } from '@/domain/errors'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'
import { renderNotification, templatePayloadSchema, type TemplatePayload } from './message-templates'

export const notificationHouseholdsAction: ActionDefinition<TemplatePayload> = {
  kind: 'notification.households',
  titleVi: 'Thông báo nông hộ',
  risk: 'medium',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema: templatePayloadSchema('households'),
  editableFields: ['note_vi'],
  humanOnlyFields: ['note_vi'],
  subjectTable: null,
  repeatAfterHours: 24,
  expiresAfterHours: 24,
  preview(payload) {
    const { title, body } = renderNotification(payload.template, payload.slots, payload.note_vi)
    return [title, body]
  },
  subjects(payload) {
    return payload.subjects
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const { title, body } = renderNotification(payload.template, payload.slots, payload.note_vi)
    const codes = payload.slots.parcel_codes as string[]
    // Scoped to the approver's cooperative: a code of another cooperative is missing here and nothing is sent.
    const parcels = await prisma.parcel.findMany({
      where: { parcel_code: { in: codes }, household: { htx_profile_id: approver.htxProfileId } },
      select: { parcel_code: true, household: { select: { id: true, keycloak_user_id: true } } },
    })
    if (parcels.length !== codes.length) {
      throw new ValidationError('Có thửa không thuộc hợp tác xã của bạn')
    }

    const accountByHousehold = Array.from(new Map(parcels.map((p) => [p.household.id, p.household.keycloak_user_id])).values())
    const recipientIds = Array.from(new Set(accountByHousehold.filter((id): id is string => Boolean(id)))).sort()
    const skippedWithoutAccount = accountByHousehold.filter((id) => !id).length

    await new PrismaNotificationRepository().notifyRecipients(recipientIds, {
      type: 'ANNOUNCEMENT',
      title,
      body,
    })
    return { sent: recipientIds.length, skipped_without_account: skippedWithoutAccount }
  },
}
