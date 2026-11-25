// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'
import { DISEASE_LABEL_VI } from './disease-labels'

const diseaseKeys = Object.keys(DISEASE_LABEL_VI) as [keyof typeof DISEASE_LABEL_VI, ...(keyof typeof DISEASE_LABEL_VI)[]]

const diseaseInspectionPayloadSchema = z.object({
  disease: z.enum(diseaseKeys),
  report_ids: z
    .array(z.string().min(1).max(64))
    .min(2)
    .max(50)
    .refine((ids) => ids.every((id, i) => i === 0 || ids[i - 1] < id), 'sorted and unique'),
  parcel_codes: z.array(z.string().min(1).max(32)).min(1).max(50),
  radius_m: z.number().int().min(100).max(20000),
  days: z.number().int().min(1).max(30),
}).strict()

export type DiseaseInspectionPayload = z.infer<typeof diseaseInspectionPayloadSchema>

function message(payload: DiseaseInspectionPayload): { title: string; body: string } {
  return {
    title: 'Đề nghị kiểm tra dịch bệnh',
    body: `Có ${payload.report_ids.length} báo cáo ${DISEASE_LABEL_VI[payload.disease]} trong ${payload.days} ngày, trong bán kính ${payload.radius_m} m: thửa ${payload.parcel_codes.join(', ')}. Đề nghị cán bộ đi kiểm tra.`,
  }
}

export const diseaseInspectionAction: ActionDefinition<DiseaseInspectionPayload> = {
  kind: 'disease.inspection',
  titleVi: 'Đề nghị kiểm tra dịch bệnh',
  risk: 'medium',
  approverRoles: ['officer', 'manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema: diseaseInspectionPayloadSchema,
  editableFields: [],
  humanOnlyFields: [],
  subjectTable: 'disease_reports',
  repeatAfterHours: 72,
  expiresAfterHours: 72,
  preview(payload) {
    const { title, body } = message(payload)
    return [title, body]
  },
  subjects(payload) {
    return payload.report_ids
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const { title, body } = message(payload)
    const admin = new KeycloakAdminAdapter()
    const members = await Promise.all(
      ['officer', 'manager'].map((role) => admin.listUsersByRole(role, approver.htxCode))
    )
    const recipientIds = Array.from(new Set(members.flat().map((member) => member.id)))
    await new PrismaNotificationRepository().notifyRecipients(recipientIds, {
      type: 'DISEASE_REPORT',
      title,
      body,
      deepLinkUrl: '/officer/diseases',
    })
    return { recipients: recipientIds.length }
  },
}
