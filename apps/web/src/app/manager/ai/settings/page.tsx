// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AgentSettingsPanel } from '@/components/features/agent/AgentSettingsPanel'

export default async function ManagerAiSettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'manager') redirect('/unauthorized')

  return <AgentSettingsPanel role="manager" />
}
