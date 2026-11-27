// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NoHtxNotice } from '@/components/layout/NoHtxNotice'
import { Home, FileText, ShieldCheck, User, Bell, Calendar, BookOpen, Newspaper } from 'lucide-react'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'
import { PrismaInstalledAppRepository } from '@/infrastructure/db/repositories/prisma-installed-app-repository'
import { loadAppNavItems } from '@/lib/apps/app-nav'
import { loadAppFeed } from '@/lib/apps/feed-loader'

export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'farmer') redirect('/unauthorized')

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  // Without an HTX the pages would only show empty data; the shell stays so sign-out is reachable.
  const htxProfile = session.user.htxCode ? await profileRepo.getProfile(session.user.htxCode) : null

  // Menu counts and the phone under the name. The menu still renders when they cannot be read.
  let phone: string | undefined
  let pendingJournals = 0
  let pendingReports = 0
  let unread = 0
  try {
    const household = await prisma.household.findFirst({ where: { keycloak_user_id: session.user.id }, select: { id: true, phone: true } })
    phone = household?.phone
    if (household) {
      ;[pendingJournals, pendingReports, unread] = await Promise.all([
        prisma.journalEntry.count({ where: { parcel: { household_id: household.id }, status: 'PENDING_APPROVAL' } }),
        prisma.diseaseReport.count({ where: { household_id: household.id, status: 'PENDING' } }),
        prisma.notification.count({ where: { recipient_id: session.user.id, is_read: false } }),
      ])
    }
  } catch {
    // no counts on this render
  }

  const navItems = [
    { label: 'Tổng quan', href: '/farmer/dashboard', icon: <Home size={20} />, group: 'Canh tác' },
    { label: 'Lịch thu hái', href: '/farmer/schedule', icon: <Calendar size={20} />, group: 'Canh tác' },
    { label: 'Nhật ký', href: '/farmer/journal', icon: <FileText size={20} />, group: 'Canh tác', badge: pendingJournals || undefined },
    { label: 'Chẩn đoán', href: '/farmer/diagnosis', icon: <ShieldCheck size={20} />, group: 'Canh tác', badge: pendingReports || undefined },
    { label: 'Cẩm nang', href: '/farmer/handbook', icon: <BookOpen size={20} />, group: 'Hỗ trợ' },
    { label: 'Bản tin', href: '/farmer/bulletin', icon: <Newspaper size={20} />, group: 'Hỗ trợ' },
    { label: 'Thông báo', href: '/farmer/notifications', icon: <Bell size={20} />, group: 'Cá nhân', badge: unread || undefined },
    // reached from the account menu; kept here so the breadcrumb can name the page
    { label: 'Tài khoản', href: '/farmer/profile', icon: <User size={20} />, group: 'Cá nhân', hidden: true },
    ...(await loadAppNavItems(new PrismaInstalledAppRepository(), 'farmer', session.user.htxCode ?? null, loadAppFeed)).map((item) => ({ ...item, group: 'Ứng dụng' })),
  ]

  return (
    <AppShell 
      role="farmer" 
      userName={session.user.name || 'Nông dân'} 
      navItems={navItems}
      htxName={htxProfile?.name || 'Chưa cập nhật'}
      htxLocation={htxProfile?.address || ''}
      phone={phone}
    >
      {htxProfile ? children : <NoHtxNotice />}
    </AppShell>
  )
}
