// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AgentSettingsPanel } from '@/components/features/agent/AgentSettingsPanel'
import { AutopilotSection } from '@/components/features/agent/AutopilotSection'
import { CrossCheckThresholdsSection } from '@/components/features/agent/CrossCheckThresholds'
import { isLabsEnabled } from '@/lib/labs'
import { REAUTH_MAX_AGE_SECONDS } from '@/domain/agent/autopilot'

export default async function ManagerAiSettingsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'manager') redirect('/unauthorized')

  // The enable button asks for a fresh sign-in first when the last one is older than the server accepts (with a minute to spare).
  const reauthNeeded = !session.authTime || Date.now() / 1000 - session.authTime > REAUTH_MAX_AGE_SECONDS - 60

  return (
    <>
      <AgentSettingsPanel role="manager" />
      <CrossCheckThresholdsSection />
      {isLabsEnabled() && <AutopilotSection role="manager" reauthNeeded={reauthNeeded} />}
    </>
  )
}
