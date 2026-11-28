// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError, NotFoundError, ValidationError } from '@/domain/errors'
import { normalizePhone } from '@/domain/zalo/phone'
import type { ConsentSource, ConsentStatus, ZaloRepository } from '@/domain/zalo/ports/ZaloRepository'

export interface ConsentActor {
  userId: string
  role: string
  htxCode: string
}

export interface ConsentInput {
  status: ConsentStatus
  source: ConsentSource
}

const STAFF = ['manager', 'officer']

/**
 * Who may record a household's wish to receive Zalo messages:
 * - an officer or a manager: OPTED_IN or OPTED_OUT for any household of their cooperative (source REGISTRATION or OFFICER);
 * - a farmer: only OPTED_OUT, source MEMBER, for the household linked to their own account;
 * - anyone else, and anything else a farmer asks: 403.
 * Rows are only added; the newest one is the current wish.
 */
export class RecordZaloConsentUseCase {
  constructor(private readonly repo: ZaloRepository) {}

  async execute(actor: ConsentActor, householdId: string, input: ConsentInput): Promise<void> {
    if (actor.role === 'farmer') {
      if (input.status !== 'OPTED_OUT' || input.source !== 'MEMBER') throw new ForbiddenError('Forbidden')
    } else if (STAFF.includes(actor.role)) {
      if (input.source === 'MEMBER') throw new ValidationError('Nguồn "xã viên tự tắt" chỉ dành cho chính xã viên.')
    } else {
      throw new ForbiddenError('Forbidden')
    }

    const household = await this.repo.household(actor.htxCode, householdId)
    // A farmer learns nothing about a household that is not theirs: not found and not theirs both answer 403.
    if (actor.role === 'farmer' && household?.keycloakUserId !== actor.userId) throw new ForbiddenError('Forbidden')
    if (!household) throw new NotFoundError('Không tìm thấy hộ')
    const phone = normalizePhone(household.phone)
    if (!phone) throw new ValidationError('Số điện thoại của hộ không hợp lệ nên chưa ghi nhận được.')

    await this.repo.recordConsent({ htxCode: actor.htxCode, householdId, phone, status: input.status, source: input.source, recordedBy: actor.userId })
  }

  /** The current wish of a household: staff of the cooperative, or the farmer of that household. */
  async current(actor: ConsentActor, householdId: string): Promise<{ status: ConsentStatus | null; source: ConsentSource | null; at: string | null }> {
    if (actor.role !== 'farmer' && !STAFF.includes(actor.role)) throw new ForbiddenError('Forbidden')
    const household = await this.repo.household(actor.htxCode, householdId)
    if (actor.role === 'farmer' && household?.keycloakUserId !== actor.userId) throw new ForbiddenError('Forbidden')
    if (!household) throw new NotFoundError('Không tìm thấy hộ')
    const consent = (await this.repo.latestConsents([householdId])).get(householdId)
    return { status: consent?.status ?? null, source: consent?.source ?? null, at: consent?.at.toISOString() ?? null }
  }
}
