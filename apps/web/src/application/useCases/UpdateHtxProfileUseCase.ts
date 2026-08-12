import type { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import type { HtxProfileUpdateInput } from '@/lib/validations/htx-profile.schema'

export class UpdateHtxProfileUseCase {
  constructor(private readonly htxProfileRepo: HtxProfileRepository) {}

  async execute(data: HtxProfileUpdateInput): Promise<HtxProfile> {
    const updatedProfile = await this.htxProfileRepo.updateProfile(data)
    return updatedProfile
  }
}
