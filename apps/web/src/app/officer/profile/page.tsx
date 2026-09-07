// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AccountSection } from '@/components/ui'
import styles from './page.module.css'

export default async function OfficerProfilePage() {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tài khoản của tôi</h1>
        <p className={styles.description}>Quản lý thông tin cá nhân và cài đặt bảo mật.</p>
      </div>

      <AccountSection name={session.user.name || 'Cán bộ Kỹ thuật'} role="officer" />
    </div>
  )
}
