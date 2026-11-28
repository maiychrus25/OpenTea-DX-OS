// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { Home } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { ZaloConsentControl } from '@/components/features/zalo/ZaloConsentControl'

export default async function ManagerHouseholdPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return (
    <div className={kit.page}>
      <PageHeader icon={<Home size={28} />} title="Chi tiết nông hộ" description="Ghi nhận việc hộ có nhận tin Zalo từ HTX hay không." />
      <ZaloConsentControl householdId={id} />
    </div>
  )
}
