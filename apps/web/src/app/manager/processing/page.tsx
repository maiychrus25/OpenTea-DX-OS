// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Flame } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { ProcessingList } from '@/components/features/processing/ProcessingList'

export default function ManagerProcessingPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Flame size={28} />} title="Xưởng sao sấy" description="Mẻ sao sấy: gom phiếu cân búp, nhập sản lượng chè khô và kiểm tỷ lệ tươi : khô." />
      <ProcessingList basePath="/manager" />
    </div>
  )
}
