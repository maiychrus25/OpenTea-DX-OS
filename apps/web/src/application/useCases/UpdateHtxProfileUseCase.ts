import type { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import type { HtxProfileUpdateInput } from '@/domain/profile/schemas/htxProfileSchema'

export class UpdateHtxProfileUseCase {
  constructor(private readonly htxProfileRepo: HtxProfileRepository) {}

  async execute(data: HtxProfileUpdateInput): Promise<HtxProfile> {
    const updatedProfile = await this.htxProfileRepo.updateProfile(data)
    return updatedProfile
  }
}
