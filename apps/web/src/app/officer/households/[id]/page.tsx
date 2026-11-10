// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

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
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Chi tiết Nông hộ
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Thông tin chi tiết, danh sách thửa đất và lịch sử sản xuất của nông hộ.
        </p>
      </header>

      <section>
        <HouseholdProfile id={params.id} />
      </section>
    </div>
  );
}
