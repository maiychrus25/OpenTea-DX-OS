// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { getAction } from '@/application/agent/action-catalog'
import { OPEN_CAMPAIGN_STATUSES } from '@/application/agent/campaign/ApproveCampaignUseCase'
import { loadJournalSubjects } from '@/application/agent/journal-subjects'
import type { JournalSubject } from '@/application/agent/actions/journal-labels'
import type { ProposalRepository } from '@/domain/agent/ports/ProposalRepository'
import type { CampaignRepository } from '@/domain/agent/ports/CampaignRepository'
import type { AutopilotRepository } from '@/domain/agent/ports/AutopilotRepository'
import type { Proposal } from '@/domain/agent/proposal'
import type { StopReason } from '@/domain/agent/autopilot'
import type { ImprovementRepository } from '@/domain/agent/ports/ImprovementRepository'
import { signCallbackData } from '@/domain/telegram/callback-data'
import type { OutboxInsert, OutboxRow, TelegramRepository } from '@/domain/telegram/ports/TelegramRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
import { detailButton } from './chat/mini-app'
import type { ReplyButton } from './TelegramUpdateHandler'
import { telegramCallbackKey } from './telegram-config'
import { measuredLines, templateReminderLines, vnIsoWeekday, vnMondayOf, weeklyImprovementLines } from './improvement-lines'
import {
  autopilotScheduledText,
  autopilotStoppedText,
  campaignText,
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

/** The campaign reads and writes the notifier needs (the campaign message and the 18:00 outcomes). */
export type NotifierCampaigns = Pick<
  CampaignRepository,
  'findById' | 'items' | 'markTelegramSent' | 'findForDay' | 'writeOutcomes' | 'setStatus'
>

/** Approve-all, list and drop buttons of a campaign message (C6). */
export type CampaignButtons = { text: string; callback_data: string }[][]

export interface TelegramNotifierDeps {
  repo: TelegramRepository
  proposals: Pick<ProposalRepository, 'findById'>
  /** Journal labels for a proposal's preview; the same wording the inbox shows. */
  labelsFor?: (htxCode: string, proposals: Proposal[]) => Promise<Map<string, JournalSubject>>
  campaigns?: NotifierCampaigns
  /** Template reminders of the campaign message and the weekly improvement lines (M8). */
  improvements?: Pick<ImprovementRepository, 'activeTemplates' | 'countForWeek' | 'measuredBetween'>
  /** Autonomous mode (M12): the campaign header, the 18:00 section and nothing else. */
  autopilot?: Pick<AutopilotRepository, 'get' | 'daySummary'>
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
  private readonly campaigns?: NotifierCampaigns
  private readonly improvements?: TelegramNotifierDeps['improvements']
  private readonly autopilot?: TelegramNotifierDeps['autopilot']

  constructor(deps: TelegramNotifierDeps) {
    this.repo = deps.repo
    this.proposals = deps.proposals
    this.labelsFor = deps.labelsFor ?? defaultLabels
    this.campaigns = deps.campaigns
    this.improvements = deps.improvements
    this.autopilot = deps.autopilot
    this.now = deps.now ?? (() => new Date())
  }

  /** One message per approver linked to the cooperative, with signed Approve and Reject buttons. */
  /** The approver message of a proposal: its text and the approve and reject buttons. Null when it cannot be signed. */
  async proposalMessage(proposal: Proposal): Promise<{ text: string; buttons: ReplyButton[][] } | null> {
    const key = telegramCallbackKey()
    const definition = getAction(proposal.kind)
    // Only the callback key is needed to sign the buttons; the bot username only builds link URLs.
    if (!key || !definition) return null

    const labels = await this.labelsFor(proposal.htxCode, [proposal])
    const text = proposalText(proposal, definition.titleVi, definition.preview(proposal.payload, labels, proposal.evidence))
    const buttons: ReplyButton[][] = [
      [
        { text: 'Duyệt', callback_data: signCallbackData(key, proposal.id, 'a') },
        { text: 'Từ chối', callback_data: signCallbackData(key, proposal.id, 'r') },
      ],
    ]
    const detail = definition.risk === 'high' ? detailButton(proposal.id) : null
    if (detail) buttons.push([detail])
    return { text, buttons }
  }

  /**
   * M12: a proposal with a blocking window gets `Sẽ tự chạy lúc …` with Chặn and Xem instead of Duyệt and Từ chối.
   * A zero window (a low-risk kind runs on the next tick) keeps the normal message, which becomes the run result.
   */
  private async scheduledMessage(proposal: Proposal): Promise<{ text: string; buttons: { text: string; callback_data: string }[][] } | null> {
    const key = telegramCallbackKey()
    const definition = getAction(proposal.kind)
    if (!key || !definition || !proposal.runAt || proposal.runAt.getTime() <= proposal.createdAt.getTime()) return null
    const labels = await this.labelsFor(proposal.htxCode, [proposal])
    const preview = definition.preview(proposal.payload, labels, proposal.evidence)
    return {
      text: autopilotScheduledText(definition.titleVi, preview, proposal.runAt),
      buttons: [
        [
          { text: 'Chặn', callback_data: signCallbackData(key, proposal.id, 'b') },
          { text: 'Xem', callback_data: signCallbackData(key, proposal.id, 'v') },
        ],
      ],
    }
  }

  /** The stop message to every linked manager and officer (H5, C3). */
  async enqueueAutopilotStopped(htxCode: string, reason: StopReason, returned: number, dailyCap: number): Promise<void> {
    const recipients = await this.repo.userLinkRecipients(htxCode, ['manager', 'officer'])
    if (recipients.length === 0) return
    const text = autopilotStoppedText(reason, returned, dailyCap)
    await this.repo.enqueue(
      recipients.map((link) => ({ htxCode, chatId: link.chatId, op: 'send' as const, text, purpose: 'reply' as const }))
    )
  }

  /** The text lines of a change of the mode, sent to every linked manager and officer. */
  async enqueueAutopilotNotice(htxCode: string, text: string): Promise<void> {
    const recipients = await this.repo.userLinkRecipients(htxCode, ['manager', 'officer'])
    await this.repo.enqueue(
      recipients.map((link) => ({ htxCode, chatId: link.chatId, op: 'send' as const, text, purpose: 'reply' as const }))
    )
  }

  async enqueueProposal(proposal: Proposal): Promise<void> {
    const definition = getAction(proposal.kind)
    if (!telegramCallbackKey() || !definition) return

    const recipients = await this.repo.userLinkRecipients(proposal.htxCode, definition.approverRoles)
    if (recipients.length === 0) return

    const message = (await this.scheduledMessage(proposal)) ?? (await this.proposalMessage(proposal))
    if (!message) return
    await this.repo.enqueue(
      recipients.map((link) => ({
        htxCode: proposal.htxCode,
        chatId: link.chatId,
        op: 'send' as const,
        text: message.text,
        buttons: message.buttons,
        proposalId: proposal.id,
        purpose: 'proposal' as const,
      }))
    )
  }

  /**
   * The campaign message (contract C6): its text, and the approve-all, list and drop buttons while the campaign is open.
   * Null when the campaign is missing.
   */
  async campaignMessage(htxCode: string, campaignId: string): Promise<{ text: string; buttons?: CampaignButtons } | null> {
    const campaigns = this.campaigns
    if (!campaigns) return null
    const campaign = await campaigns.findById(htxCode, campaignId)
    if (!campaign) return null
    const items = await campaigns.items(htxCode, campaignId)
    const lines = items.map((item) => ({
      title: getAction(item.kind)?.titleVi ?? item.kind,
      target: item.target,
      unitVi: campaign.goals.find((g) => g.goalKey === item.goalKey)?.unitVi ?? 'việc',
      runAt: item.runAt ?? null,
    }))
    const autopilotOn = this.autopilot ? (await this.autopilot.get(htxCode)).enabled : false
    const templates = this.improvements ? await this.improvements.activeTemplates(htxCode, vnIsoWeekday(campaign.day)) : []
    const text = campaignText(campaign.day, campaign.summaryVi, lines, templateReminderLines(templates), autopilotOn)
    const key = telegramCallbackKey()
    if (!key || !OPEN_CAMPAIGN_STATUSES.includes(campaign.status)) return { text }
    return {
      text,
      buttons: [
        [{ text: 'Duyệt cả chiến dịch', callback_data: signCallbackData(key, campaignId, 'A') }],
        [
          { text: 'Xem từng mục', callback_data: signCallbackData(key, campaignId, 'L') },
          { text: 'Bỏ chiến dịch', callback_data: signCallbackData(key, campaignId, 'D') },
        ],
      ],
    }
  }

  /** Queues the campaign message to the cooperative's managers once A9 has stored the campaign (contract C4, C6). */
  async enqueueCampaign(htxCode: string, campaignId: string): Promise<void> {
    const message = await this.campaignMessage(htxCode, campaignId)
    if (!message?.buttons) return
    const recipients = await this.repo.userLinkRecipients(htxCode, ['manager'])
    if (recipients.length === 0) return
    await this.repo.enqueue(
      recipients.map((link) => ({
        htxCode,
        chatId: link.chatId,
        op: 'send' as const,
        text: message.text,
        buttons: message.buttons,
        purpose: 'reply' as const,
      }))
    )
    await this.campaigns!.markTelegramSent(htxCode, campaignId)
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
    const campaignLines = kind === 'daily' ? await this.reportCampaign(htxCode, periodStart) : []
    if (kind === 'daily') campaignLines.push(...(await this.reportAutopilot(htxCode, periodStart)))
    const improvementLines = kind === 'weekly' ? await this.reportImprovements(htxCode) : []
    const text = reportText(
      kind,
      periodStart,
      periodEnd,
      { ...figures, proposals_open: counts.open, proposals_decided: counts.decided },
      [...campaignLines, ...improvementLines]
    )
    const recipients = [
      ...(await this.repo.userLinkRecipients(htxCode, ['manager', 'officer'])),
      ...(await this.repo.groupLinkRecipients(htxCode)),
    ]
    await this.repo.enqueue(
      recipients.map((link) => ({ htxCode, chatId: link.chatId, op: 'send' as const, text, purpose: 'report' as const }))
    )
    return true
  }

  /** The 18:00 section of autonomous mode, only when the mode was on during the day (C5). */
  private async reportAutopilot(htxCode: string, day: string): Promise<string[]> {
    if (!this.autopilot) return []
    const start = vnMidnight(day)
    const summary = await this.autopilot.daySummary(htxCode, start, new Date(start.getTime() + DAY_MS))
    if (!summary.wasOn) return []
    return [
      `Tự vận hành: ${summary.ran} việc đã tự chạy, ${summary.blocked} bị chặn, ${summary.brakes} lần phanh, chi phí ${summary.costUsd.toFixed(2)} USD`,
    ]
  }

  /** The weekly report's improvement lines: the week's new proposals and the measurements of the last seven days (C6). */
  private async reportImprovements(htxCode: string): Promise<string[]> {
    if (!this.improvements) return []
    const now = this.now()
    const created = await this.improvements.countForWeek(htxCode, vnMondayOf(now))
    const from = new Date(now.getTime() - 7 * DAY_MS)
    const measured = await this.improvements.measuredBetween(htxCode, from, now)
    return weeklyImprovementLines(created, measuredLines(measured, from, now))
  }

  /**
   * The campaign lines of the 18:00 report (C9): the outcome per goal is written, and a campaign whose items are all
   * decided becomes done. A dropped or missing campaign adds nothing.
   */
  private async reportCampaign(htxCode: string, day: string): Promise<string[]> {
    const campaigns = this.campaigns
    if (!campaigns) return []
    const campaign = await campaigns.findForDay(htxCode, day)
    if (!campaign || campaign.status === 'dropped') return []

    const items = await campaigns.items(htxCode, campaign.id)
    const done = items.filter((i) => i.proposalStatus === 'executed')
    const outcomes = campaign.goals.map((goal) => ({
      goalKey: goal.goalKey,
      target: goal.target,
      actual: done.filter((i) => i.goalKey === goal.goalKey).reduce((sum, i) => sum + i.target, 0),
    }))
    await campaigns.writeOutcomes(htxCode, campaign.id, outcomes)

    const stillOpen = items.filter((i) => i.proposalStatus === 'proposed' || i.proposalStatus === 'approved').length
    if (stillOpen === 0) {
      await campaigns.setStatus(htxCode, campaign.id, {
        to: 'done',
        from: ['draft', 'approved', 'partial'],
        event: { op: 'agent.campaign.done', details: { executed: done.length, items: items.length } },
      })
    }

    const lines = [`Chiến dịch hôm nay: ${done.length}/${items.length} việc xong`]
    campaign.goals.slice(0, 3).forEach((goal, index) => {
      const outcome = outcomes[index]
      lines.push(`• ${goal.labelVi}: ${outcome.actual}/${outcome.target} ${goal.unitVi}`)
    })
    if (items.length > done.length) lines.push(`Chưa xong: ${items.length - done.length} việc`)
    return lines
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
