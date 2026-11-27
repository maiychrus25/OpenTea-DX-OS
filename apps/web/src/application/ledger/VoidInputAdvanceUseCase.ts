// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors'
import type { InputPort } from '@/domain/ledger/ports/InputPort'
import type { AdvanceView } from '@/domain/ledger/views'

/** Voids a valid advance that is not in a settlement. An advance is never edited: void it and enter it again. */
export class VoidInputAdvanceUseCase {
  constructor(private readonly port: InputPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: { userId: string; role: string; htxProfileId: string }, id: string, reason: string): Promise<AdvanceView> {
    if (actor.role !== 'accountant' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    const outcome = await this.port.voidAdvance({ htxProfileId: actor.htxProfileId, id, reason, userId: actor.userId, at: this.clock() })
    if (outcome.kind === 'not_found') throw new NotFoundError('Không tìm thấy phiếu ứng')
    if (outcome.kind === 'settled') throw new ConflictError('ADVANCE_SETTLED', 'Phiếu ứng đã vào kỳ quyết toán nên không huỷ được.')
    if (outcome.kind === 'already_voided') throw new ConflictError('ADVANCE_VOIDED', 'Phiếu ứng này đã được huỷ.')
    return outcome.advance
  }
}
