// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError } from '@/domain/errors'
import type { LedgerPort } from '@/domain/ledger/ports/LedgerPort'
import type { LedgerRead } from '@/domain/ledger/views'

interface Actor {
  userId: string
  role: string
  htxProfileId: string
}

/** The money book of a household: balance, entries, slips not yet settled and the settlement lines. */
export class ReadLedgerUseCase {
  constructor(private readonly port: LedgerPort) {}

  /** A farmer reads every household linked to the account, never anyone else's. */
  async mine(actor: Actor): Promise<LedgerRead> {
    if (actor.role !== 'farmer') throw new ForbiddenError('Forbidden')
    const ids = await this.port.householdIdsOfUser(actor.htxProfileId, actor.userId)
    return this.port.read(actor.htxProfileId, ids)
  }

  async forHousehold(actor: Actor, householdId: string): Promise<LedgerRead> {
    if (actor.role !== 'manager' && actor.role !== 'accountant') throw new ForbiddenError('Forbidden')
    return this.port.read(actor.htxProfileId, [householdId])
  }
}
