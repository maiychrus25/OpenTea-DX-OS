// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { LedgerRead } from '../views'

export interface LedgerPort {
  /** Households of the HTX linked to a Keycloak account. */
  householdIdsOfUser(htxProfileId: string, keycloakUserId: string): Promise<string[]>
  /** The ledger of the given households; a household of another HTX is ignored. */
  read(htxProfileId: string, householdIds: string[]): Promise<LedgerRead>
  /** false when the household is not in the HTX. */
  setBank(htxProfileId: string, householdId: string, bank: { bin: string; account: string; accountName: string }): Promise<boolean>
}
