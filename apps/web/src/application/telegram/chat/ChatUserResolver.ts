// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LiveRoleReader } from '@/domain/telegram/ports/LiveRoleReader'
import type { TelegramLink } from '@/domain/telegram/ports/TelegramRepository'
import { roleFromRealmRoles } from '@/lib/auth/token-refresh'
import type { ChatUser } from './types'

export interface ChatUserSource {
  roles: LiveRoleReader
  htxProfileId(htxCode: string): Promise<string | null>
  /** The farmer's household; officers and managers have none. */
  householdId(userId: string): Promise<string | null>
}

/**
 * Builds the chat user for one update. The link names who; the role, cooperative and enabled flag come from the
 * identity provider now, so a demoted, disabled or moved user gets null and nothing runs for them.
 */
export class ChatUserResolver {
  constructor(private readonly source: ChatUserSource) {}

  async resolve(link: TelegramLink): Promise<ChatUser | null> {
    if (!link.userId || !link.telegramUserId) return null
    let live
    try {
      live = await this.source.roles.read(link.userId)
    } catch {
      return null
    }
    const role = live?.enabled && live.htxCode === link.htxCode ? roleFromRealmRoles(live.roles) : undefined
    if (!role) return null
    const htxProfileId = await this.source.htxProfileId(link.htxCode)
    if (!htxProfileId) return null
    return {
      tenant: { userId: link.userId, role, htxCode: link.htxCode, htxProfileId },
      userName: link.userName ?? link.userId,
      householdId: role === 'farmer' ? await this.source.householdId(link.userId) : null,
      telegramUserId: link.telegramUserId,
      chatId: Number(link.chatId),
    }
  }
}
