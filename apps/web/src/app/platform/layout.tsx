// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Building2, Leaf, User } from 'lucide-react'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'platform_admin') redirect('/unauthorized')

  const navItems = [
    { label: 'Hợp tác xã', href: '/platform', icon: <Building2 size={20} />, match: ['/platform/htx'], group: 'Nền tảng' },
    { label: 'Danh mục thuốc', href: '/platform/pesticides', icon: <Leaf size={20} />, group: 'Nền tảng' },
    { label: 'Tài khoản', href: '/platform/account', icon: <User size={20} />, group: 'Cá nhân' },
  ]

  return (
    <AppShell role="platform_admin" roles={session.user.roles} userName={session.user.name || 'Quản trị nền tảng'} navItems={navItems}>
      {children}
    </AppShell>
  )
}
