import { type HtxProfile } from '@/domain/profile/entities/HtxProfile'

export interface HtxProfileRepository {
  getProfile(): Promise<HtxProfile | null>
}
