// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type MemberStatus = 'ACTIVE' | 'PENDING' | 'LOCKED';
export type MemberRole = 'FARMER' | 'OFFICER' | 'MANAGER';

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: MemberRole;
  status: MemberStatus;
  joinedAt?: string;
  invitedAt?: string;
}

export const mockMembers: Member[] = [
  {
    id: 'm1',
    name: 'Nguyễn Văn A',
    email: 'nguyenvana@example.com',
    phone: '0901234567',
    role: 'MANAGER',
    status: 'ACTIVE',
    joinedAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'm2',
    name: 'Trần Thị B',
    email: 'tranthib@example.com',
    phone: '0912345678',
    role: 'OFFICER',
    status: 'ACTIVE',
    joinedAt: '2025-02-15T00:00:00Z',
  },
  {
    id: 'm3',
    name: 'Lê Văn C',
    email: 'levanc@example.com',
    phone: '0923456789',
    role: 'FARMER',
    status: 'PENDING',
    invitedAt: '2026-08-20T00:00:00Z',
  },
  {
    id: 'm4',
    name: 'Phạm Thị D',
    email: 'phamthid@example.com',
    phone: '0934567890',
    role: 'FARMER',
    status: 'LOCKED',
    joinedAt: '2024-11-20T00:00:00Z',
  },
];
