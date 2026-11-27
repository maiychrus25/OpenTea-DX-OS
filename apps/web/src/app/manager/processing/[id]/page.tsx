// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Flame } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { BatchDetailView } from '@/components/features/processing/BatchDetailView'

export default function ManagerProcessingBatchPage({ params }: { params: { id: string } }) {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Flame size={28} />} title="Mẻ sao sấy" description="Phiếu cân trong mẻ, sản lượng theo hạng và tỷ lệ tươi : khô." />
      <BatchDetailView batchId={params.id} listHref="/manager/processing" />
    </div>
  )
}
