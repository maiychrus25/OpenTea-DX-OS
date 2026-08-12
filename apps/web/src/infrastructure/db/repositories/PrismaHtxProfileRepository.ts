import type { PrismaClient } from '@prisma/client'
import type { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import type { HtxProfile } from '@/domain/profile/entities/HtxProfile'
import type { HtxProfileUpdateInput } from '@/domain/profile/schemas/htxProfileSchema'
import { NotFoundError } from '@/domain/errors'

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

  async updateProfile(data: HtxProfileUpdateInput): Promise<HtxProfile> {
    // HTX Profile is singleton — find the only record first
    const existing = await this.prisma.htxProfile.findFirst({
      orderBy: { created_at: 'asc' },
      select: { id: true },
    })

    if (!existing) {
      throw new NotFoundError('HTX Profile not found')
    }

    const updatedProfile = await this.prisma.htxProfile.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        address: data.address,
        contact_phone: data.contact_phone,
        contact_email: data.contact_email,
        crop_types: data.crop_types ?? [],
        season_label: data.season_label,
      },
    })

    return {
      id: updatedProfile.id,
      name: updatedProfile.name,
      address: updatedProfile.address,
      contact_phone: updatedProfile.contact_phone,
      contact_email: updatedProfile.contact_email,
      crop_types: updatedProfile.crop_types,
      season_label: updatedProfile.season_label,
      htx_code: updatedProfile.htx_code,
      total_area_ha: Number(updatedProfile.total_area_ha),
    }
  }
}
