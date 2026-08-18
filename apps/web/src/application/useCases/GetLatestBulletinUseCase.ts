// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { IBulletinRepository, Bulletin } from '../../domain/repositories/IBulletinRepository';

export class GetLatestBulletinUseCase {
  constructor(private readonly repository: IBulletinRepository) {}

  async execute(commodity: string): Promise<Bulletin | null> {
    return this.repository.getLatestBulletin(commodity);
  }
}
