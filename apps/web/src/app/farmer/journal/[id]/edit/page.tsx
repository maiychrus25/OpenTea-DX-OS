// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { FarmerJournalEditClient } from './_components/FarmerJournalEditClient'

export default async function FarmerJournalEditPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user?.role !== 'farmer') {
    redirect('/login')
  }

  const { id } = await params
  return <FarmerJournalEditClient id={id} />
}
