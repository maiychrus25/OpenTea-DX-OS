// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { HeadNotifications } from './_components/HeadNotifications'

export const metadata = {
  title: 'Thông báo',
  description: 'Quản lý thông báo',
}

export default async function ManagerNotificationsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'manager') redirect('/unauthorized')

  return <HeadNotifications />
}
