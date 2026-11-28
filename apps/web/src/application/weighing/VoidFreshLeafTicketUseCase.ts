// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, ForbiddenError, NotFoundError } from '@/domain/errors'
import type { FreshLeafTicketPort, TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'

/** Voids a valid ticket that is not in a settlement. A ticket is never edited: void it and weigh again. */
export class VoidFreshLeafTicketUseCase {
  constructor(private readonly port: FreshLeafTicketPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: { userId: string; role: string; htxProfileId: string }, id: string, reason: string): Promise<TicketView> {
    if (actor.role !== 'accountant' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    const outcome = await this.port.voidTicket({ htxProfileId: actor.htxProfileId, id, reason, userId: actor.userId, at: this.clock() })
    if (outcome.kind === 'not_found') throw new NotFoundError('Không tìm thấy phiếu cân')
    if (outcome.kind === 'settled') throw new ConflictError('TICKET_SETTLED', 'Phiếu đã vào kỳ quyết toán nên không huỷ được.')
    if (outcome.kind === 'already_voided') throw new ConflictError('TICKET_VOIDED', 'Phiếu này đã được huỷ.')
    return outcome.ticket
  }
}
