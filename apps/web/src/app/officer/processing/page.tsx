// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { Flame } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { ProcessingList } from '@/components/features/processing/ProcessingList'
import { ForecastBlock } from '@/components/features/forecast/ForecastBlock'
import { forecastForHtx } from '@/lib/forecast/forecast-page'

export default async function OfficerProcessingPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') redirect('/login')
  const forecast = await forecastForHtx(session.user.htxCode)

  return (
    <div className={kit.page}>
      <PageHeader icon={<Flame size={28} />} title="Xưởng sao sấy" description="Mẻ sao sấy: gom phiếu cân búp, nhập sản lượng chè khô và kiểm tỷ lệ tươi : khô." />
      <ForecastBlock forecast={forecast} />
      <ProcessingList basePath="/officer" />
    </div>
  )
}
