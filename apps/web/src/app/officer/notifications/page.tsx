// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NotificationInbox } from '@/components/features/notification/NotificationInbox'

export const metadata = {
  title: 'Thông báo | DX-AgriMarket',
  description: 'Quản lý thông báo',
}

export default async function OfficerNotificationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'officer') redirect('/unauthorized')

  return <NotificationInbox role="officer" />
}
