// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { UserRound } from 'lucide-react'
import { auth } from '@/auth'
import { PageHeader } from '@/components/ui/PageHeader'
import { AccountSection } from '@/components/ui'
import styles from '../../officer/profile/page.module.css'

export default async function PlatformAccountPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'platform_admin') redirect('/unauthorized')

  return (
    <div className={styles.container}>
      <PageHeader icon={<UserRound size={28} />} title="Tài khoản của tôi" description="Quản lý thông tin cá nhân và cài đặt bảo mật." />
      <AccountSection name={session.user.name || 'Quản trị nền tảng'} role="platform_admin" />
    </div>
  )
}
