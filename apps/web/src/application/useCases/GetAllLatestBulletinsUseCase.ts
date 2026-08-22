// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { IBulletinRepository, Bulletin } from '../../domain/repositories/IBulletinRepository';

export class GetAllLatestBulletinsUseCase {
  constructor(private repository: IBulletinRepository) {}

  async execute(): Promise<Bulletin[]> {
    return this.repository.getAllLatestBulletins();
  }
}
