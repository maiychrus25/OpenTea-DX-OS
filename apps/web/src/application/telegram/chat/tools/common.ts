// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ListParcelsUseCase } from '@/application/farm/ListParcelsUseCase'
import { GatewayParcelReader } from '@/infrastructure/core/gateway-parcel-reader'
import { CoreGatewayClient } from '@/infrastructure/core/core-gateway.client'
import type { ParcelSummary } from '@/domain/farm/ports/ParcelPort'
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

/** The gateway client the web routes use, so the core applies the same role-scoped access. */
export function coreClient(user: ChatUser): CoreGatewayClient {
  return new CoreGatewayClient(user.tenant.role)
}

/**
 * The household filter of a read: a farmer sees only their household, officers and managers the cooperative.
 * Null when a farmer's link has no household; such a farmer reads nothing, never the whole cooperative.
 */
export function householdFilter(user: ChatUser): { household_id?: string } | null {
  if (user.tenant.role !== 'farmer') return {}
  return user.householdId ? { household_id: user.householdId } : null
}

/** The parcels the user may see, with the same scoping as `GET /api/farm/parcels`. */
export async function visibleParcels(user: ChatUser): Promise<ParcelSummary[]> {
  const scope = householdFilter(user)
  if (!scope) return []
  const parcels = await new ListParcelsUseCase(new GatewayParcelReader(coreClient(user))).execute(
    {},
    user.tenant.role.toUpperCase(),
    user.householdId ?? undefined
  )
  return scope.household_id ? parcels.filter((parcel) => parcel.household_id === scope.household_id) : parcels
}

/** Today in Vietnam, as YYYY-MM-DD. */
export function todayIso(now: Date): string {
  return localDay(now)
}
