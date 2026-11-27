// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { JournalActivityData } from '@/domain/journal/ports/JournalPort'
import type { PesticidePort } from '@/domain/pesticide/ports/PesticidePort'
import { resolveWithdrawal } from '@/domain/journal/withdrawal-floor'
import { ValidationError, WithdrawalBelowFloorError } from '@/domain/errors'

/**
 * Every write path calls this for the activities it is about to store. A SPRAYING comes back with a catalogue
 * link when it has one and withdrawal days that are never blank and never below the floor; the other
 * activities pass through untouched.
 */
export async function applyWithdrawalFloor(
  activities: JournalActivityData[],
  pesticides: PesticidePort,
  htxProfileId: string
): Promise<JournalActivityData[]> {
  const result: JournalActivityData[] = []
  for (const activity of activities) {
    if (activity.activity_type !== 'SPRAYING') {
      result.push(activity)
      continue
    }
    // A channel that sends only a name (Telegram) is matched to the catalogue by trade name.
    const productId =
      activity.pesticide_product_id ?? (activity.product_name ? await pesticides.matchByTradeName(activity.product_name) : null)
    const floor = productId ? await pesticides.floorFor(productId, htxProfileId) : null
    if (productId && !floor) throw new ValidationError('Không tìm thấy thuốc trong danh mục')

    const resolved = resolveWithdrawal({ floor, requestedDays: activity.withdrawal_days ?? null })
    if (!resolved.ok) throw new WithdrawalBelowFloorError(resolved.floorDays)
    result.push({ ...activity, pesticide_product_id: floor?.productId, withdrawal_days: resolved.days })
  }
  return result
}
