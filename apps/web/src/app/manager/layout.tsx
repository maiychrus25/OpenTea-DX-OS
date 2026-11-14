// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NoHtxNotice } from '@/components/layout/NoHtxNotice'
import { Home, Newspaper, MessageCircle, Map as MapIcon, Sprout, Package, Landmark, CheckSquare, Bell, Users, Calendar, Store } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { loadAppNavItems } from '@/lib/apps/app-nav'
import { loadAppFeed } from '@/lib/apps/feed-loader'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'manager') redirect('/unauthorized')

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  // Without an HTX the pages would only show empty data; the shell stays so sign-out is reachable.
  const htxProfile = session.user.htxCode ? await profileRepo.getProfile(session.user.htxCode) : null

  const navItems = [
    { label: 'Tổng quan', href: '/manager/dashboard', icon: <Home size={20} /> },
    { label: 'Lịch thu hái', href: '/manager/schedule', icon: <Calendar size={20} /> },
    { label: 'Quản lý thành viên', href: '/manager/members', icon: <Users size={20} /> },
    { label: 'Bản tin', href: '/manager/bulletin', icon: <Newspaper size={20} /> },
    { label: 'Duyệt nhật ký', href: '/manager/journal-approve', icon: <CheckSquare size={20} /> },
    { label: 'Chatbot', href: '/manager/chat', icon: <MessageCircle size={20} /> },
    { label: 'Bản đồ đối tác', href: '/manager/partner-map', icon: <MapIcon size={20} /> },
    { label: 'Vùng trồng', href: '/manager/farm-zones', icon: <Sprout size={20} /> },
    { label: 'Lô hàng', href: '/manager/lots', icon: <Package size={20} /> },
    { label: 'Thông báo', href: '/manager/notifications', icon: <Bell size={20} /> },
    { label: 'Hồ sơ HTX', href: '/manager/profile', icon: <Landmark size={20} /> },
    { label: 'Kho ứng dụng', href: '/manager/app-store', icon: <Store size={20} /> },
    ...(await loadAppNavItems(new PrismaInstalledAppRepository(), 'manager', session.user.htxCode ?? null, loadAppFeed)),
  ]

  return (
    <AppShell 
      role="manager" 
      userName={session.user.name || 'Trưởng HTX'} 
      navItems={navItems}
      htxName={htxProfile?.name || 'Chưa cập nhật'}
      htxLocation={htxProfile?.address || ''}
    >
      {htxProfile ? children : <NoHtxNotice />}
    </AppShell>
  )
}
