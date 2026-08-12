import { type HtxProfile } from '@/domain/profile/entities/HtxProfile'
import { type HtxProfileUpdateInput } from '@/domain/profile/schemas/htxProfileSchema'

export interface HtxProfileRepository {
  getProfile(): Promise<HtxProfile | null>
  updateProfile(data: HtxProfileUpdateInput): Promise<HtxProfile>
}
