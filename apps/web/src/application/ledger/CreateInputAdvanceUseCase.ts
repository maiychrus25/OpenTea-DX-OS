// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { advanceAmount } from '@/domain/ledger/advance-math'
import type { AdvanceUnit, InputPort } from '@/domain/ledger/ports/InputPort'
import type { AdvanceView } from '@/domain/ledger/views'
import { vnDayOf } from '@/application/agent/campaign/vn-day'

export interface CreateAdvanceInput {
  household_id: string
  item_id: string
  quantity: number
  advanced_on?: string
  client_id?: string
}

export interface AdvanceActor {
  userId: string
  role: string
  htxProfileId: string
  htxCode: string
}

/** Writes one advance. The price is copied from the item, so a later price change never moves an old advance. */
export class CreateInputAdvanceUseCase {
  constructor(private readonly port: InputPort, private readonly clock: () => Date = () => new Date()) {}

  async execute(actor: AdvanceActor, input: CreateAdvanceInput): Promise<{ advance: AdvanceView; created: boolean }> {
    if (actor.role !== 'accountant' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')

    if (input.client_id) {
      const first = await this.port.findAdvanceByClientId(actor.userId, input.client_id)
      if (first) return { advance: first, created: false }
    }

    const today = vnDayOf(this.clock())
    const advancedOn = input.advanced_on ?? today
    if (advancedOn > today) throw new ValidationError('Ngày ứng không được ở tương lai.')

    try {
      const advance = await this.port.inAdvanceTransaction((unit) => this.write(unit, actor, input, advancedOn, today))
      return { advance, created: true }
    } catch (err) {
      // Two replays racing past the pre-check: the unique key stopped the second, so hand back the first.
      if (input.client_id && (err as { code?: string }).code === 'P2002') {
        const first = await this.port.findAdvanceByClientId(actor.userId, input.client_id)
        if (first) return { advance: first, created: false }
      }
      throw err
    }
  }

  private async write(unit: AdvanceUnit, actor: AdvanceActor, input: CreateAdvanceInput, advancedOn: string, today: string): Promise<AdvanceView> {
    const household = await unit.householdOf(actor.htxProfileId, input.household_id)
    if (!household) throw new NotFoundError('Không tìm thấy hộ')
    const item = await unit.itemOf(actor.htxProfileId, input.item_id)
    if (!item) throw new NotFoundError('Không tìm thấy vật tư')
    if (!item.active) throw new ValidationError('Vật tư này đã ẩn.')
    if (item.unit_price_vnd <= 0) throw new ValidationError('Vật tư chưa có đơn giá.')

    return unit.insert({
      htx_profile_id: actor.htxProfileId,
      advance_no: await unit.nextAdvanceNo(actor.htxCode, today),
      household_id: household.id,
      item_id: item.id,
      quantity: input.quantity,
      unit_price_vnd: item.unit_price_vnd,
      amount_vnd: advanceAmount(input.quantity, item.unit_price_vnd),
      advanced_on: advancedOn,
      created_by_id: actor.userId,
      client_id: input.client_id ?? null,
    })
  }
}
