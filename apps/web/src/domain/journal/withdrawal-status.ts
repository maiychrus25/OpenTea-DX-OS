// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/**
 * A spraying counts toward the withdrawal period unless its journal entry is a draft or was rejected.
 * Entries waiting for approval or sent back for changes still count: the spraying may have happened.
 * `platform/agent/dxos_agent/agents/harvest_ready.py` repeats this set.
 */
export const WITHDRAWAL_EXCLUDED_STATUSES = ['DRAFT', 'REJECTED'] as const

export function countsTowardWithdrawal(status: string): boolean {
  return !(WITHDRAWAL_EXCLUDED_STATUSES as readonly string[]).includes(status)
}
