// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { z } from 'zod'
import { BroadcastAnnouncementUseCase } from '@/application/notification/broadcast-announcement-usecase'
import { MarkNotificationReadUseCase } from '@/application/notification/mark-notification-read-usecase'
import { DomainError } from '@/domain/errors'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaNotificationRepository } from '@/infrastructure/db/notification/prisma-notification-repository'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatAction, ChatUser, Choice } from '../types'
import { MAX_CHOICES, clip, notFound } from './scope'

const ALL = 'all'
const ANNOUNCE_TITLE = 'Thông báo từ HTX'
const CLEAR_LIMIT = 50

type AnnouncePayload = { audience: string; text: string }

async function audienceChoices(user: ChatUser): Promise<Choice[]> {
  const households = await prisma.household.findMany({
    where: { htx_profile_id: user.tenant.htxProfileId },
    orderBy: { created_at: 'desc' },
    take: MAX_CHOICES - 1,
    select: { id: true, name: true },
  })
  return [{ value: ALL, label: 'Cả HTX' }, ...households.map((household) => ({ value: household.id, label: household.name }))]
}

/** The people an announcement reaches: the cooperative's farmers, officers and managers, or one household's account. */
async function recipientsOf(user: ChatUser, audience: string): Promise<string[]> {
  if (audience === ALL) {
    const adapter = new KeycloakAdminAdapter()
    const members = await Promise.all(['farmer', 'officer', 'manager'].map((role) => adapter.listUsersByRole(role, user.tenant.htxCode)))
    return Array.from(new Set(members.flat().map((member) => member.id)))
  }
  const household = await prisma.household.findFirst({
    where: { id: audience, htx_profile_id: user.tenant.htxProfileId },
    select: { keycloak_user_id: true },
  })
  if (!household) throw notFound()
  if (!household.keycloak_user_id) throw new DomainError('Nông hộ này chưa có tài khoản để nhận thông báo.')
  return [household.keycloak_user_id]
}

/**
 * Routes: `POST /api/notifications/announce`. The plan limits it to managers, narrower than the route. The route has
 * no household audience; the household one is the same broadcast to that household's account. The card is `high`
 * for both audiences, as a risk is fixed per action.
 */
export const notificationAnnounceAction: ChatAction<AnnouncePayload> = {
  name: 'notification.announce',
  titleVi: 'Gửi thông báo',
  risk: 'high',
  roles: ['manager'],
  routes: ['POST /api/notifications/announce'],
  args: [{ name: 'text', type: 'string', descriptionVi: 'Nội dung thông báo' }],
  steps: [
    { kind: 'choice', slot: 'audience', promptVi: 'Gửi cho ai?', choices: (user) => audienceChoices(user) },
    { kind: 'text', slot: 'text', promptVi: 'Nhập nội dung thông báo:', maxLength: 500 },
  ],
  payloadSchema: z.object({ audience: z.string().min(1), text: z.string().trim().min(1).max(500) }),
  consequenceVi: 'Thông báo được gửi ngay tới người nhận và không thu hồi được.',
  async preview(payload, user) {
    const audience = (await audienceChoices(user)).find((choice) => choice.value === payload.audience)
    return [`Gửi tới: ${audience?.label ?? payload.audience}`, `Nội dung: ${clip(payload.text, 200)}`]
  },
  async execute(payload, user) {
    const recipients = await recipientsOf(user, payload.audience)
    await new BroadcastAnnouncementUseCase(new PrismaNotificationRepository()).execute(ANNOUNCE_TITLE, payload.text, user.tenant.userId, recipients)
    return `Đã gửi thông báo tới ${recipients.length} người.`
  },
}

/** Routes: `PUT /api/notifications` with `mark-all-read`. */
export const notificationReadAction: ChatAction<Record<string, never>> = {
  name: 'notification.read',
  titleVi: 'Đánh dấu đã đọc',
  risk: 'medium',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['PUT /api/notifications'],
  args: [],
  steps: [],
  payloadSchema: z.object({}),
  consequenceVi: null,
  async preview() {
    return ['Đánh dấu mọi thông báo của bạn là đã đọc.']
  },
  async execute(_payload, user) {
    await new MarkNotificationReadUseCase(new PrismaNotificationRepository()).execute(user.tenant.userId)
    return 'Đã đánh dấu mọi thông báo là đã đọc.'
  },
}

/** The user's own notifications, newest first; broadcast rows with no recipient are not theirs to delete. */
async function ownNotificationIds(user: ChatUser): Promise<string[]> {
  const rows = await new PrismaNotificationRepository().getRecentByUserId(user.tenant.userId, user.tenant.htxProfileId, CLEAR_LIMIT)
  return rows.filter((row) => row.recipient_id === user.tenant.userId).map((row) => row.id)
}

/** Routes: `DELETE /api/notifications`, which deletes one by id; chat deletes the user's latest fifty, one by one. */
export const notificationClearAction: ChatAction<Record<string, never>> = {
  name: 'notification.clear',
  titleVi: 'Xoá thông báo',
  risk: 'high',
  roles: ['farmer', 'officer', 'manager'],
  routes: ['DELETE /api/notifications'],
  args: [],
  async start(user) {
    return (await ownNotificationIds(user)).length ? { state: {} } : { replyVi: 'Không có thông báo nào để xoá.' }
  },
  steps: [],
  payloadSchema: z.object({}),
  consequenceVi: 'Các thông báo này sẽ bị xoá. Không thể khôi phục.',
  async preview(_payload, user) {
    return [`Xoá ${(await ownNotificationIds(user)).length} thông báo gần nhất của bạn.`]
  },
  async execute(_payload, user) {
    const repo = new PrismaNotificationRepository()
    const ids = await ownNotificationIds(user)
    for (const id of ids) await repo.delete(user.tenant.userId, id)
    return `Đã xoá ${ids.length} thông báo.`
  },
}
