// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { localDay } from '@/domain/shared/local-day'
import type { ChatReply, ChatUser } from '../types'

export const EMPTY_LINE = 'Chưa có dữ liệu.'
const MAX_LINES = 7

/** A read answer of at most seven lines; no line at all becomes the empty line. */
export function reply(source: string, lines: string[], proposalIds?: string[]): ChatReply {
  const answer: ChatReply = { lines: lines.length ? lines.slice(0, MAX_LINES) : [EMPTY_LINE], source }
  if (proposalIds) answer.proposalIds = proposalIds
  return answer
}

/**
 * The household filter of a read: a farmer sees only their household, officers and managers the cooperative.
 * Null when a farmer's link has no household; such a farmer reads nothing, never the whole cooperative.
 */
export function householdFilter(user: ChatUser): { household_id?: string } | null {
  if (user.tenant.role !== 'farmer') return {}
  return user.householdId ? { household_id: user.householdId } : null
}

/**
 * The parcels the user may see: the cooperative's, and for a farmer only their household's.
 * Reads Prisma directly, as the Telegram update route has no browser session to call the core with.
 */
export async function visibleParcels(user: ChatUser): Promise<ParcelSummary[]> {
  const scope = householdFilter(user)
  if (!scope) return []
  const parcels = await new PrismaParcelRepository().findAll({ htx_profile_id: user.tenant.htxProfileId, ...scope })
  return scope.household_id ? parcels.filter((parcel) => parcel.household_id === scope.household_id) : parcels
}

/** Today in Vietnam, as YYYY-MM-DD. */
export function todayIso(now: Date): string {
  return localDay(now)
}
