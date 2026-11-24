// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ProposalInbox } from '@/components/features/agent/ProposalInbox'

export default async function OfficerAiInboxPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'officer') redirect('/unauthorized')

  return <ProposalInbox role="officer" />
}
