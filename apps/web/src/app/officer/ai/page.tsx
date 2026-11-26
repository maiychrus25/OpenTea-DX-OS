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

export default async function OfficerAiInboxPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user?.role !== 'officer') redirect('/unauthorized')

  const tenant = await requireTenant()
  const health = await cooperativeHealth(tenant.htxCode)
  const budgetLevel = await cooperativeBudgetLevel(tenant.htxCode)

  return (
    <>
      <TelegramHealthBanner {...health} />
      <AgentBudgetBanner level={budgetLevel} />
      <CampaignPanel />
      <ProposalInbox role="officer" />
    </>
  )
}
