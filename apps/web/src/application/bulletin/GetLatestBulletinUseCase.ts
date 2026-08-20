// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { IBulletinRepository, Bulletin } from '@/domain/repositories/IBulletinRepository'
import { NotFoundError } from '@/domain/errors/NotFoundError'

export class GetLatestBulletinUseCase {
  constructor(private readonly bulletinRepo: IBulletinRepository) {}

  async execute(commodity: string): Promise<Bulletin> {
    const bulletin = await this.bulletinRepo.getLatestBulletin(commodity)
    
    if (!bulletin) {
      throw new NotFoundError(`Không tìm thấy bản tin cho nông sản: ${commodity}`)
    }

    return bulletin
  }
}
