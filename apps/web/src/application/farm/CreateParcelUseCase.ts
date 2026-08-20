// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ParcelPort, CreateParcelData } from '@/domain/farm/ports/ParcelPort'

export class CreateParcelUseCase {
  constructor(private readonly parcelPort: ParcelPort) {}

  async execute(data: CreateParcelData) {
    return this.parcelPort.create(data)
  }
}
