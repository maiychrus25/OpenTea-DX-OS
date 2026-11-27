// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { UpdateHtxProfileUseCase } from '@/application/useCases/UpdateHtxProfileUseCase'
import { DomainError } from '@/domain/errors'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { htxProfileUpdateSchema } from '@/lib/validations/htx-profile.schema'
import type { ChatAction } from '../types'
import { clip } from './scope'

const FIELDS = [
  { value: 'name', label: 'Tên HTX' },
  { value: 'address', label: 'Địa chỉ' },
  { value: 'contact_phone', label: 'Số điện thoại liên hệ' },
  { value: 'contact_email', label: 'Email liên hệ' },
  { value: 'season_label', label: 'Tên mùa vụ' },
] as const

type ProfileEditPayload = { field: (typeof FIELDS)[number]['value']; value: string }

/**
 * Routes: `PUT /api/profile`, which admits managers only (the plan said every role). The route replaces the whole
 * profile, so the other fields are read first and sent back unchanged, crop types included.
 */
export const profileEditAction: ChatAction<ProfileEditPayload> = {
  name: 'profile.edit',
  titleVi: 'Sửa hồ sơ HTX',
  risk: 'medium',
  roles: ['manager'],
  routes: ['PUT /api/profile'],
  args: [],
  steps: [
    { kind: 'choice', slot: 'field', promptVi: 'Sửa phần nào?', choices: async () => FIELDS.map(({ value, label }) => ({ value, label })) },
    { kind: 'text', slot: 'value', promptVi: 'Nhập nội dung mới:', maxLength: 500 },
  ],
  payloadSchema: z.object({ field: z.enum(['name', 'address', 'contact_phone', 'contact_email', 'season_label']), value: z.string().trim().min(1).max(500) }),
  consequenceVi: null,
  async preview(payload) {
    return [`Trường: ${FIELDS.find((f) => f.value === payload.field)?.label}`, `Giá trị mới: ${clip(payload.value)}`]
  },
  async execute(payload, user) {
    const repo = new PrismaHtxProfileRepository(prisma)
    const current = await new GetHtxProfileUseCase(repo).execute(user.tenant.htxCode)
    const next = htxProfileUpdateSchema.safeParse({
      name: current.name,
      address: current.address,
      contact_phone: current.contact_phone,
      contact_email: current.contact_email,
      crop_types: current.crop_types,
      season_label: current.season_label,
      [payload.field]: payload.value,
    })
    if (!next.success) throw new DomainError(next.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ')
    await new UpdateHtxProfileUseCase(repo).execute(user.tenant.htxCode, next.data)
    return 'Đã cập nhật hồ sơ HTX.'
  },
}
