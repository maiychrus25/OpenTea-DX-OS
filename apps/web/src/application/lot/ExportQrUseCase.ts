// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { LotPort } from '@/domain/lot/ports/LotPort'
import { LotTraceRepository } from '@/domain/repositories/lot-trace-repository'
import { NotFoundError, DomainError } from '@/domain/errors'

export class ExportQrUseCase {
  constructor(
    private readonly lotPort: LotPort,
    private readonly traceRepo: LotTraceRepository,
  ) {}

  async execute(lotId: string) {
    const lot = await this.lotPort.findById(lotId)
    if (!lot) throw new NotFoundError('Lot not found')
    if (lot.status === 'QR_EXPORTED') throw new DomainError('Lot already exported')

    // Get trace data snapshot
    const traceData = await this.traceRepo.getLotByCode(lot.lot_code)
    if (!traceData) throw new NotFoundError('Trace data not found')

    // Export QR with immutable snapshot
    return this.lotPort.exportQr(lotId, traceData)
  }
}
