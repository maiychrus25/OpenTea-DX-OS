// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import kit from '@/components/features/dashboard/page-kit.module.css'
import { ZaloTemplatesForm } from './_components/ZaloTemplatesForm'
import { ZaloCredentialsForm } from './_components/ZaloCredentialsForm'

export const dynamic = 'force-dynamic'

export default async function PlatformZaloPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'platform_admin') redirect('/unauthorized')

  return (
    <div className={kit.page}>
      <PageHeader
        icon={<MessageSquare size={28} />}
        title="Zalo"
        description="Mẫu tin ZNS của nền tảng và token của Official Account dùng chung."
      />
      <ZaloTemplatesForm />
      <ZaloCredentialsForm />
    </div>
  )
}
