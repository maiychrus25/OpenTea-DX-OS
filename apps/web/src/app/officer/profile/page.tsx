// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { AccountSection } from '@/components/ui'
import styles from './page.module.css'

export default function OfficerProfilePage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Tài khoản của tôi</h1>
        <p className={styles.description}>Quản lý thông tin cá nhân và cài đặt bảo mật.</p>
      </div>

      <AccountSection name="Trần Thị Lan" role="officer" />
    </div>
  )
}
