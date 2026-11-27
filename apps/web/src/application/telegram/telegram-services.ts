// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { ApproveCampaignUseCase } from '@/application/agent/campaign/ApproveCampaignUseCase'
import { DropCampaignUseCase } from '@/application/agent/campaign/DropCampaignUseCase'
import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { GetFarmerHouseholdUseCase } from '@/application/farm/GetFarmerHouseholdUseCase'
import { KeycloakLiveRoleReader } from '@/infrastructure/auth/dxos-web-roles.client'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
import { getAction } from '@/application/agent/action-catalog'
import { AutopilotService } from '@/application/agent/autopilot/AutopilotService'
import { RunAutopilotTickUseCase } from '@/application/agent/autopilot/RunAutopilotTickUseCase'
import { PrismaAutopilotRepository } from '@/infrastructure/db/agent/PrismaAutopilotRepository'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'
import { PrismaCampaignRepository } from '@/infrastructure/db/agent/PrismaCampaignRepository'
import { PrismaImprovementRepository } from '@/infrastructure/db/agent/PrismaImprovementRepository'
import { PrismaStrategyPlanRepository } from '@/infrastructure/db/agent/PrismaStrategyPlanRepository'
import { vnDayOf } from '@/application/agent/campaign/vn-day'
import { seasonFigures } from '@/application/agent/strategy/season-figures'
import { seasonReportLines } from '@/application/agent/strategy/season-progress'
import { seasonOfDay } from '@/domain/agent/strategy'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaAssistantRequestRepository } from '@/infrastructure/db/telegram/PrismaAssistantRequestRepository'
import { PrismaTelegramRepository } from '@/infrastructure/db/telegram/PrismaTelegramRepository'
import { TelegramPhotoStore } from '@/infrastructure/storage/telegram-photo-store'
import { logger } from '@/lib/logger'
import { AssistantRequests } from './assistant/AssistantRequests'
import { AssistantResultUseCase } from './assistant/AssistantResult'
import { ChatEngine } from './chat/ChatEngine'
import { ChatUserResolver } from './chat/ChatUserResolver'
import { CHAT_ACTIONS } from './chat/actions'
import { CHAT_TOOLS } from './chat/tools'
import { autopilotEnabledText } from './messages'
import { AppRequestIntake } from '@/application/appbuilder/AppRequestIntake'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { TelegramLinkService } from './TelegramLinkService'
import { TelegramNotifier } from './TelegramNotifier'
import { AutopilotServices, CampaignServices, ChatServices, TelegramUpdateHandler } from './TelegramUpdateHandler'
import { telegramCallbackKey } from './telegram-config'

export function telegramRepository(): PrismaTelegramRepository {
  return new PrismaTelegramRepository()
}

export function telegramNotifier(): TelegramNotifier {
  return new TelegramNotifier({
    repo: telegramRepository(),
    proposals: new PrismaProposalRepository(),
    campaigns: new PrismaCampaignRepository(),
    improvements: new PrismaImprovementRepository(),
    autopilot: new PrismaAutopilotRepository(),
    seasonLines: async (htxCode, now) => {
      const season = seasonOfDay(vnDayOf(now))
      const plan = await new PrismaStrategyPlanRepository().adoptedFor(htxCode, season)
      return plan ? seasonReportLines(plan, await seasonFigures(htxCode, season)) : []
    },
  })
}

export function telegramLinkService(): TelegramLinkService {
  return new TelegramLinkService(telegramRepository(), telegramNotifier())
}

