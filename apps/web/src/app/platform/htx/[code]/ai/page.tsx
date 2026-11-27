// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AgentSettingsPanel } from '@/components/features/agent/AgentSettingsPanel'

export default async function PlatformAiSettingsPage({ params }: { params: { code: string } }) {
  const session = await auth()
  if (!session || session.user?.role !== 'platform_admin') redirect('/unauthorized')

  return <AgentSettingsPanel role="platform_admin" endpoint={`/api/platform/htx/${encodeURIComponent(params.code)}/agent-settings`} />
}
