// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Scale } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { WeighingStation } from '@/components/features/weighing/WeighingStation'

export default function WeighingPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Scale size={28} />} title="Bàn cân" description="Lập phiếu cân búp tươi theo hộ và nương." />
      <WeighingStation />
    </div>
  )
}
