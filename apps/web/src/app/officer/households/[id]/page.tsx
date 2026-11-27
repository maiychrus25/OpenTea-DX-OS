// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PageHeader } from '@/components/ui/PageHeader'
import { Home } from 'lucide-react'
import React from 'react';
import { Metadata } from 'next';
import { HouseholdProfile } from './_components/household-profile';

export const metadata: Metadata = {
  title: 'Household Profile',
  description: 'View household details and production history.',
};

export default async function OfficerHouseholdProfilePage(
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Home size={28} />}
        title="Chi tiết Nông hộ"
        description="Thông tin chi tiết, danh sách thửa đất và lịch sử sản xuất của nông hộ."
      />

      <section>
        <HouseholdProfile id={params.id} />
      </section>
    </div>
  );
}
