// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { hashLinkCode, LINK_CODE_TTL_MS, newLinkCode } from '@/domain/telegram/link-code'
import type { TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import type { TelegramNotifier } from './TelegramNotifier'
import { isTelegramConfigured } from './telegram-config'

export interface LinkActor {
  userId: string
  userName: string | null
  role: string
  htxCode: string
}

export interface LinkStatus {
  configured: boolean
  linked: boolean
  linked_at: string | null
  group_linked: boolean
  agent_stale: boolean
  telegram_stale: boolean
}

/** Link codes and link state for the profile pages. Codes are single use and expire after ten minutes. */
export class TelegramLinkService {
  constructor(
    private readonly repo: TelegramRepository,
    private readonly notifier: Pick<TelegramNotifier, 'healthStatus'>,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createUserCode(actor: LinkActor): Promise<{ code: string; expiresAt: Date }> {
    const code = newLinkCode()
    const expiresAt = new Date(this.now().getTime() + LINK_CODE_TTL_MS)
    await this.repo.createLinkCode({
      codeHash: hashLinkCode(code),
      expiresAt,
      kind: 'user',
      userId: actor.userId,
      userName: actor.userName,
      role: actor.role,
      htxCode: actor.htxCode,
    })
    return { code, expiresAt }
  }

  async createGroupCode(actor: LinkActor): Promise<{ code: string; expiresAt: Date }> {
    const code = newLinkCode()
    const expiresAt = new Date(this.now().getTime() + LINK_CODE_TTL_MS)
    await this.repo.createLinkCode({
      codeHash: hashLinkCode(code),
      expiresAt,
      kind: 'group',
      userId: actor.userId,
      userName: actor.userName,
      role: actor.role,
      htxCode: actor.htxCode,
    })
    return { code, expiresAt }
  }

  async unlink(userId: string): Promise<void> {
    await this.repo.unlinkUser({ userId })
  }

  async status(actor: LinkActor): Promise<LinkStatus> {
    const configured = isTelegramConfigured()
    const link = await this.repo.activeUserLinkByUser(actor.userId)
    const group = actor.role === 'manager' ? await this.repo.activeGroupLinkByHtx(actor.htxCode) : null
    const health = configured
      ? await this.notifier.healthStatus(actor.htxCode)
      : { agentStale: false, telegramStale: false }
    return {
      configured,
      linked: Boolean(link),
      linked_at: link ? link.linkedAt.toISOString() : null,
      group_linked: Boolean(group),
      agent_stale: health.agentStale,
      telegram_stale: health.telegramStale,
    }
  }
}
