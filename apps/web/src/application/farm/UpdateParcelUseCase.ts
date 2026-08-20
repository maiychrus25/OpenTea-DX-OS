// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, CreateParcelData } from '@/domain/farm/ports/ParcelPort'
import { NotFoundError } from '@/domain/errors'

export class UpdateParcelUseCase {
  constructor(private readonly parcelPort: ParcelPort) {}

  async execute(id: string, data: Partial<CreateParcelData>) {
    const existing = await this.parcelPort.findById(id)
    if (!existing) throw new NotFoundError('Parcel not found')
    return this.parcelPort.update(id, data)
  }
}
