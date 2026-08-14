// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { LotTraceData } from '@/domain/entities/lot-trace-data'
import { NotFoundError } from '@/domain/errors'

export class GetLotTraceDataUseCase {
  constructor(private readonly repo: LotTraceRepository) {}

  async execute(lot_code: string): Promise<LotTraceData> {
    const data = await this.repo.getLotByCode(lot_code)
    if (!data) throw new NotFoundError(`Lot ${lot_code} not found`)
    return data
  }
}
