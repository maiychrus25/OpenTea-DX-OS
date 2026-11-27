// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { prisma } from '@/infrastructure/db/prisma.client'
import type { ChatUser } from '../types'
import { householdFilter, reply } from './common'

/** A text argument, trimmed; empty when missing or not a string. */
export function textArg(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  return typeof value === 'string' ? value.trim() : ''
}

export function notFoundReply(source: string, what: string) {
  return reply(source, [`Không tìm thấy ${what}.`])
}

/**
 * A parcel by its code inside the user's cooperative; a farmer reaches only their household's. Another cooperative's or
 * another household's code is the same as no code at all, so nothing of it is revealed.
 */
export async function findParcelByCode(user: ChatUser, code: string) {
  const scope = householdFilter(user)
  if (!scope || !code) return null
  return prisma.parcel.findFirst({
    where: {
      parcel_code: { equals: code, mode: 'insensitive' },
      household: { htx_profile_id: user.tenant.htxProfileId },
      ...scope,
    },
    select: { id: true, parcel_code: true, crop_type: true, area_ha: true, centroid_lat: true, centroid_lng: true },
  })
}
