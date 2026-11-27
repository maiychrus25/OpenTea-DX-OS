// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { CreateProposalUseCase } from '@/application/agent/CreateProposalUseCase'
import { notifyProposalCreated, telegramRepository } from '@/application/telegram/telegram-services'
import { PrismaAgentSettingsRepository } from '@/infrastructure/db/agent/PrismaAgentSettingsRepository'
import { PrismaAutopilotRepository } from '@/infrastructure/db/agent/PrismaAutopilotRepository'
import { PrismaProposalRepository } from '@/infrastructure/db/agent/PrismaProposalRepository'
import { PrismaAppBuildRepository } from '@/infrastructure/db/appbuilder/PrismaAppBuildRepository'
import { PrismaAppStoreRepository } from '@/infrastructure/db/repositories/prisma-app-store-repository'
import { AppBuildNotifier } from './AppBuildNotifier'
import { AppBuilderAgentService, type CodeProvider } from './AppBuilderAgentService'
import { AppRequestIntake } from './AppRequestIntake'

export function appRequestIntake(): AppRequestIntake {
  return new AppRequestIntake(new PrismaAppBuildRepository())
}

/** A12's service: the proposals it makes are the agent's, and reach the approvers' Telegram like any other. */
export function appBuilderAgentService(): AppBuilderAgentService {
  return new AppBuilderAgentService({
    repo: new PrismaAppBuildRepository(),
    store: new PrismaAppStoreRepository(),
    providers: async (htxCode) => {
      const available = await new PrismaAgentSettingsRepository().availableProviders(htxCode)
      const tools: CodeProvider[] = []
      if (available.includes('anthropic')) tools.push('claude-code')
      if (available.includes('openai')) tools.push('codex-cli')
      return tools
    },
    propose: async (input) => {
      const created = await new CreateProposalUseCase(new PrismaProposalRepository(), undefined, new PrismaAutopilotRepository()).execute({
        htxCode: input.htxCode,
        agent: 'app-builder',
        kind: input.kind,
        payload: input.payload,
        reasonVi: input.reasonVi,
        evidence: input.evidence,
        origin: 'agent',
      })
      if (!created) return null
      await notifyProposalCreated(input.htxCode, created.id)
      return created.id
    },
    notifier: new AppBuildNotifier(telegramRepository()),
  })
}
