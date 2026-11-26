// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ChatUserSource } from '@/application/telegram/chat/ChatUserResolver'
import type { ChatUser } from '@/application/telegram/chat/types'
import { GetFarmerHouseholdUseCase } from '@/application/farm/GetFarmerHouseholdUseCase'
import { ForbiddenError, CoreUnavailableError } from '@/domain/errors'
import type { LiveUserState } from '@/domain/telegram/ports/LiveRoleReader'
import { KeycloakLiveRoleReader } from '@/infrastructure/auth/dxos-web-roles.client'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
import { roleFromRealmRoles } from '@/lib/auth/token-refresh'

function liveSource(): ChatUserSource {
  return {
    roles: new KeycloakLiveRoleReader(),
    htxProfileId: async (htxCode) => (await new PrismaHtxProfileRepository().findByCode(htxCode))?.id ?? null,
    householdId: async (userId) =>
      (await new GetFarmerHouseholdUseCase(new PrismaHouseholdRepository()).execute(userId))?.id ?? null,
  }
}

/**
 * The person behind an MCP token, built the way the Telegram assistant builds its chat user: role, cooperative
 * and enabled flag come from the identity provider now. MCP has no chat, so the Telegram fields stay empty;
 * the tools never read them.
 */
export async function resolveMcpUser(userId: string, source: ChatUserSource = liveSource()): Promise<ChatUser> {
  let live: LiveUserState | null
  try {
    live = await source.roles.read(userId)
  } catch {
    throw new CoreUnavailableError('Không đọc được quyền người dùng. Vui lòng thử lại sau.')
  }
  const role = live?.enabled && live.htxCode ? roleFromRealmRoles(live.roles) : undefined
  if (!live || !live.htxCode || !role || !live.enabled) throw new ForbiddenError('Forbidden')
  const htxProfileId = await source.htxProfileId(live.htxCode)
  if (!htxProfileId) throw new ForbiddenError('Forbidden')
  return {
    tenant: { userId, role, htxCode: live.htxCode, htxProfileId },
    userName: userId,
    householdId: role === 'farmer' ? await source.householdId(userId) : null,
    telegramUserId: '',
    chatId: 0,
  }
}
