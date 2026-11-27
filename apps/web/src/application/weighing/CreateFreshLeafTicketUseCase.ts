// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ConflictError, DomainError, ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { computeTicket } from '@/domain/weighing/ticket-math'
import type { FreshLeafTicketPort, TicketUnit, TicketView } from '@/domain/weighing/ports/FreshLeafTicketPort'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { viDate, weighingBlock } from './withdrawal-gate'

export interface CreateTicketInput {
  household_id: string
  parcel_id: string
  grade_id: string
  gross_kg: number
  deduction_pct: number
  client_id?: string
}

export interface TicketActor {
  userId: string
  role: string
  htxProfileId: string
  htxCode: string
}

/**
 * Writes one fresh-leaf ticket. The weighing time is the server clock, and no input can skip the withdrawal check:
 * it runs inside the transaction that holds the parcel row lock.
 */
export class CreateFreshLeafTicketUseCase {
  constructor(private readonly port: FreshLeafTicketPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: TicketActor, input: CreateTicketInput): Promise<{ ticket: TicketView; created: boolean }> {
    if (actor.role !== 'accountant' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')

    if (input.client_id) {
      const first = await this.port.findByClientId(actor.userId, input.client_id)
      if (first) return { ticket: first, created: false }
    }

    try {
      const ticket = await this.port.inTicketTransaction((unit) => this.write(unit, actor, input))
      return { ticket, created: true }
    } catch (err) {
      // Two replays racing past the pre-check: the unique key stopped the second, so hand back the first.
      if (input.client_id && (err as { code?: string }).code === 'P2002') {
        const first = await this.port.findByClientId(actor.userId, input.client_id)
        if (first) return { ticket: first, created: false }
      }
      throw err
    }
  }

  private async write(unit: TicketUnit, actor: TicketActor, input: CreateTicketInput): Promise<TicketView> {
    const now = this.clock()
    const day = vnDayOf(now)

    const parcel = await unit.lockParcel(input.parcel_id)
    if (!parcel || parcel.htx_profile_id !== actor.htxProfileId || parcel.household_id !== input.household_id) {
      throw new NotFoundError('Không tìm thấy nương của hộ này')
    }
    if (parcel.status === 'DRAFT') throw new DomainError('Nương chưa được duyệt nên chưa cân được.')

    const safeFrom = weighingBlock(await unit.sprayEntries(parcel.id, now), day)
    if (safeFrom) {
      throw new ConflictError(
        'PARCEL_IN_WITHDRAWAL',
        `Nương ${parcel.parcel_code} còn trong thời gian cách ly đến ${viDate(safeFrom)}. Không được cân búp thương phẩm.`,
        { safe_from: safeFrom },
      )
    }

    const grade = await unit.gradeOf(actor.htxProfileId, input.grade_id)
    if (!grade) throw new NotFoundError('Không tìm thấy phẩm cấp')
    if (!grade.active) throw new ValidationError('Phẩm cấp này đã ẩn.')

    const price = await unit.priceOf(grade.id, day)
    if (price === null) throw new ConflictError('NO_PRICE_TODAY', 'Chưa công bố giá hôm nay cho phẩm cấp này.')

    const { netKg, amountVnd } = computeTicket({ grossKg: input.gross_kg, deductionPct: input.deduction_pct, priceVndPerKg: price })
    return unit.insert({
      htx_profile_id: actor.htxProfileId,
      ticket_no: await unit.nextTicketNo(actor.htxCode, day),
      household_id: parcel.household_id,
      parcel_id: parcel.id,
      cycle_id: await unit.cycleIdFor(parcel.id),
      grade_id: grade.id,
      weighed_at: now,
      gross_kg: input.gross_kg,
      deduction_pct: input.deduction_pct,
      net_kg: netKg,
      price_vnd_per_kg: price,
      amount_vnd: amountVnd,
      created_by_id: actor.userId,
      client_id: input.client_id ?? null,
    })
  }
}
