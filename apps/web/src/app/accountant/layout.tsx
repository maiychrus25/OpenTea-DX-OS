// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NoHtxNotice } from '@/components/layout/NoHtxNotice'
import { Home, Bell, User, Scale, Receipt, Boxes, Wallet } from 'lucide-react'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'

export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'accountant') redirect('/unauthorized')

  // Without an HTX the pages would only show empty data; the shell stays so sign-out is reachable.
  const htxProfile = session.user.htxCode ? await new PrismaHtxProfileRepository(prisma).getProfile(session.user.htxCode) : null

  // The weighing, price, supplies and settlement screens join this menu in sub-projects 3 and 4.
  const navItems = [
    { label: 'Tổng quan', href: '/accountant/dashboard', icon: <Home size={20} />, group: 'Vận hành' },
    { label: 'Bàn cân', href: '/accountant/weighing', icon: <Scale size={20} />, group: 'Vận hành' },
    { label: 'Phiếu cân', href: '/accountant/leaf-tickets', icon: <Receipt size={20} />, group: 'Vận hành' },
    { label: 'Vật tư', href: '/accountant/inputs', icon: <Boxes size={20} />, group: 'Vận hành' },
    { label: 'Quyết toán', href: '/accountant/settlements', icon: <Wallet size={20} />, group: 'Vận hành' },
    { label: 'Thông báo', href: '/accountant/notifications', icon: <Bell size={20} />, group: 'Cá nhân' },
    { label: 'Tài khoản', href: '/accountant/profile', icon: <User size={20} />, group: 'Cá nhân' },
  ]

  return (
    <AppShell
      role="accountant"
      roles={session.user.roles}
      userName={session.user.name || 'Kế toán'}
      navItems={navItems}
      htxName={htxProfile?.name || 'Chưa cập nhật'}
      htxLocation={htxProfile?.address || ''}
    >
      {htxProfile ? children : <NoHtxNotice />}
    </AppShell>
  )
}
