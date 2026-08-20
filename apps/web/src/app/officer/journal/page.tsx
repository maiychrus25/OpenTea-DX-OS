// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { JournalList } from './_components/JournalList'

export default async function OfficerJournalPage() {
  const session = await auth()
  if (!session || session.user?.role !== 'officer') {
    redirect('/login')
  }

  return <JournalList />
}
