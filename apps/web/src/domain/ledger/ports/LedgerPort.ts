// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LedgerRead } from '../views'

export interface LedgerPort {
  /** Households of the HTX linked to a Keycloak account. */
  householdIdsOfUser(htxProfileId: string, keycloakUserId: string): Promise<string[]>
  /** The ledger of the given households; a household of another HTX is ignored. */
  read(htxProfileId: string, householdIds: string[]): Promise<LedgerRead>
  /** The stored bank details, or null when the household has none; undefined when it is not in the HTX. */
  getBank(htxProfileId: string, householdId: string): Promise<{ bin: string; account: string; accountName: string } | null | undefined>
  /** false when the household is not in the HTX. */
  setBank(htxProfileId: string, householdId: string, bank: { bin: string; account: string; accountName: string }, actorId: string): Promise<boolean>
}
