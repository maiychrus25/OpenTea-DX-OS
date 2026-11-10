// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react';
import { Metadata } from 'next';
import { MemberList } from './_components/member-list';

export const metadata: Metadata = {
  title: 'Member Management',
  description: 'Manage cooperative members and invitations.',
};

export default function ManagerMembersPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink-primary)]">
          Thành viên hợp tác xã
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-secondary)]">
          Quản lý danh sách thành viên, trạng thái hoạt động và mời thành viên mới.
        </p>
      </header>

      <section>
        <MemberList />
      </section>
    </div>
  );
}
