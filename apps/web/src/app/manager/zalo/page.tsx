// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { MessageSquare } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { ZaloSettingsPanel } from './_components/ZaloSettingsPanel'
import { ZaloDeliveriesList } from './_components/ZaloDeliveriesList'

export default function ManagerZaloPage() {
  return (
    <div className={kit.page}>
      <PageHeader
        icon={<MessageSquare size={28} />}
        title="Thông báo Zalo"
        description="Bật hoặc tắt việc gửi tin Zalo cho các hộ, và xem tin đã gửi."
      />
      <ZaloSettingsPanel />
      <ZaloDeliveriesList />
    </div>
  )
}
