// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { ApproveMemberUseCase } from '@/application/auth/approve-member.use-case'
import { DeleteMemberUseCase } from '@/application/auth/delete-member.use-case'
import type { MemberData } from '@/domain/auth/ports/auth-management.port'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import type { ChatAction, ChatUser } from '../types'
import { MAX_CHOICES, notFound } from './scope'

const ROLES = [
  { value: 'farmer', label: 'Nông dân' },
  { value: 'officer', label: 'Cán bộ kỹ thuật' },
] as const

/** Farmers and officers of the user's cooperative, newest account first. Managers are never listed, so never removed. */
async function membersOf(user: ChatUser): Promise<MemberData[]> {
  const adapter = new KeycloakAdminAdapter()
  const lists = await Promise.all(ROLES.map((role) => adapter.listUsersByRole(role.value, user.tenant.htxCode)))
  return lists.flat().sort((a, b) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0))
}

async function memberChoices(user: ChatUser, keep: (member: MemberData) => boolean) {
  return (await membersOf(user))
    .filter(keep)
    .slice(0, MAX_CHOICES)
    .map((member) => ({ value: member.id, label: `${member.full_name} · ${member.phone}` }))
}

async function memberOf(user: ChatUser, id: string): Promise<MemberData> {
  const member = (await membersOf(user)).find((candidate) => candidate.id === id)
  if (!member) throw notFound()
  return member
}

const memberLine = (member: MemberData) => `Thành viên: ${member.full_name} · ${member.phone}`

type MemberPayload = { member_id: string }
const memberPayload = z.object({ member_id: z.string().min(1) })

/** Routes: `POST /api/members/[id]/approve`, for managers; only accounts waiting for approval are offered. */
export const memberApproveAction: ChatAction<MemberPayload> = {
  name: 'member.approve',
  titleVi: 'Duyệt thành viên',
  risk: 'high',
  roles: ['manager'],
  routes: ['POST /api/members/[id]/approve'],
  args: [],
  async start(user) {
    return (await memberChoices(user, (member) => !member.is_active)).length ? { state: {} } : { replyVi: 'Không có thành viên nào đang chờ duyệt.' }
  },
  steps: [{ kind: 'choice', slot: 'member_id', promptVi: 'Chọn thành viên cần duyệt:', choices: (user) => memberChoices(user, (member) => !member.is_active) }],
  payloadSchema: memberPayload,
  consequenceVi: 'Thành viên sẽ đăng nhập và dùng hệ thống ngay.',
  async preview(payload, user) {
    return [memberLine(await memberOf(user, payload.member_id))]
  },
  async execute(payload, user) {
    const member = await memberOf(user, payload.member_id)
    await new ApproveMemberUseCase(new KeycloakAdminAdapter()).execute(member.id)
    return `Đã duyệt thành viên ${member.full_name}.`
  },
}

/** Routes: `DELETE /api/members/[id]`, for managers; farmers and officers of the cooperative only. */
export const memberRemoveAction: ChatAction<MemberPayload> = {
  name: 'member.remove',
  titleVi: 'Xoá thành viên',
  risk: 'high',
  roles: ['manager'],
  routes: ['DELETE /api/members/[id]'],
  args: [],
  steps: [{ kind: 'choice', slot: 'member_id', promptVi: 'Chọn thành viên cần xoá:', choices: (user) => memberChoices(user, () => true) }],
  payloadSchema: memberPayload,
  consequenceVi: 'Tài khoản sẽ bị xoá và không thể khôi phục.',
  async preview(payload, user) {
    return [memberLine(await memberOf(user, payload.member_id))]
  },
  async execute(payload, user) {
    const member = await memberOf(user, payload.member_id)
    await new DeleteMemberUseCase(new KeycloakAdminAdapter(), new PrismaHouseholdRepository()).execute(member.id)
    return `Đã xoá thành viên ${member.full_name}.`
  },
}
