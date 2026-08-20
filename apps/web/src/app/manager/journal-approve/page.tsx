// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ApproveList } from './_components/ApproveList'

export default async function ManagerJournalApprovePage() {
  const session = await auth()
  if (!session || session.user?.role !== 'manager') {
    redirect('/login')
  }

  return <ApproveList />
}
