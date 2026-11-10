// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import type { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import { NotFoundError } from '@/domain/errors'

export class GetHtxProfileUseCase {
  constructor(private readonly profileRepo: HtxProfileRepository) {}

  async execute(htxCode: string): Promise<HtxProfile> {
    const profile = await this.profileRepo.getProfile(htxCode)
    if (!profile) {
      throw new NotFoundError('HTX Profile not found')
    }
    return profile
  }
}
