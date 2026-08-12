// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { Sun, BookOpen, HeartPulse } from 'lucide-react'

export default async function FarmerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'farmer') redirect('/unauthorized')

  const navItems = [
    { label: 'Hôm nay', href: '/farmer/dashboard', icon: <Sun size={20} /> },
    { label: 'Nhật ký', href: '/farmer/journals', icon: <BookOpen size={20} /> },
    { label: 'Chẩn đoán', href: '/farmer/diagnosis', icon: <HeartPulse size={20} /> },
  ]

  return (
    <AppShell role="farmer" userName={session.user.name || 'Nông dân'} navItems={navItems} hideSidebar={true}>
      {children}
    </AppShell>
  )
}
