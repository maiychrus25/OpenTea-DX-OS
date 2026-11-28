// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { ACTIVITY_LABEL, formatVnDate } from '@/application/agent/actions/journal-labels'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { assertJournalPhotoKey, journalPhotoRoot } from '@/domain/document/document-namespace'
import { localDay } from '@/domain/shared/local-day'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { PrismaPesticideRepository } from '@/infrastructure/db/pesticide/PrismaPesticideRepository'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction, Choice } from '../types'
import { parcelChoices, parcelCode } from './common'

const ACTIVITY_TYPES = ['SPRAYING', 'FERTILIZING', 'IRRIGATION', 'HARVEST', 'SOWING', 'PRUNING', 'OTHER'] as const
const CHEMICAL_ACTIVITIES = ['SPRAYING', 'FERTILIZING']
// PRUNING is labelled here until the shared label table gains it (UI track).
const LABEL: Record<string, string> = { ...ACTIVITY_LABEL, PRUNING: 'Đốn chè' }
const ACTIVITY_CHOICES: Choice[] = ACTIVITY_TYPES.map((value) => ({ value, label: LABEL[value] }))

type JournalCreatePayload = {
  parcel_id: string
  activity_type: (typeof ACTIVITY_TYPES)[number]
  product_name?: string
  dosage?: string
  withdrawal_days?: number
  photo_key?: string
}

const payloadSchema = z.object({
  parcel_id: z.string().min(1),
  activity_type: z.enum(ACTIVITY_TYPES),
  product_name: z.string().min(1).max(200).optional(),
  dosage: z.string().min(1).max(100).optional(),
  withdrawal_days: z.number().int().min(0).max(365).optional(),
  photo_key: z.string().min(1).optional(),
})

/** Routes: `POST /api/journal` and `POST /api/journal/upload`, for a farmer or an officer. */
export const journalCreateAction: ChatAction<JournalCreatePayload> = {
  name: 'journal.create',
  titleVi: 'Ghi nhật ký',
  risk: 'medium',
  roles: ['farmer', 'officer'],
  routes: ['POST /api/journal', 'POST /api/journal/upload'],
  args: [
    { name: 'parcel_id', type: 'string', descriptionVi: 'Mã thửa, ví dụ TC-A1' },
    { name: 'activity_type', type: 'enum', values: ACTIVITY_TYPES, descriptionVi: 'Loại hoạt động' },
    { name: 'product_name', type: 'string', descriptionVi: 'Tên thuốc hoặc phân bón' },
    { name: 'dosage', type: 'string', descriptionVi: 'Liều lượng' },
    { name: 'withdrawal_days', type: 'integer', descriptionVi: 'Số ngày cách ly' },
  ],
  steps: [
    { kind: 'choice', slot: 'parcel_id', promptVi: 'Chọn thửa:', choices: (user) => parcelChoices(user) },
    { kind: 'choice', slot: 'activity_type', promptVi: 'Chọn hoạt động:', choices: async () => ACTIVITY_CHOICES },
    {
      kind: 'text',
      slot: 'product_name',
      promptVi: 'Tên thuốc hoặc phân bón:',
      maxLength: 200,
      when: (state) => CHEMICAL_ACTIVITIES.includes(state.activity_type as string),
    },
    {
      kind: 'text',
      slot: 'dosage',
      promptVi: 'Liều lượng, ví dụ 20 ml cho bình 16 lít:',
      maxLength: 100,
      when: (state) => CHEMICAL_ACTIVITIES.includes(state.activity_type as string),
    },
    {
      kind: 'integer',
      slot: 'withdrawal_days',
      promptVi: 'Số ngày cách ly ghi trên bao bì (0 đến 365):',
      min: 0,
      max: 365,
      when: (state) => state.activity_type === 'SPRAYING',
    },
    {
      kind: 'photo',
      slot: 'photo_key',
      promptVi: 'Gửi một ảnh minh chứng, hoặc bấm Bỏ qua.',
      optional: true,
      photoKey: (user) => `${journalPhotoRoot(user.tenant.htxCode)}${localDay(new Date()).slice(0, 4)}/${randomUUID()}-telegram.jpg`,
    },
  ],
  payloadSchema,
  consequenceVi: null,
  async preview(payload, user) {
    return [
      `Thửa: ${await parcelCode(user, payload.parcel_id)}`,
      `Ngày: ${formatVnDate(new Date()) ?? ''}`,
      `Hoạt động: ${LABEL[payload.activity_type]}`,
      ...(payload.product_name ? [`Thuốc/phân: ${payload.product_name}`] : []),
      ...(payload.dosage ? [`Liều: ${payload.dosage}`] : []),
      ...(payload.withdrawal_days !== undefined ? [`Cách ly: ${payload.withdrawal_days} ngày`] : []),
      `Ảnh: ${payload.photo_key ? 'có' : 'không'}`,
    ]
  },
  async execute(payload, user, _deps, now) {
    await new TenantGuard(user.tenant).parcel(payload.parcel_id)
    if (payload.photo_key) assertJournalPhotoKey(payload.photo_key, user.tenant.htxCode)
    const role = user.tenant.role.toUpperCase()
    await new CreateJournalEntryUseCase(new PrismaJournalRepository(), new PrismaParcelRepository(), new PrismaPesticideRepository()).execute(
      {
        parcel_id: payload.parcel_id,
        entry_date: new Date(localDay(now)),
        activity_type: payload.activity_type,
        performed_by: user.userName,
        submitted_by_id: user.tenant.userId,
        submitted_role: role as 'OFFICER' | 'FARMER',
        activities: [
          {
            activity_type: payload.activity_type,
            product_name: payload.product_name,
            dosage: payload.dosage,
            withdrawal_days: payload.withdrawal_days,
          },
        ],
        photo_minio_key: payload.photo_key,
      },
      role,
      user.householdId ?? undefined,
      user.tenant.htxProfileId
    )
    return 'Đã ghi nhật ký. Nhật ký đang chờ duyệt.'
  },
}
