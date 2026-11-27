// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { CreateHouseholdUseCase } from '@/application/farm/CreateHouseholdUseCase'
import { UpdateHouseholdUseCase } from '@/application/farm/UpdateHouseholdUseCase'
import { DomainError } from '@/domain/errors'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { prisma } from '@/infrastructure/db/prisma.client'
import { TenantGuard } from '@/lib/api/tenant-guard'
import type { ChatAction, ChatUser, Choice } from '../types'
import { MAX_CHOICES, clip, inCooperative, notFound } from './scope'

const PHONE_TAKEN_VI = 'Số điện thoại này đã được đăng ký!'

type HouseholdAddPayload = { owner_name: string; phone: string }

/** Routes: `POST /api/farm/households`, which admits officers only. The phone is the household code, as for an invited farmer. */
export const householdAddAction: ChatAction<HouseholdAddPayload> = {
  name: 'household.add',
  titleVi: 'Thêm nông hộ',
  risk: 'medium',
  roles: ['officer'],
  routes: ['POST /api/farm/households'],
  args: [
    { name: 'owner_name', type: 'string', descriptionVi: 'Tên chủ hộ' },
    { name: 'phone', type: 'string', descriptionVi: 'Số điện thoại' },
  ],
  steps: [
    { kind: 'text', slot: 'owner_name', promptVi: 'Tên chủ hộ:', maxLength: 200 },
    { kind: 'text', slot: 'phone', promptVi: 'Số điện thoại:', maxLength: 20 },
  ],
  payloadSchema: z.object({ owner_name: z.string().trim().min(1).max(200), phone: z.string().trim().min(1).max(20) }),
  consequenceVi: null,
  async preview(payload) {
    return [`Chủ hộ: ${payload.owner_name}`, `Số điện thoại: ${payload.phone}`]
  },
  async execute(payload, user) {
    const repo = new PrismaHouseholdRepository()
    if (await repo.isPhoneTaken(payload.phone, user.tenant.htxProfileId)) throw new DomainError(PHONE_TAKEN_VI)
    await new CreateHouseholdUseCase(repo).execute({
      household_code: payload.phone,
      owner_name: payload.owner_name,
      phone: payload.phone,
      htx_profile_id: user.tenant.htxProfileId,
    })
    return `Đã thêm nông hộ ${payload.owner_name}.`
  },
}

const FIELDS = [
  { value: 'owner_name', label: 'Tên chủ hộ', max: 200 },
  { value: 'phone', label: 'Số điện thoại', max: 20 },
  { value: 'address', label: 'Địa chỉ', max: 500 },
] as const

type HouseholdEditPayload = { household_id: string; field: (typeof FIELDS)[number]['value']; value: string }

/** A farmer picks from their own household only; officers and managers from the cooperative's, newest first. */
async function householdChoices(user: ChatUser): Promise<Choice[]> {
  if (user.tenant.role === 'farmer' && !user.householdId) return []
  const rows = await prisma.household.findMany({
    where: user.tenant.role === 'farmer' ? { id: user.householdId! } : { htx_profile_id: user.tenant.htxProfileId },
    orderBy: { created_at: 'desc' },
    take: MAX_CHOICES,
    select: { id: true, name: true },
  })
  return rows.map((row) => ({ value: row.id, label: row.name }))
}

/** Routes: `PUT /api/farm/households/[id]`: any role, a farmer only on their own household. */
export const householdEditAction: ChatAction<HouseholdEditPayload> = {
  name: 'household.edit',
  titleVi: 'Sửa thông tin nông hộ',
  risk: 'medium',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['PUT /api/farm/households/[id]'],
  args: [],
  steps: [
    { kind: 'choice', slot: 'household_id', promptVi: 'Chọn nông hộ:', choices: (user) => householdChoices(user) },
    { kind: 'choice', slot: 'field', promptVi: 'Sửa phần nào?', choices: async () => FIELDS.map(({ value, label }) => ({ value, label })) },
    { kind: 'text', slot: 'value', promptVi: 'Nhập nội dung mới:', maxLength: 500 },
  ],
  payloadSchema: z
    .object({ household_id: z.string().min(1), field: z.enum(['owner_name', 'phone', 'address']), value: z.string().trim().min(1).max(500) })
    .refine((p) => p.value.length <= FIELDS.find((f) => f.value === p.field)!.max, { message: 'Quá dài', path: ['value'] }),
  consequenceVi: null,
  async preview(payload, user) {
    const [household] = (await householdChoices(user)).filter((choice) => choice.value === payload.household_id)
    return [
      `Nông hộ: ${household?.label ?? payload.household_id}`,
      `Trường: ${FIELDS.find((f) => f.value === payload.field)?.label}`,
      `Giá trị mới: ${clip(payload.value)}`,
    ]
  },
  async execute(payload, user) {
    if (user.tenant.role === 'farmer' && payload.household_id !== user.householdId) throw notFound()
    await inCooperative(new TenantGuard(user.tenant).household(payload.household_id))
    const repo = new PrismaHouseholdRepository()
    if (payload.field === 'phone' && (await repo.isPhoneTaken(payload.value, user.tenant.htxProfileId))) {
      const current = await repo.findById(payload.household_id)
      if (current?.phone !== payload.value) throw new DomainError(PHONE_TAKEN_VI)
    }
    await new UpdateHouseholdUseCase(repo).execute(payload.household_id, { [payload.field]: payload.value }, user.tenant.role.toUpperCase(), user.householdId ?? undefined)
    return 'Đã cập nhật thông tin nông hộ.'
  },
}
