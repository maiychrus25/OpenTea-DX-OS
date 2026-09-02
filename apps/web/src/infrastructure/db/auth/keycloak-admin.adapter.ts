// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { AuthManagementPort, RegisterData, MemberData } from '@/domain/auth/ports/auth-management.port'
import { logger } from '@/lib/logger'

export interface KeycloakUserResponse {
  id: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  createdTimestamp?: number;
  attributes?: {
    fullName?: string[];
    phone?: string[];
    htxId?: string[];
    [key: string]: any;
  };
}

export class KeycloakAdminAdapter implements AuthManagementPort {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly adminUser: string;
  private readonly adminPass: string;

  constructor() {
    this.baseUrl = process.env.KEYCLOAK_INTERNAL_URL?.replace('/realms/agrimarket', '') || 'http://keycloak:8080';
    this.realm = 'agrimarket';
    this.adminUser = process.env.KC_BOOTSTRAP_ADMIN_USERNAME || 'admin';
    this.adminPass = process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || 'admin';
  }

  private async getAdminToken(): Promise<string> {
    const params = new URLSearchParams();
    params.append('client_id', 'admin-cli');
    params.append('username', this.adminUser);
    params.append('password', this.adminPass);
    params.append('grant_type', 'password');

    const res = await fetch(`${this.baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store'
    });

    if (!res.ok) {
      const text = await res.text();
      logger.error('Failed to get Keycloak admin token', { status: res.status, text });
      throw new Error('Could not authenticate with Keycloak Admin');
    }

    const data = await res.json();
    return data.access_token;
  }

  async registerFarmer(data: RegisterData, enabled: boolean): Promise<string> {
    const token = await this.getAdminToken();
    const usersUrl = `${this.baseUrl}/admin/realms/${this.realm}/users`;

    // 1. Create User
    const userPayload = {
      username: data.phone,
      enabled: enabled,
      attributes: {
        fullName: [data.fullName],
        htxId: [data.htxId],
        phone: [data.phone]
      },
      credentials: [
        {
          type: 'password',
          value: data.pin,
          temporary: false
        }
      ]
    };

    const createRes = await fetch(usersUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(userPayload)
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      logger.error('Failed to create Keycloak user', { status: createRes.status, errorText });
      if (createRes.status === 409) {
        throw new Error('Số điện thoại này đã được đăng ký!');
      }
      throw new Error('Lỗi hệ thống khi tạo tài khoản');
    }

    // 2. Extract new user ID from Location header
    const location = createRes.headers.get('location');
    if (!location) {
      throw new Error('Could not retrieve created user ID from Keycloak');
    }
    const userId = location.substring(location.lastIndexOf('/') + 1);

    // 3. Assign 'farmer' role
    await this.assignRealmRole(userId, 'farmer', token);

    return userId;
  }

  private async assignRealmRole(userId: string, roleName: string, token: string): Promise<void> {
    // First, find the role ID for the given roleName
    const rolesUrl = `${this.baseUrl}/admin/realms/${this.realm}/roles/${roleName}`;
    const roleRes = await fetch(rolesUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!roleRes.ok) {
      throw new Error(`Could not find role ${roleName} in realm`);
    }

    const roleData = await roleRes.json();

    // Then, assign it to the user
    const assignUrl = `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}/role-mappings/realm`;
    const assignRes = await fetch(assignUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify([roleData]) // Array of roles
    });

    if (!assignRes.ok) {
      logger.error('Failed to assign role', { status: assignRes.status });
      throw new Error('Could not assign role to user');
    }
  }

  async listUsersByRole(role: string): Promise<MemberData[]> {
    const token = await this.getAdminToken();
    const usersUrl = `${this.baseUrl}/admin/realms/${this.realm}/roles/${role}/users`;

    const res = await fetch(usersUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      logger.error('Failed to list users by role', { status: res.status });
      throw new Error('Could not list users');
    }

    const users = await res.json();
    return users.map((u: KeycloakUserResponse) => ({
      id: u.id,
      email: u.email || u.username,
      full_name: u.attributes?.fullName?.[0] || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Chưa cập nhật',
      role: role.toUpperCase(),
      is_active: u.enabled, // enabled = true means ACTIVE, false means PENDING
      phone: u.attributes?.phone?.[0] || 'Chưa cập nhật',
      household_id: u.attributes?.htxId?.[0] || null, // we repurpose household_id in UI as htxId for now
      createdTimestamp: u.createdTimestamp,
    }));
  }

  async updateUserStatus(userId: string, enabled: boolean): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ enabled })
    });

    if (!res.ok) {
      logger.error('Failed to update user status', { status: res.status, userId });
      throw new Error('Could not update user status');
    }
  }

  async deleteUser(userId: string): Promise<void> {
    const token = await this.getAdminToken();
    const url = `${this.baseUrl}/admin/realms/${this.realm}/users/${userId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      logger.error('Failed to delete user', { status: res.status, userId });
      throw new Error('Could not delete user');
    }
  }
}
