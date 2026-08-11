import type { PrismaClient } from '@prisma/client'
import type { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'

export class PrismaHtxProfileRepository implements HtxProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getProfile(): Promise<HtxProfile | null> {
    // HtxProfile is a singleton table — findFirst() returns the only row
    const profile = await this.prisma.htxProfile.findFirst({
      orderBy: { created_at: 'asc' },
    })
    if (!profile) return null
    return {
      id: profile.id,
      name: profile.name,
      address: profile.address,
      contact_phone: profile.contact_phone,
      contact_email: profile.contact_email,
      crop_types: profile.crop_types,
      season_label: profile.season_label,
      htx_code: profile.htx_code,
      total_area_ha: Number(profile.total_area_ha),
    }
  }
}
