// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { CreateJournalData, JournalPort } from '@/domain/journal/ports/JournalPort'
import { PesticidePort } from '@/domain/pesticide/ports/PesticidePort'
import { NotFoundError, DomainError, ForbiddenError } from '@/domain/errors'
import { applyWithdrawalFloor } from './apply-withdrawal-floor'

export type JournalUpdateData = Partial<CreateJournalData> & { submit?: boolean }

export class UpdateJournalEntryUseCase {
  constructor(
    private readonly journalPort: JournalPort,
    private readonly pesticides: PesticidePort
  ) {}

  /** `actor` is the signed-in user; a farmer who submits a draft written by an officer becomes its submitter. */
  async execute(
    id: string,
    input: JournalUpdateData,
    userRole: string | undefined,
    userHouseholdId: string | undefined,
    htxProfileId: string,
    actor?: { id: string; name: string }
  ) {
    const existing = await this.journalPort.findById(id)
    if (!existing) throw new NotFoundError('Journal entry not found')
    if (userRole === 'FARMER') {
      if (!userHouseholdId || existing.household_id !== userHouseholdId) {
        throw new ForbiddenError('Bạn không có quyền sửa nhật ký này')
      }
    }
    const returned = existing.status === 'REJECTED' || existing.status === 'REQUEST_CHANGES'
    if (!returned && existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
      throw new DomainError('Only draft, pending or returned entries can be updated')
    }
    const { submit, ...data } = input
    if (submit && userRole !== 'FARMER') throw new ForbiddenError('Chỉ nông dân mới gửi lại nhật ký')
    const submitsDraft = submit === true && existing.status === 'DRAFT'

    // Old entries are not rechecked: the floor runs only when the request carries new activities.
    if (data.activities) data.activities = await applyWithdrawalFloor(data.activities, this.pesticides, htxProfileId)

    if (submitsDraft && existing.submitted_role === 'OFFICER' && actor) {
      data.submitted_by_id = actor.id
      data.submitted_role = 'FARMER'
      data.performed_by = actor.name
    }
    return this.journalPort.update(id, data, returned || submitsDraft)
  }
}
