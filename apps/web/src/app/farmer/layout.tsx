// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Home, FileText, Stethoscope, User, Bell } from 'lucide-react'
import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/repositories/PrismaHtxProfileRepository'

export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'farmer') redirect('/unauthorized')

  const profileRepo = new PrismaHtxProfileRepository(prisma)
  const htxProfile = await profileRepo.getProfile()

  const navItems = [
    { label: 'Tổng quan', href: '/farmer/dashboard', icon: <Home size={20} /> },
    { label: 'Nhật ký', href: '/farmer/journal', icon: <FileText size={20} /> },
    { label: 'Chẩn đoán', href: '/farmer/diagnosis', icon: <Stethoscope size={20} /> },
    { label: 'Bản tin & thông báo', href: '/farmer/bulletin-notifications', icon: <Bell size={20} /> },
    { label: 'Tài khoản', href: '/farmer/profile', icon: <User size={20} /> },
  ]

  return (
    <AppShell 
      role="farmer" 
      userName={session.user.name || 'Nông dân'} 
      navItems={navItems}
      htxName={htxProfile?.name || 'Chưa cập nhật'}
      htxLocation={htxProfile?.address || ''}
    >
      {children}
    </AppShell>
  )
}
