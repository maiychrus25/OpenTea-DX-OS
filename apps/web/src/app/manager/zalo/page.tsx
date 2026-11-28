// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import kit from '@/components/features/dashboard/page-kit.module.css'
import { ZaloSettingsPanel } from './_components/ZaloSettingsPanel'
import { ZaloDeliveriesList } from './_components/ZaloDeliveriesList'

export default function ManagerZaloPage() {
  return (
    <div className={kit.page}>
      <ZaloSettingsPanel />
      <ZaloDeliveriesList />
    </div>
  )
}
