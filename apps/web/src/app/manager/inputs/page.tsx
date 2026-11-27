// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Boxes } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { InputsPanel } from '@/components/features/ledger/InputsPanel'

export default function ManagerInputsPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Boxes size={28} />} title="Vật tư" description="Danh mục vật tư, cấp ứng cho hộ và tài khoản nhận tiền." />
      <InputsPanel />
    </div>
  )
}
