// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Home, Map, FileText, PackageCheck, Stethoscope, FolderOpen, Bot, User, Users, Bell } from 'lucide-react'

export default async function OfficerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'officer') redirect('/unauthorized')

  const navItems = [
    { label: 'Tổng quan', href: '/officer/dashboard', icon: <Home size={20} />, badge: 5 },
    { label: 'Bản đồ', href: '/officer/map', icon: <Map size={20} /> },
    { label: 'Nông hộ', href: '/officer/households', icon: <Users size={20} /> },
    { label: 'Nhật ký', href: '/officer/journal', icon: <FileText size={20} /> },
    { label: 'Lô hàng', href: '/officer/lots', icon: <PackageCheck size={20} /> },
    { label: 'Nhật ký bệnh', href: '/officer/disease', icon: <Stethoscope size={20} /> },
    { label: 'Tài liệu', href: '/officer/documents', icon: <FolderOpen size={20} /> },
    { label: 'Trợ lý', href: '/officer/assistant', icon: <Bot size={20} /> },
    { label: 'Thông báo', href: '/officer/notifications', icon: <Bell size={20} /> },
    { label: 'Tài khoản', href: '/officer/account', icon: <User size={20} /> },
  ]

  return (
    <AppShell role="officer" userName={session.user.name || 'Cán bộ Kỹ thuật'} navItems={navItems}>
      {children}
    </AppShell>
  )
}