/** The chat assistant's registries and adapters: the tools and actions of W2, photos, requests and households. */
export function chatServices(): ChatServices {
  const intake = new AppRequestIntake(new PrismaAppBuildRepository())
  return {
    appRequests: {
      submit: (user, text) => intake.submitFromChat({ htxCode: user.tenant.htxCode, userId: user.tenant.userId, userName: user.userName }, text),
      answer: (htxCode, requestId, text) => intake.answerFromChat(htxCode, requestId, text),
    },
    tools: CHAT_TOOLS,
    actions: CHAT_ACTIONS,
    photos: new TelegramPhotoStore(),
    requests: new PrismaAssistantRequestRepository(),
    householdId: async (userId) =>
      (await new GetFarmerHouseholdUseCase(new PrismaHouseholdRepository()).execute(userId))?.id ?? null,
    proposalMessages: async (htxCode, proposalIds) => {
      const proposals = new PrismaProposalRepository()
      const notifier = telegramNotifier()
      const messages = []
      for (const id of proposalIds) {
        const proposal = await proposals.findById(htxCode, id)
        const message = proposal ? await notifier.proposalMessage(proposal) : null
        if (message) messages.push(message)
      }
      return messages
    },
  }
}

export function assistantRequests(): AssistantRequests {
  return new AssistantRequests(new PrismaAssistantRequestRepository(), telegramRepository())
}

/** Applies an agent's intent for a claimed request: the same engine and live role reads as the chat updates. */
export function assistantResultUseCase(): AssistantResultUseCase {
  const services = chatServices()
  const repo = telegramRepository()
  const roles = new KeycloakLiveRoleReader()
  const users = new ChatUserResolver({
    roles,
    htxProfileId: async (htxCode) => (await new PrismaHtxProfileRepository().findByCode(htxCode))?.id ?? null,
    householdId: services.householdId,
  })
  const engine = new ChatEngine({
    repo,
    tools: services.tools,
    actions: services.actions,
    photos: services.photos,
    requests: assistantRequests(),
    callbackKey: telegramCallbackKey() ?? '',
    appRequests: services.appRequests,
    proposalMessages: services.proposalMessages,
  })
  return new AssistantResultUseCase({
    requests: services.requests,
    links: repo,
    users,
    engine,
    enqueue: (rows) => repo.enqueue(rows),
  })
}

export function telegramUpdateHandler(): TelegramUpdateHandler {
  const callbackKey = telegramCallbackKey()
  if (!callbackKey) throw new Error('DXOS_TELEGRAM_CALLBACK_KEY is not set')
  return new TelegramUpdateHandler({
    repo: telegramRepository(),
    proposals: new PrismaProposalRepository(),
    roles: new KeycloakLiveRoleReader(),
    notifier: telegramNotifier(),
    decide: (input) => decisionUseCase().execute(input),
    htxProfileId: async (htxCode) => (await new PrismaHtxProfileRepository().findByCode(htxCode))?.id ?? null,
    callbackKey,
    chat: chatServices(),
    campaigns: campaignServices(),
    autopilot: autopilotHandlerServices(),
  })
}

/** Banner state for the inbox. A failed lookup shows no banner rather than failing the page. */
export async function cooperativeHealth(htxCode: string): Promise<{ agentStale: boolean; telegramStale: boolean }> {
  try {
    return await telegramNotifier().healthStatus(htxCode)
  } catch (err) {
    logger.error('Telegram: could not read health status', { htxCode, err })
    return { agentStale: false, telegramStale: false }
  }
}

/** Telegram must never make a proposal or decision fail: problems are logged and the web action still succeeds. */
export async function notifyProposalCreated(htxCode: string, proposalId: string): Promise<void> {
  try {
    const proposal = await new PrismaProposalRepository().findById(htxCode, proposalId)
    if (proposal) await telegramNotifier().enqueueProposal(proposal)
  } catch (err) {
    logger.error('Telegram: could not queue proposal messages', { proposalId, err })
  }
}

export async function notifyProposalDecided(htxCode: string, proposalId: string): Promise<void> {
  try {
    await telegramNotifier().syncDecision(htxCode, proposalId)
  } catch (err) {
    logger.error('Telegram: could not sync proposal messages', { proposalId, err })
  }
}

/** The campaign message is queued after A9 creates a campaign; a failure is logged and the campaign stays stored. */
export async function notifyCampaignCreated(htxCode: string, campaignId: string): Promise<void> {
  try {
    await telegramNotifier().enqueueCampaign(htxCode, campaignId)
  } catch (err) {
    logger.error('Telegram: could not queue the campaign message', { campaignId, err })
  }
}

