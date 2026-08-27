// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { Metadata } from 'next';
import { MemberList } from './_components/member-list';

export const metadata: Metadata = {
  title: 'Member Management | DX-AgriMarket',
  description: 'Manage cooperative members and invitations.',
};

export default function ManagerMembersPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Thành viên hợp tác xã
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Quản lý danh sách thành viên, trạng thái hoạt động và mời thành viên mới.
        </p>
      </header>

      <section>
        <MemberList />
      </section>
    </div>
  );
}
