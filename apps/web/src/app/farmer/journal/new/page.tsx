// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { journalPrefillFromParams } from '../_components/FarmerJournalForm'
import { FarmerJournalNewClient } from './_components/FarmerJournalNewClient'

export default async function FarmerJournalNewPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'farmer') {
    redirect('/login')
  }

  return <FarmerJournalNewClient initial={journalPrefillFromParams(searchParams)} />
}
