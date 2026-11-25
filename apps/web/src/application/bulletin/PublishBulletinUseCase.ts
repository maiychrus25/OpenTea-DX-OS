// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { IBulletinRepository, PublishBulletinRecord } from '@/domain/repositories/IBulletinRepository'

/** Stores a bulletin approved by a manager. Drafts are not stored: the text lives in the proposal until then (spec §9). */
export class PublishBulletinUseCase {
  constructor(private readonly bulletinRepo: Pick<IBulletinRepository, 'publish'>) {}

  execute(htxCode: string, record: PublishBulletinRecord): Promise<{ id: string }> {
    return this.bulletinRepo.publish(htxCode, record)
  }
}
