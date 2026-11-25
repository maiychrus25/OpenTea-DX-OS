// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import { loadJournalSubjects } from '@/application/agent/journal-subjects'
import type { JournalSubject } from '@/application/agent/actions/journal-labels'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { Proposal } from '@/domain/agent/proposal'
import { signCallbackData } from '@/domain/telegram/callback-data'
import type { OutboxInsert, OutboxRow, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
import { telegramCallbackKey } from './telegram-config'
import {
  healthText,
  proposalResultText,
  proposalText,
  reportText,
  type ReportFigures,
} from './messages'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const AGENT_STALE_MS = 10 * MINUTE_MS
const TELEGRAM_STALE_MS = 3 * MINUTE_MS
const HEALTH_REPEAT_MS = 6 * 60 * MINUTE_MS
const HEALTH_CHECK_EVERY_MS = MINUTE_MS
const MAX_SEND_ATTEMPTS = 10
const MAX_BACKOFF_SECONDS = 15 * 60

let lastHealthCheckAt = 0

export interface TelegramNotifierDeps {
  repo: TelegramRepository
  proposals: Pick<ProposalRepository, 'findById'>
  /** Journal labels for a proposal's preview; the same wording the inbox shows. */
  labelsFor?: (htxCode: string, proposals: Proposal[]) => Promise<Map<string, JournalSubject>>
  now?: () => Date
}

/** A Telegram Bot API result as the relay reports it. */
export type OutboxResult =
  | { ok: true; telegram_message_id?: number | string | null }
  | { ok: false; error: string; retry_after_seconds?: number; permanent?: boolean }

export interface HealthStatus {
  agentStale: boolean
  telegramStale: boolean
}

async function defaultLabels(htxCode: string, proposals: Proposal[]): Promise<Map<string, JournalSubject>> {
  const htx = await new PrismaHtxProfileRepository().findByCode(htxCode)
  return htx ? loadJournalSubjects(proposals, htx.id) : new Map()
}

/** Midnight in Vietnam time for a `YYYY-MM-DD` day. */
function vnMidnight(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00+07:00`)
}

function isNotModified(error: string): boolean {
  return error.includes('message is not modified')
}

/**
 * Turns decisions, reports and health conditions into outbox rows the relay sends.
 * Nothing here calls Telegram: the relay drains the outbox.
 */
export class TelegramNotifier {
  private readonly repo: TelegramRepository
  private readonly proposals: Pick<ProposalRepository, 'findById'>
  private readonly labelsFor: (htxCode: string, proposals: Proposal[]) => Promise<Map<string, JournalSubject>>
  private readonly now: () => Date

  constructor(deps: TelegramNotifierDeps) {
    this.repo = deps.repo
    this.proposals = deps.proposals
    this.labelsFor = deps.labelsFor ?? defaultLabels
    this.now = deps.now ?? (() => new Date())
  }

  /** One message per approver linked to the cooperative, with signed Approve and Reject buttons. */
  async enqueueProposal(proposal: Proposal): Promise<void> {
    const key = telegramCallbackKey()
    const definition = getAction(proposal.kind)
    // Only the callback key is needed to sign the buttons; the bot username only builds link URLs.
    if (!key || !definition) return

    const recipients = await this.repo.userLinkRecipients(proposal.htxCode, definition.approverRoles)
    if (recipients.length === 0) return

    const labels = await this.labelsFor(proposal.htxCode, [proposal])
    const text = proposalText(proposal, definition.titleVi, definition.preview(proposal.payload, labels, proposal.evidence))
    const buttons = [
      [
        { text: 'Duyệt', callback_data: signCallbackData(key, proposal.id, 'a') },
        { text: 'Từ chối', callback_data: signCallbackData(key, proposal.id, 'r') },
      ],
    ]
    await this.repo.enqueue(
      recipients.map((link) => ({
        htxCode: proposal.htxCode,
        chatId: link.chatId,
        op: 'send' as const,
        text,
        buttons,
        proposalId: proposal.id,
        purpose: 'proposal' as const,
      }))
    )
  }

  /**
   * After a decision (from any channel): unsent messages get the final text before they go out,
   * sent messages are edited. Messages still leased are caught up in recordResult.
   */
  async syncDecision(htxCode: string, proposalId: string): Promise<void> {
    const proposal = await this.proposals.findById(htxCode, proposalId)
    const text = proposal ? proposalResultText(proposal) : null
    if (!proposal || !text) return

    const edits: OutboxInsert[] = []
    for (const row of await this.repo.proposalSends(proposalId)) {
      if (row.status === 'sent' && row.telegramMessageId) {
        edits.push({
          htxCode,
          chatId: row.chatId,
          op: 'edit',
          text,
          editMessageId: row.telegramMessageId,
          proposalId,
          purpose: 'result',
        })
      } else if (row.status === 'pending') {
        await this.repo.updateUnsentText(row.id, text)
      }
    }
    await this.repo.enqueue(edits)
  }

  /** Records the relay's answer for an outbox row, retrying with backoff when Telegram did not accept it. */
  async recordResult(id: string, result: OutboxResult): Promise<boolean> {
    const row = await this.repo.outboxRow(id)
    if (!row) return false
    const now = this.now()

    if (result.ok || (row.op === 'edit' && isNotModified(result.ok ? '' : result.error))) {
      const telegramMessageId = result.ok && result.telegram_message_id != null
        ? String(result.telegram_message_id)
        : row.telegramMessageId
      await this.repo.markSent(id, telegramMessageId)
      if (row.purpose === 'proposal' && row.op === 'send' && telegramMessageId) {
        await this.catchUpProposalMessage(row, telegramMessageId)
      }
      return true
    }

    if (result.permanent || row.attempts >= MAX_SEND_ATTEMPTS) {
      await this.repo.markFailed(id, result.error)
      return true
    }
    const backoffSeconds = result.retry_after_seconds ?? Math.min(5 * 2 ** Math.max(row.attempts - 1, 0), MAX_BACKOFF_SECONDS)
    await this.repo.markRetry(id, result.error, new Date(now.getTime() + backoffSeconds * 1000))
    return true
  }

  /** A proposal decided while its message was being sent: the message is edited to the final state. */
  private async catchUpProposalMessage(row: OutboxRow, telegramMessageId: string): Promise<void> {
    if (!row.htxCode || !row.proposalId) return
    const proposal = await this.proposals.findById(row.htxCode, row.proposalId)
    const text = proposal ? proposalResultText(proposal) : null
    if (!text || text === row.text) return
    await this.repo.enqueue([
      {
        htxCode: row.htxCode,
        chatId: row.chatId,
        op: 'edit',
        text,
        editMessageId: telegramMessageId,
        proposalId: row.proposalId,
        purpose: 'result',
      },
    ])
  }

  /**
   * Once per (cooperative, kind, period). Proposal figures are counted here, from the web's own tables;
   * the agent sends the rest. Returns false when the report was already recorded.
   */
  async enqueueReport(
    htxCode: string,
    kind: 'daily' | 'weekly',
    periodStart: string,
    periodEnd: string,
    figures: ReportFigures
  ): Promise<boolean> {
    const fresh = await this.repo.insertReportIfNew(htxCode, kind, periodStart)
    if (!fresh) return false

    const counts = await this.repo.proposalCounts(
      htxCode,
      vnMidnight(periodStart),
      new Date(vnMidnight(periodEnd).getTime() + DAY_MS)
    )
    const text = reportText(kind, periodStart, periodEnd, {
      ...figures,
      proposals_open: counts.open,
      proposals_decided: counts.decided,
    })
    const recipients = [
      ...(await this.repo.userLinkRecipients(htxCode, ['manager', 'officer'])),
      ...(await this.repo.groupLinkRecipients(htxCode)),
    ]
    await this.repo.enqueue(
      recipients.map((link) => ({ htxCode, chatId: link.chatId, op: 'send' as const, text, purpose: 'report' as const }))
    )
    return true
  }

  /** Banner state for the inbox: an enabled agent that has gone quiet, or a relay that has gone quiet. */
  async healthStatus(htxCode: string): Promise<HealthStatus> {
    const now = this.now().getTime()
    const enabled = (await this.repo.enabledAgentCooperatives()).includes(htxCode)
    const agentSeen = await this.repo.heartbeatLastSeen(`agent:${htxCode}`)
    const telegramSeen = await this.repo.heartbeatLastSeen('telegram')
    return {
      agentStale: enabled && (!agentSeen || now - agentSeen.getTime() > AGENT_STALE_MS),
      telegramStale: Boolean(telegramSeen) && now - telegramSeen!.getTime() > TELEGRAM_STALE_MS,
    }
  }

  /** Runs at most once a minute (it is called from the relay's outbox poll). */
  async runHealthChecks(): Promise<void> {
    const now = this.now()
    if (now.getTime() - lastHealthCheckAt < HEALTH_CHECK_EVERY_MS) return
    lastHealthCheckAt = now.getTime()

    for (const htxCode of await this.repo.enabledAgentCooperatives()) {
      const seen = await this.repo.heartbeatLastSeen(`agent:${htxCode}`)
      if (!seen || now.getTime() - seen.getTime() > AGENT_STALE_MS) {
        await this.queueHealth(`agent-stale:${htxCode}`, htxCode, 'Agent không phản hồi',
          `Agent của HTX ${htxCode} không gửi nhịp kiểm tra trong 10 phút.`, now)
      }
      if (await this.repo.lastRunsAllFailed(htxCode, 3)) {
        await this.queueHealth(`agent-failed:${htxCode}`, htxCode, 'Agent lỗi liên tiếp',
          `Ba lần chạy gần nhất của agent HTX ${htxCode} đều lỗi. Kiểm tra nhật ký chạy.`, now)
      }
    }

    const telegramSeen = await this.repo.heartbeatLastSeen('telegram')
    if (telegramSeen && now.getTime() - telegramSeen.getTime() > TELEGRAM_STALE_MS) {
      await this.queueHealth('telegram-stale', null, 'Telegram không phản hồi',
        'Dịch vụ dxos-telegram không gửi nhịp kiểm tra trong 3 phút.', now)
    }

    const alerts = await this.repo.unnotifiedAlerts(50)
    for (const alert of alerts) {
      await this.queueHealth(`alert:${alert.id}`, alert.htxCode, alert.title, alert.detail ?? '', now, false)
    }
    await this.repo.markAlertsNotified(alerts.map((a) => a.id), now)
  }

  /** The 80% and 100% warnings of the monthly agent budget: once per cooperative, threshold and Vietnam month. */
  async queueBudgetAlert(
    htxCode: string,
    month: string,
    percent: 80 | 100,
    spent: number,
    limit: number,
    monthStart: Date
  ): Promise<void> {
    const healthKey = `budget:${htxCode}:${month}:${percent}`
    if (await this.repo.healthRecentlyQueued(healthKey, monthStart)) return
    const usage = `Đã dùng ${spent.toFixed(2)} / ${limit.toFixed(2)} USD trong tháng ${month}`
    const [title, detail] = percent === 100
      ? ['Ngân sách AI đã hết', `${usage}. Agent dùng Ollama đến hết tháng.`]
      : ['Ngân sách AI sắp hết', `${usage}, đã qua 80% ngân sách.`]
    await this.queueHealth(healthKey, htxCode, title, detail, this.now(), false)
  }

  /** Managers of the cooperative (all cooperatives when htxCode is null), at most once per condition per six hours. */
  private async queueHealth(
    healthKey: string,
    htxCode: string | null,
    title: string,
    detail: string,
    now: Date,
    repeatable = true
  ): Promise<void> {
    if (repeatable && (await this.repo.healthRecentlyQueued(healthKey, new Date(now.getTime() - HEALTH_REPEAT_MS)))) return
    const recipients = await this.repo.userLinkRecipients(htxCode, ['manager'])
    if (recipients.length === 0) return
    await this.repo.enqueue(
      recipients.map((link) => ({
        htxCode,
        chatId: link.chatId,
        op: 'send' as const,
        text: healthText(title, detail),
        purpose: 'health' as const,
        healthKey,
      }))
    )
  }
}
