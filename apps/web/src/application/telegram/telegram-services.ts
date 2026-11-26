// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { GetFarmerHouseholdUseCase } from '@/application/farm/GetFarmerHouseholdUseCase'
import { KeycloakLiveRoleReader } from '@/infrastructure/auth/dxos-web-roles.client'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
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
import { TelegramLinkService } from './TelegramLinkService'
import { TelegramNotifier } from './TelegramNotifier'
import { ChatServices, TelegramUpdateHandler } from './TelegramUpdateHandler'
import { telegramCallbackKey } from './telegram-config'

export function telegramRepository(): PrismaTelegramRepository {
  return new PrismaTelegramRepository()
}

export function telegramNotifier(): TelegramNotifier {
  return new TelegramNotifier({ repo: telegramRepository(), proposals: new PrismaProposalRepository() })
}

export function telegramLinkService(): TelegramLinkService {
  return new TelegramLinkService(telegramRepository(), telegramNotifier())
}

/** The chat assistant's registries and adapters: the tools and actions of W2, photos, requests and households. */
export function chatServices(): ChatServices {
  return {
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
    decide: (input) => new DecideProposalUseCase(new PrismaProposalRepository()).execute(input),
    htxProfileId: async (htxCode) => (await new PrismaHtxProfileRepository().findByCode(htxCode))?.id ?? null,
    callbackKey,
    chat: chatServices(),
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
