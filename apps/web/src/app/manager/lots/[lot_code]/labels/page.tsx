// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { notFound, redirect } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { LotLabelSheet } from '@/components/features/lots/LotLabelSheet'
import { loadLotTraceOrNull } from '@/lib/lots/lot-trace-page'

export default async function ManagerLotLabelsPage({ params }: { params: { lot_code: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') redirect('/login')

  const trace = await loadLotTraceOrNull(params.lot_code)
  if (!trace) notFound()

  return (
    <div className={kit.page}>
      <PageHeader icon={<QrCode size={28} />} title={`In tem lô ${trace.lot_code}`} description="Tem có mã QR dẫn tới trang truy xuất công khai của lô." />
      <LotLabelSheet lotCode={trace.lot_code} weightKg={trace.total_weight_kg} dryGrade={trace.dry_grade ?? null} htxName={trace.htx_name} />
    </div>
  )
}
