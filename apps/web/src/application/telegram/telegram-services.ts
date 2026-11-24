// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { DecideProposalUseCase } from '@/application/agent/DecideProposalUseCase'
import { KeycloakLiveRoleReader } from '@/infrastructure/auth/dxos-web-roles.client'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaTelegramRepository } from '@/infrastructure/db/telegram/PrismaTelegramRepository'
import { logger } from '@/lib/logger'
import { TelegramLinkService } from './TelegramLinkService'
import { TelegramNotifier } from './TelegramNotifier'
import { TelegramUpdateHandler } from './TelegramUpdateHandler'
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
