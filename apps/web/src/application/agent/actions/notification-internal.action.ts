// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { BroadcastAnnouncementUseCase } from '@/application/notification/broadcast-announcement-usecase'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'
import { renderNotification, templatePayloadSchema, type TemplatePayload } from './message-templates'

export const notificationInternalAction: ActionDefinition<TemplatePayload> = {
  kind: 'notification.internal',
  titleVi: 'Thông báo nội bộ',
  risk: 'low',
  approverRoles: ['manager'],
  origins: ['agent', 'user'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema: templatePayloadSchema('internal'),
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
    const admin = new KeycloakAdminAdapter()
    const members = await Promise.all(
      ['officer', 'manager'].map((role) => admin.listUsersByRole(role, approver.htxCode))
    )
    const recipientIds = Array.from(new Set(members.flat().map((member) => member.id)))
    await new BroadcastAnnouncementUseCase(new PrismaNotificationRepository()).execute(
      title,
      body,
      approver.userId,
      recipientIds
    )
    return { recipients: recipientIds.length }
  },
}
