// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { AuthManagementPort, RegisterData } from '@/domain/auth/ports/auth-management.port'

import { HouseholdPort } from '@/domain/farm/ports/HouseholdPort'
import { ValidationError } from '@/domain/errors'

export class RegisterFarmerUseCase {
  constructor(
    private readonly authPort: AuthManagementPort,
    private readonly householdPort: HouseholdPort
  ) {}

  async execute(data: RegisterData): Promise<{ userId: string }> {
    // Basic validations
    if (!data.phone || data.phone.length < 10) {
      throw new Error('Số điện thoại không hợp lệ')
    }
    if (!data.pin || data.pin.length !== 6) {
      throw new Error('Mã PIN phải có 6 chữ số')
    }
    if (!data.fullName) {
      throw new Error('Họ và tên không được để trống')
    }
    if (!data.htxId) {
      throw new Error('Hợp tác xã không được để trống')
    }

    // The phone is globally unique: refuse here, before the Keycloak user exists.
    if (await this.householdPort.isPhoneTaken(data.phone, data.htxId)) {
      throw new ValidationError('Số điện thoại này đã được đăng ký!')
    }

    // Call adapter to create user in Keycloak with enabled: false (Pending Approval)
    const userId = await this.authPort.registerFarmer(data, false)

    // Step 2: Create or Update Household in DB (only for farmer)
    const orphanedHousehold = await this.householdPort.findOrphanedByPhone(data.phone, data.htxId)
    if (orphanedHousehold) {
      await this.householdPort.linkToKeycloak(orphanedHousehold.id, userId)
    } else {
      const household = await this.householdPort.create({
        household_code: data.phone,
        owner_name: data.fullName,
        phone: data.phone,
        address: undefined, // Farmer sets this later or we can add to register form
        htx_profile_id: data.htxId,
      })
      await this.householdPort.linkToKeycloak(household.id, userId)
    }

    return { userId }
  }
}
