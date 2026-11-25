// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { PublishBulletinUseCase } from '@/application/bulletin/PublishBulletinUseCase'
import { PrismaBulletinRepository } from '@/infrastructure/db/repositories/PrismaBulletinRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { ActionDefinition } from '../action-catalog'
import { isEvidenceStale } from './journal-evidence'

const bulletinPublishPayloadSchema = z.object({
  commodity: z.string().regex(/^[A-Za-z][A-Za-z ]{0,63}$/),
  period_day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => !Number.isNaN(Date.parse(value)), 'a real calendar date'),
  bulletin_vi: z.string().min(50).max(4000),
  sources: z
    .array(
      z.object({
        source: z.string().min(1).max(64),
        metric: z.string().min(1).max(64),
        value: z.number(),
        unit: z.string().min(1).max(32),
        period: z.string().min(1).max(32),
      }).strict()
    )
    .min(1)
    .max(30),
}).strict()

export type BulletinPublishPayload = z.infer<typeof bulletinPublishPayloadSchema>

export const bulletinPublishAction: ActionDefinition<BulletinPublishPayload> = {
  kind: 'bulletin.publish',
  titleVi: 'Đăng bản tin thị trường',
  risk: 'medium',
  approverRoles: ['manager'],
  origins: ['agent'],
  autonomy: 'auto',
  channels: ['web', 'telegram'],
  payloadSchema: bulletinPublishPayloadSchema,
  editableFields: ['bulletin_vi'],
  humanOnlyFields: [],
  subjectTable: null,
  repeatAfterHours: 20,
  expiresAfterHours: 24,
  preview(payload) {
    const [, month, day] = payload.period_day.split('-')
    return [`Đăng bản tin ${payload.commodity} ngày ${day}/${month}: ${payload.bulletin_vi.slice(0, 160)}`]
  },
  subjects(payload) {
    return [`${payload.commodity}:${payload.period_day}`]
  },
  async isStale(_payload, evidence, ctx) {
    return isEvidenceStale(evidence, ctx.htxCode, ctx.loaders)
  },
  async execute(payload, approver) {
    const { id } = await new PublishBulletinUseCase(new PrismaBulletinRepository(prisma)).execute(approver.htxCode, {
      commodity: payload.commodity,
      bulletinVi: payload.bulletin_vi,
      sources: payload.sources,
      modelUsed: 'agent:bulletin',
    })
    return { bulletin_id: id }
  },
}
