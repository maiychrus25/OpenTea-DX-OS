// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NoHtxNotice } from '@/components/layout/NoHtxNotice'
import { Home, Map, FileText, PackageCheck, Stethoscope, FolderOpen, Bot, MessageCircle, User, Users, Bell, Calendar } from 'lucide-react'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'

export default async function OfficerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'officer') redirect('/unauthorized')

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  // Without an HTX the pages would only show empty data; the shell stays so sign-out is reachable.
  const htxProfile = session.user.htxCode ? await profileRepo.getProfile(session.user.htxCode) : null

  const navItems = [
    { label: 'Tổng quan', href: '/officer/dashboard', icon: <Home size={20} /> },
    { label: 'Lịch vụ mùa', href: '/officer/schedule', icon: <Calendar size={20} /> },
    { label: 'Bản đồ', href: '/officer/farm-zones', icon: <Map size={20} /> },
    { label: 'Nông hộ', href: '/officer/households', icon: <Users size={20} /> },
    { label: 'Nhật ký', href: '/officer/journal', icon: <FileText size={20} /> },
    { label: 'Lô hàng', href: '/officer/lots', icon: <PackageCheck size={20} /> },
    { label: 'Nhật ký bệnh', href: '/officer/diseases', icon: <Stethoscope size={20} /> },
    { label: 'Tài liệu', href: '/officer/documents', icon: <FolderOpen size={20} /> },
    { label: 'Chatbot KT', href: '/officer/chat', icon: <MessageCircle size={20} /> },
    { label: 'Trợ lý TT', href: '/officer/assistant', icon: <Bot size={20} /> },
    { label: 'Thông báo', href: '/officer/notifications', icon: <Bell size={20} /> },
    { label: 'Tài khoản', href: '/officer/profile', icon: <User size={20} /> },
  ]

  return (
    <AppShell 
      role="officer" 
      userName={session.user.name || 'Cán bộ Kỹ thuật'} 
      navItems={navItems}
      htxName={htxProfile?.name || 'Chưa cập nhật'}
      htxLocation={htxProfile?.address || ''}
    >
      {htxProfile ? children : <NoHtxNotice />}
    </AppShell>
  )
}

