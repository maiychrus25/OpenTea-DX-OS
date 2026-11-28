// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { Metadata } from 'next'
import dynamic from 'next/dynamic'

const PartnerMap = dynamic(() => import('@/components/features/partner-map/PartnerMap'), { ssr: false })

export const metadata: Metadata = {
  title: 'Bản đồ Đối tác',
  description: 'Quản lý bản đồ đối tác, người mua, nhà kho, đại lý.',
}

export default function ManagerPartnerMapPage() {
  return <PartnerMap />
}
