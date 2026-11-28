// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { Award } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/farmer-web/kit.module.css'
import { CertificatesPanel } from '@/components/features/certificates/CertificatesPanel'

export default function ManagerCertificatesPage() {
  return (
    <div className={kit.page}>
      <PageHeader icon={<Award size={28} />} title="Chứng nhận" description="Chứng nhận của HTX: VietGAP, OCOP, hữu cơ. Lô xuất QR chỉ gắn chứng nhận còn hiệu lực." />
      <CertificatesPanel canRevoke={true} />
    </div>
  )
}
