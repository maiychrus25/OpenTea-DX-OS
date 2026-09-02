// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { AuthManagementPort, RegisterData } from '@/domain/auth/ports/AuthManagementPort'

export class RegisterFarmerUseCase {
  constructor(private readonly authPort: AuthManagementPort) {}

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

    // Call adapter to create user in Keycloak with enabled: false (Pending Approval)
    const userId = await this.authPort.registerFarmer(data, false)

    return { userId }
  }
}
