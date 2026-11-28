// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NoHtxNotice } from '@/components/layout/NoHtxNotice'
import { Home, Newspaper, MessageCircle, Map as MapIcon, Sprout, Package, Landmark, CheckSquare, Bell, Users, Calendar, Store, Sparkles, FlaskConical, Banknote, Receipt, Boxes, Wallet, Flame, Award, ShoppingCart, FileText, MessageSquare } from 'lucide-react'

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
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

  const openProposals = session.user.htxCode ? await new PrismaProposalRepository().countOpen(session.user.htxCode) : 0

  const navItems = [
    { label: 'Tổng quan', href: '/manager/dashboard', icon: <Home size={20} />, group: 'Vận hành' },
    { label: 'Lịch thu hái', href: '/manager/schedule', icon: <Calendar size={20} />, group: 'Vận hành' },
    { label: 'Duyệt nhật ký', href: '/manager/journal-approve', icon: <CheckSquare size={20} />, group: 'Vận hành' },
    { label: 'Vùng trồng', href: '/manager/farm-zones', icon: <Sprout size={20} />, group: 'Vận hành' },
    { label: 'Danh mục thuốc', href: '/manager/pesticides', icon: <FlaskConical size={20} />, group: 'Vận hành' },
    { label: 'Giá thu mua', href: '/manager/leaf-prices', icon: <Banknote size={20} />, group: 'Vận hành' },
    { label: 'Phiếu cân', href: '/manager/leaf-tickets', icon: <Receipt size={20} />, group: 'Vận hành' },
    { label: 'Vật tư', href: '/manager/inputs', icon: <Boxes size={20} />, group: 'Vận hành' },
    { label: 'Quyết toán', href: '/manager/settlements', icon: <Wallet size={20} />, group: 'Vận hành' },
    { label: 'Bán hàng', href: '/manager/sales', icon: <ShoppingCart size={20} />, group: 'Vận hành' },
    { label: 'Báo cáo vụ/năm', href: '/manager/reports', icon: <FileText size={20} />, group: 'Vận hành' },
    { label: 'Xưởng sao sấy', href: '/manager/processing', icon: <Flame size={20} />, group: 'Vận hành' },
    { label: 'Chứng nhận', href: '/manager/certificates', icon: <Award size={20} />, group: 'Vận hành' },
    { label: 'Lô hàng', href: '/manager/lots', icon: <Package size={20} />, group: 'Vận hành' },
    { label: 'Quản lý thành viên', href: '/manager/members', icon: <Users size={20} />, group: 'Quản trị' },
    { label: 'Bản đồ đối tác', href: '/manager/partner-map', icon: <MapIcon size={20} />, group: 'Quản trị' },
    { label: 'Hồ sơ HTX', href: '/manager/profile', icon: <Landmark size={20} />, group: 'Quản trị' },
    { label: 'Bản tin', href: '/manager/bulletin', icon: <Newspaper size={20} />, group: 'Quản trị' },
    { label: 'Thông báo', href: '/manager/notifications', icon: <Bell size={20} />, group: 'Quản trị' },
    { label: 'Thông báo Zalo', href: '/manager/zalo', icon: <MessageSquare size={20} />, group: 'Quản trị' },
    { label: 'Chatbot', href: '/manager/chat', icon: <MessageCircle size={20} />, group: 'Ứng dụng' },
    { label: 'Đề xuất AI', href: '/manager/ai', icon: <Sparkles size={20} />, badge: openProposals || undefined, group: 'Ứng dụng' },
    { label: 'Kho ứng dụng', href: '/manager/app-store', icon: <Store size={20} />, group: 'Ứng dụng' },
    ...(await loadAppNavItems(new PrismaInstalledAppRepository(), 'manager', session.user.htxCode ?? null, loadAppFeed)).map((item) => ({ ...item, group: 'Ứng dụng' })),
  ]

  return (
    <AppShell 
      role="manager" 
      roles={session.user.roles}
      userName={session.user.name || 'Trưởng HTX'} 
      navItems={navItems}
      htxName={htxProfile?.name || 'Chưa cập nhật'}
      htxLocation={htxProfile?.address || ''}
    >
      {htxProfile ? children : <NoHtxNotice />}
    </AppShell>
  )
}