/** The decision use case as both channels run it: a decision also moves a draft campaign that holds the item to partial (M7). */
export function decisionUseCase(): DecideProposalUseCase {
  return new DecideProposalUseCase(
    new PrismaProposalRepository(),
    undefined,
    undefined,
    new PrismaCampaignRepository(),
    new PrismaImprovementRepository()
  )
}

/** Approve all, drop and the campaign reads: the same use cases for the Telegram buttons and the web inbox (M7). */
export function campaignServices(): CampaignServices {
  const campaigns = new PrismaCampaignRepository()
  const proposals = new PrismaProposalRepository()
  const notifier = telegramNotifier()
  return {
    repo: campaigns,
    approve: new ApproveCampaignUseCase({
      campaigns,
      decide: (input) => decisionUseCase().execute(input),
      forward: async (htxCode, proposalId) => {
        const proposal = await proposals.findById(htxCode, proposalId)
        if (proposal) await notifier.enqueueProposal(proposal)
      },
      syncDecision: (htxCode, proposalId) => notifier.syncDecision(htxCode, proposalId),
    }),
    drop: new DropCampaignUseCase(campaigns),
    message: (htxCode, campaignId) => notifier.campaignMessage(htxCode, campaignId),
  }
}

/** The once-a-minute autonomous-mode pass: the same decision use case as both channels, with the live role reader. */
export function autopilotTickUseCase(): RunAutopilotTickUseCase {
  const notifier = telegramNotifier()
  return new RunAutopilotTickUseCase({
    autopilot: new PrismaAutopilotRepository(),
    proposals: new PrismaProposalRepository(),
    decide: (input) => decisionUseCase().execute(input),
    roles: new KeycloakLiveRoleReader(),
    htxProfileId: async (htxCode) => (await new PrismaHtxProfileRepository().findByCode(htxCode))?.id ?? null,
    liveSettings: (htxCode, agent) => new PrismaAgentSettingsRepository().findForEvidence(htxCode, agent),
    notifier: {
      stopped: (htxCode, reason, returned, dailyCap) => notifier.enqueueAutopilotStopped(htxCode, reason, returned, dailyCap),
      decided: (htxCode, proposalId) => notifier.syncDecision(htxCode, proposalId),
    },
  })
}

/** The enable screen, status, enable and stop of the web (C4), with the Telegram notices to every manager and officer. */
export function autopilotService(): AutopilotService {
  const notifier = telegramNotifier()
  return new AutopilotService({
    autopilot: new PrismaAutopilotRepository(),
    notifier: {
      enabled: (htxCode, byName, unlocked, dailyCap) =>
        notifier.enqueueAutopilotNotice(
          htxCode,
          autopilotEnabledText(byName, unlocked.map((kind) => getAction(kind)?.titleVi ?? kind), dailyCap)
        ),
      stopped: (htxCode, reason, returned, dailyCap) => notifier.enqueueAutopilotStopped(htxCode, reason, returned, dailyCap),
    },
  })
}

/** The Telegram handler's autonomous-mode calls: the same repository and service as the web. */
function autopilotHandlerServices(): AutopilotServices {
  const autopilot = new PrismaAutopilotRepository()
  const service = autopilotService()
  return {
    block: (htxCode, proposalId, userId) => autopilot.block(htxCode, proposalId, userId),
    stop: (htxCode, userId) => service.stop(htxCode, userId),
    status: async (htxCode) => {
      const view = await service.view(htxCode)
      return {
        enabled: view.enabled,
        enabledByName: view.enabled_by_name,
        pending: view.today.pending,
        ran: view.today.ran,
        blocked: view.today.blocked,
        dailyCap: view.daily_cap,
      }
    },
    touchManagerActivity: (htxCode, now) => autopilot.touchManagerActivity(htxCode, now),
  }
}
