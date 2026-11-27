// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NotificationInbox } from '@/components/features/notification/NotificationInbox'

export const metadata = { title: 'Thông báo', description: 'Quản lý thông báo' }

export default async function AccountantNotificationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'accountant') redirect('/unauthorized')

  return <NotificationInbox role="accountant" />
}
