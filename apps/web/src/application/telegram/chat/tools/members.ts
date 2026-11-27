// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import type { ChatTool } from '../types'
import { reply } from './common'

/** Inviting makes an account with a password, so it is done in the app; chat only says where. */
const INVITE_HINT_VI = 'Mời thành viên mới: mở ứng dụng, mục Thành viên.'

/** Routes: `GET /api/members`; the same Keycloak admin read, which needs no browser session. */
export const membersTool: ChatTool = {
  name: 'members',
  titleVi: 'Thành viên',
  roles: ['manager'],
  routes: ['GET /api/members'],
  args: [],
  async run(user) {
    const adapter = new KeycloakAdminAdapter()
    const [farmers, officers] = await Promise.all([
      adapter.listUsersByRole('farmer', user.tenant.htxCode),
      adapter.listUsersByRole('officer', user.tenant.htxCode),
    ])
    const members = [...farmers, ...officers]
    const pending = members.filter((member) => !member.is_active).sort((a, b) => (b.createdTimestamp ?? 0) - (a.createdTimestamp ?? 0))
    return reply('Thành viên', [
      `Đang hoạt động: ${members.length - pending.length} · Chờ duyệt: ${pending.length}`,
      ...pending.slice(0, 5).map((member) => `${member.full_name} · ${member.role === 'FARMER' ? 'nông dân' : 'cán bộ'} · ${member.phone}`),
      INVITE_HINT_VI,
    ])
  },
}
