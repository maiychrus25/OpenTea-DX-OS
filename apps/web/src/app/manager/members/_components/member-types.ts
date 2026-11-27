// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export type MemberStatus = 'ACTIVE' | 'PENDING' | 'LOCKED';
export type MemberRole = 'FARMER' | 'OFFICER' | 'ACCOUNTANT' | 'MANAGER';

/** The roles a manager can give or take. manager itself is never edited here. */
export const EDITABLE_ROLES = [
  { value: 'farmer', label: 'Nông dân', description: 'Ghi nhật ký canh tác, xem thửa đất, chẩn đoán bệnh' },
  { value: 'officer', label: 'Cán bộ kỹ thuật', description: 'Quản lý nông hộ, duyệt nhật ký, tạo lô hàng' },
  { value: 'accountant', label: 'Kế toán', description: 'Bàn cân, giá thu mua, quyết toán' },
] as const;

export const NO_ROLE_MESSAGE = 'Chọn ít nhất một vai';

export const ROLE_LABELS: Record<string, string> = {
  manager: 'Trưởng HTX',
  officer: 'Cán bộ kỹ thuật',
  accountant: 'Kế toán',
  farmer: 'Nông dân',
};

export interface Member {
  id: string;
  name: string;
  full_name?: string;
  email: string;
  phone: string;
  role: MemberRole;
  /** Every role of the person (lower case), when the server sends them. */
  roles?: string[];
  status: MemberStatus;
  joinedAt?: string;
  invitedAt?: string;
}
