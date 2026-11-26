// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PageHeader } from '@/components/ui/PageHeader'
import { UserRound } from 'lucide-react'
import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccountSection } from '@/components/ui'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import styles from './page.module.css'

export default async function OfficerProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className={styles.container}>
      <PageHeader
        icon={<UserRound size={28} />}
        title="Tài khoản của tôi"
        description="Quản lý thông tin cá nhân và cài đặt bảo mật."
      />

      <TelegramLinkCard role="officer" />

      <AccountSection name={session.user.name || 'Cán bộ Kỹ thuật'} role="officer" />
    </div>
  )
}
