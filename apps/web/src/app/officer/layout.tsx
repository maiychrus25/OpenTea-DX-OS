// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Home, Sprout, BookOpen, HeartPulse, Bell, FileText } from 'lucide-react'

export default async function OfficerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'officer') redirect('/unauthorized')

  const navItems = [
    { label: 'Tổng quan', href: '/officer/dashboard', icon: <Home size={20} /> },
    { label: 'Vùng trồng', href: '/officer/farm-zones', icon: <Sprout size={20} /> },
    { label: 'Nhật ký', href: '/officer/journals', icon: <BookOpen size={20} /> },
    { label: 'Chẩn đoán bệnh', href: '/officer/diagnosis', icon: <HeartPulse size={20} /> },
    { label: 'Thông báo', href: '/officer/notifications', icon: <Bell size={20} /> },
    { label: 'Tài liệu', href: '/officer/documents', icon: <FileText size={20} /> },
  ]

  return (
    <AppShell role="officer" userName={session.user.name || 'Cán bộ Kỹ thuật'} navItems={navItems}>
      {children}
    </AppShell>
  )
}
