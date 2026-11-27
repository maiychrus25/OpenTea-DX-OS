// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type MemberStatus = 'ACTIVE' | 'PENDING' | 'LOCKED';
export type MemberRole = 'FARMER' | 'OFFICER' | 'MANAGER';

export interface Member {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  phone: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt?: string;
  invitedAt?: string;
}
