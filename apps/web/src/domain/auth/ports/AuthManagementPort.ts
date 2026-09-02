// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface RegisterData {
  fullName: string;
  phone: string;
  pin: string;
  htxId: string;
}

export interface AuthManagementPort {
  /**
   * Register a new farmer (with 'farmer' role).
   * @param data User information
   * @param enabled Set to false if the user requires approval
   * @returns Created user ID (e.g. from Keycloak)
   * @throws Error if phone is already taken
   */
  registerFarmer(data: RegisterData, enabled: boolean): Promise<string>;
  
  listUsersByRole(role: string): Promise<any[]>;
  updateUserStatus(userId: string, enabled: boolean): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}
