// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export interface RegisterData {
  fullName: string;
  phone: string;
  pin: string;
  htxId: string;
  htxCode: string;
}

export interface MemberData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  phone: string;
  household_id: string | null;
  createdTimestamp: number | undefined;
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
  registerUser(data: RegisterData, role: string, enabled: boolean): Promise<string>;
  
  /** Users holding `role` whose htx_code attribute equals `htxCode`. */
  listUsersByRole(role: string, htxCode: string): Promise<MemberData[]>;
  /** The user's htx_code, or null when the user or the attribute is missing. */
  getUserHtxCode(userId: string): Promise<string | null>;
  updateUserStatus(userId: string, enabled: boolean): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}
