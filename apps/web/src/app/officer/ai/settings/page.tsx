// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AgentSettingsPanel } from '@/components/features/agent/AgentSettingsPanel'
import { AutopilotSection } from '@/components/features/agent/AutopilotSection'

export default async function OfficerAiSettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'officer') redirect('/unauthorized')

  return (
    <>
      <AgentSettingsPanel role="officer" />
      <AutopilotSection role="officer" />
    </>
  )
}
