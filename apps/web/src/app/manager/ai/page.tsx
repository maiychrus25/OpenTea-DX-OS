// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { AgentBudgetBanner } from '@/components/features/agent/AgentBudgetBanner'
import { CampaignPanel } from '@/components/features/agent/CampaignPanel'
import { ProposalInbox } from '@/components/features/agent/ProposalInbox'
import { TelegramHealthBanner } from '@/components/features/telegram/TelegramHealthBanner'
import { cooperativeBudgetLevel } from '@/application/agent/agent-budget'
import { cooperativeHealth } from '@/application/telegram/telegram-services'
import { requireTenant } from '@/lib/api/tenant'
import { isLabsEnabled } from '@/lib/labs'
import { AiOverview } from './_components/AiOverview'
import { loadAiOverview } from './_components/load-ai'

export default async function ManagerAiInboxPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'manager') redirect('/unauthorized')

  const tenant = await requireTenant()
  const health = await cooperativeHealth(tenant.htxCode)
  const budgetLevel = await cooperativeBudgetLevel(tenant.htxCode)
  const overview = await loadAiOverview(tenant.htxProfileId, tenant.htxCode)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <AiOverview data={overview} />
      <TelegramHealthBanner {...health} />
      <AgentBudgetBanner level={budgetLevel} />
      <CampaignPanel />
      <div id="proposals">
        <ProposalInbox role="manager" labs={isLabsEnabled()} />
      </div>
    </div>
  )
}
