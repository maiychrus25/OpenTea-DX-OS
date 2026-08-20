// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { NotFoundError } from '@/domain/errors'

export class DeleteParcelUseCase {
  constructor(private readonly parcelPort: ParcelPort) {}

  async execute(id: string) {
    const existing = await this.parcelPort.findById(id)
    if (!existing) throw new NotFoundError('Parcel not found')
    return this.parcelPort.delete(id)
  }
}
