import type { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import { NotFoundError } from '@/domain/errors'

export class GetHtxProfileUseCase {
  constructor(private readonly profileRepo: HtxProfileRepository) {}

  async execute(): Promise<HtxProfile> {
    const profile = await this.profileRepo.getProfile()
    if (!profile) {
      throw new NotFoundError('HTX Profile not found')
    }
    return profile
  }
}
