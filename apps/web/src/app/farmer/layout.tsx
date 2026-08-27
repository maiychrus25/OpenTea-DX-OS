// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Home, FileText, Stethoscope, Sprout, User, Bell } from 'lucide-react'

export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'farmer') redirect('/unauthorized')

  const navItems = [
    { label: 'Tổng quan', href: '/farmer/dashboard', icon: <Home size={20} /> },
    { label: 'Nhật ký', href: '/farmer/journal', icon: <FileText size={20} /> },
    { label: 'Chẩn đoán', href: '/farmer/diagnosis', icon: <Stethoscope size={20} /> },
    { label: 'Thửa của tôi', href: '/farmer/parcels', icon: <Sprout size={20} /> },
    { label: 'Bản tin & thông báo', href: '/farmer/bulletin-notifications', icon: <Bell size={20} /> },
    { label: 'Tài khoản', href: '/farmer/account', icon: <User size={20} /> },
  ]

  return (
    <AppShell role="farmer" userName={session.user.name || 'Nông dân'} navItems={navItems} hideSidebar={true}>
      {children}
    </AppShell>
  )
}
