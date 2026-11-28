// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import { HUMAN_ROLES, type HumanRole } from '@/lib/auth/roles'
import { logger } from '@/lib/logger'

// Keys already written by this process. A restart or another instance writes once more, which is harmless.
const synced = new Set<string>()

export function resetMembershipSyncCache(): void {
  synced.clear()
}

export class PrismaMembershipRepository {
  /**
   * Makes the membership row match the roles of the token (adds and removes). platform_admin is not recorded:
   * it belongs to no HTX. Never throws: a failed write is logged and tried again on the next call.
   */
  async sync(userId: string, htxProfileId: string, roles: HumanRole[]): Promise<void> {
    const memberRoles = HUMAN_ROLES.filter((role) => role !== 'platform_admin' && roles.includes(role)).sort()
    if (memberRoles.length === 0) return
    const key = `${userId}|${htxProfileId}|${memberRoles.join(',')}`
    if (synced.has(key)) return
    try {
      await prisma.htxMembership.upsert({
        where: { keycloak_user_id_htx_profile_id: { keycloak_user_id: userId, htx_profile_id: htxProfileId } },
        create: { keycloak_user_id: userId, htx_profile_id: htxProfileId, roles: memberRoles },
        update: { roles: memberRoles },
      })
      synced.add(key)
    } catch (error) {
      logger.error('Membership sync failed', { error })
    }
  }
}
