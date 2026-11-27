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
  return <MemberList />;
}
