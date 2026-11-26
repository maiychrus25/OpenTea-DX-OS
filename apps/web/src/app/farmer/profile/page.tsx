// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PageHeader } from '@/components/ui/PageHeader'
import { UserRound } from 'lucide-react'
import React from 'react'
import { AccountSection } from '@/components/ui'
import { TelegramLinkCard } from '@/components/features/telegram/TelegramLinkCard'
import styles from './page.module.css'

export default function FarmerProfilePage() {
  return (
    <div className={styles.container}>
      <PageHeader
        icon={<UserRound size={28} />}
        title="Tài khoản của tôi"
        description="Quản lý thông tin cá nhân và cài đặt bảo mật."
      />

      <TelegramLinkCard role="farmer" />

      <AccountSection name="Lê Văn Bình" role="farmer" />
    </div>
  )
}
