// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ForbiddenError } from '@/domain/errors'
import type { DryTeaGrade } from '@/domain/processing/grades'
import type { DryStockRow, LotFromBatchesPort } from '@/domain/processing/ports/LotFromBatchesPort'

/** The dry tea left in finished batches, oldest batch first. */
export class DryStockUseCase {
  constructor(private readonly port: LotFromBatchesPort) {}

  async execute(actor: { role: string; htxProfileId: string }, grade?: DryTeaGrade): Promise<DryStockRow[]> {
    if (actor.role !== 'officer' && actor.role !== 'manager') throw new ForbiddenError('Forbidden')
    return this.port.stock(actor.htxProfileId, grade)
  }
}
