// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { AuthManagementPort } from '@/domain/auth/ports/auth-management.port'
import { HouseholdPort } from '@/domain/farm/ports/HouseholdPort'
import { HtxProfilePort } from '@/domain/farm/ports/HtxProfilePort'
import { ValidationError } from '@/domain/errors'

export interface InviteMemberRequest {
  fullName: string
  phone: string
  pin: string
  role: string
  address?: string
}

export interface InviteMemberResponse {
  keycloakUserId: string
  householdId: string | null
}

export class InviteMemberUseCase {
  constructor(
    private readonly authPort: AuthManagementPort,
    private readonly householdPort: HouseholdPort,
    private readonly htxProfilePort: HtxProfilePort // assuming we need this to fetch the HTX Profile
  ) {}

  async execute(request: InviteMemberRequest, inviterHtxCode: string): Promise<InviteMemberResponse> {
    const htx = await this.htxProfilePort.findByCode(inviterHtxCode)
    if (!htx) {
      throw new Error('HTX_NOT_FOUND')
    }

    // The phone is globally unique: refuse here, before the Keycloak user exists.
    if (request.role === 'farmer' && await this.householdPort.isPhoneTaken(request.phone, htx.id)) {
      throw new ValidationError('Số điện thoại này đã được đăng ký!')
    }

    // Step 1: Create Keycloak user with specified role
    const keycloakUserId = await this.authPort.registerUser({
      fullName: request.fullName,
      phone: request.phone,
      pin: request.pin,
      htxId: htx.id,
      htxCode: inviterHtxCode,
    }, request.role, true) // enabled = true, login được ngay

    // Step 2: Create or Update Household in DB (only for farmer)
    let householdId: string | null = null
    if (request.role === 'farmer') {
      const orphanedHousehold = await this.householdPort.findOrphanedByPhone(request.phone, htx.id)

      if (orphanedHousehold) {
        await this.householdPort.linkToKeycloak(orphanedHousehold.id, keycloakUserId)
        householdId = orphanedHousehold.id
      } else {
        const household = await this.householdPort.create({
          household_code: request.phone,
          owner_name: request.fullName,
          phone: request.phone,
          address: request.address,
          htx_profile_id: htx.id,
        })
        await this.householdPort.linkToKeycloak(household.id, keycloakUserId) // Create returns household without keycloak id initially in prisma repo, so link it or we change create
        householdId = household.id
      }
    }

    return {
      keycloakUserId,
      householdId,
    }
  }
}
