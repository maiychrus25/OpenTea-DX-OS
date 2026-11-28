// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { HeadSales } from './_components/HeadSales'

export default async function ManagerSalesPage({ searchParams }: { searchParams: { overdue?: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') redirect('/login')
  return <HeadSales initialOverdue={searchParams.overdue === '1'} />
}
