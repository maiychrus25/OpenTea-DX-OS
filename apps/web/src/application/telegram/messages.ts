// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Vietnamese message wording for Telegram. Pure: no personal data, only codes, counts and dates (spec §8.3).
import { formatVnDate } from '@/application/agent/actions/journal-labels'
import type { StopReason } from '@/domain/agent/autopilot'
import type { Proposal } from '@/domain/agent/proposal'

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh'
const MAX_PREVIEW_LINES = 5
const MAX_REASON_CHARS = 160

export function formatVnClock(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: VN_TIMEZONE }).format(date)
}

/** `2026-11-24` to `24/11/2026`, without any timezone conversion. */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export const TELEGRAM_TEXT = {
  welcome: (name: string) =>
    `Đã kết nối tài khoản ${name}. Tin nhắn từ hệ thống sẽ được gửi qua máy chủ của Telegram. Nếu HTX bật nhà cung cấp AI bên ngoài cho trợ lý, câu bạn nhắn cũng được gửi tới nhà cung cấp đó. Gửi /menu để bắt đầu.`,
  openFromProfile: 'Vui lòng mở liên kết từ trang Hồ sơ trong ứng dụng để lấy mã kết nối.',
  invalidCode: 'Mã kết nối không đúng hoặc đã hết hạn. Vui lòng tạo mã mới trong trang Hồ sơ.',
  unlinked: 'Đã gỡ liên kết Telegram với tài khoản này.',
  notLinked: 'Tài khoản Telegram này chưa được liên kết.',
  groupLinked: 'Đã kết nối nhóm này với HTX. Nhóm sẽ nhận báo cáo tự động.',
  rejectPrompt: 'Nhập lý do từ chối đề xuất (tối đa 500 ký tự). Gửi /huy để hủy.',
  rejectCancelled: 'Đã hủy từ chối đề xuất.',
  rejectNoReason: 'Vui lòng nhập lý do từ 1 đến 500 ký tự, hoặc gửi /huy để hủy.',
  invalidButton: 'Nút không hợp lệ.',
  groupCallback: 'Vui lòng bấm nút trong tin nhắn riêng với bot.',
  noLongerApprover: 'Bạn không còn quyền duyệt đề xuất này.',
  roleCheckUnavailable: 'Chưa kiểm tra được quyền của bạn. Vui lòng thử lại sau.',
  otherCooperative: 'Đề xuất này không thuộc HTX của bạn.',
  approved: 'Đã duyệt đề xuất.',
  executed: 'Đã duyệt và thực hiện đề xuất.',
  sentToStaffApp: 'Đã duyệt. Đã gửi app nhân sự.',
  failedExecution: 'Đã duyệt nhưng thực hiện lỗi. Xem chi tiết trên web.',
  rejected: 'Đã từ chối đề xuất.',
  stale: 'Dữ liệu nguồn đã thay đổi, đề xuất không còn hiệu lực.',
  expired: 'Đề xuất đã hết hạn.',
  alreadyDecided: (by: string | null) => `Đề xuất đã được ${by ?? 'người khác'} xử lý.`,
  // Chat assistant (M5, contract C10).
  menuPrompt: 'Bạn cần gì? Chọn một mục bên dưới, hoặc nhắn câu hỏi bằng tiếng Việt.',
  askPrompt: 'Bạn muốn hỏi gì? Ví dụ: Giá chè hôm nay thế nào?',
  thinking: 'Đang tìm câu trả lời…',
  assistantTimeout: 'Chưa trả lời kịp. Bạn chọn một mục trong menu nhé.',
  notUnderstood: 'Chưa hiểu câu này. Bạn chọn một mục trong menu, hoặc nhắn lại ngắn hơn.',
  noPermission: (title: string) => `Tài khoản của bạn không có quyền: ${title}.`,
  notYet: 'Việc này chưa làm được qua Telegram. Bạn dùng trang web nhé.',
  flowCancelled: 'Đã huỷ. Không có gì được ghi.',
  nothingToCancel: 'Không có việc nào đang làm dở.',
  flowExpired: 'Phiên nhập đã hết hạn. Gửi /menu để bắt đầu lại.',
  staleButton: 'Nút này đã cũ. Gửi /menu để bắt đầu lại.',
  cardFooter: 'Thẻ hết hạn sau 10 phút. Không bấm Xác nhận thì không có gì được ghi.',
  secondCardTitle: 'Xác nhận lần cuối',
  secondCardFooter: 'Nút hết hạn sau 10 phút.',
  cardExpired: 'Thẻ đã hết hạn. Không có gì được thực hiện.',
  expectChoice: 'Bạn chọn một nút bên trên nhé.',
  expectText: 'Bước này cần nhắn chữ.',
  expectPhoto: 'Bước này cần một ảnh.',
  invalidNumber: (min: number, max: number) => `Nhập một số nguyên từ ${min} đến ${max}.`,
  tooLong: (max: number) => `Tối đa ${max} ký tự.`,
  noMatch: 'Không có trong danh sách. Bạn nhập lại nhé.',
  photoTooLarge: 'Ảnh lớn hơn 5 MB. Bạn gửi ảnh nhỏ hơn nhé.',
  photoFailed: 'Chưa nhận được ảnh. Bạn gửi lại nhé.',
  photoOutsideFlow: 'Đã nhận ảnh. Muốn ghi nhật ký hoặc báo bệnh, bạn chọn trong menu rồi gửi lại ảnh.',
  // Voice messages (M15, contract C2 and C3).
  voiceHeard: (text: string) => `Em nghe được: “${text}”`,
  voiceTooLong: 'Tin thoại dài quá 60 giây. Bạn nói ngắn hơn hoặc nhắn chữ nhé.',
  voiceUnavailable: 'Chưa nghe được tin thoại lúc này. Bạn nhắn chữ giúp nhé.',
  voiceUnclear: 'Chưa nghe rõ. Bạn nói lại hoặc nhắn chữ nhé.',
  voiceRetype: 'Bạn nhắn lại câu đúng nhé.',
  voiceTypeAnswer: 'Trợ lý đang chờ câu trả lời của bạn. Bạn trả lời bằng chữ giúp nhé.',
  voiceDropped: 'Đã bỏ câu vừa nói. Bạn trả lời tiếp bằng chữ hoặc nói lại nhé.',
  locationNoParcel: 'Không tìm thấy thửa nào có toạ độ.',
  rateLimited: 'Bạn đã gửi 60 tin trong một giờ. Vui lòng thử lại sau.',
  executeFailed: (message: string) => `Chưa thực hiện được: ${message}`,
  // Daily campaign (M7, contract C6).
  campaignDone: 'Chiến dịch đã được xử lý.',
  campaignNotFound: 'Không tìm thấy chiến dịch này.',
  campaignNotAllowed: 'Bạn không có quyền xử lý chiến dịch này.',
  campaignNoOpenItems: 'Không còn việc nào chờ duyệt trong chiến dịch.',
  campaignDropped: 'Đã bỏ chiến dịch hôm nay.',
  campaignListed: 'Đã gửi lại các việc chờ duyệt.',
  noCampaignToday: 'Hôm nay chưa có chiến dịch.',
  // Autonomous mode (M12, contract C5).
  autopilotBlocked: 'Đã chặn. Đề xuất chuyển về chờ duyệt.',
  autopilotAlreadyRan: 'Đã chạy, không chặn được nữa.',
  autopilotNotScheduled: 'Việc này không còn chờ tự chạy.',
  autopilotStopped: 'Đã dừng tự vận hành. Các việc đang chờ chuyển về chờ duyệt.',
  autopilotOff: 'Tự vận hành đang tắt.',
  autopilotNotAllowed: 'Chỉ trưởng HTX hoặc cán bộ kỹ thuật được dùng lệnh này.',
  campaignApproved: (r: { executed: number; waitingHigh: number; forwarded: number; failed: number }) =>
    `Đã duyệt chiến dịch: ${r.executed} việc đã chạy, ${r.waitingHigh} việc chờ xác nhận riêng, ${r.forwarded} việc chuyển người đủ quyền.` +
    (r.failed > 0 ? ` ${r.failed} việc lỗi.` : ''),
}

/** Button labels of the chat cards and steps (contract C10). */
export const TELEGRAM_BUTTON = {
  confirm: 'Xác nhận',
  cancel: 'Huỷ',
  voiceOk: 'Đúng',
  voiceEdit: 'Sửa',
  voiceDrop: 'Bỏ câu này',
  next: 'Tiếp tục',
  finalConfirm: 'Xác nhận lần cuối',
  skip: 'Bỏ qua',
}

/** Proposal message: title, up to five preview lines, a short reason and the expiry. */
export function proposalText(proposal: Proposal, titleVi: string, preview: string[]): string {
  const lines = [`Đề xuất: ${titleVi}`]
  preview.slice(0, MAX_PREVIEW_LINES).forEach((line) => lines.push(line))
  if (preview.length > MAX_PREVIEW_LINES) lines.push(`… và ${preview.length - MAX_PREVIEW_LINES} mục khác`)
  lines.push(`Lý do: ${truncate(proposal.reasonVi, MAX_REASON_CHARS)}`)
  lines.push(`Hết hạn: ${formatVnDate(proposal.expiresAt)?.slice(0, 5)} ${formatVnClock(proposal.expiresAt)}`)
  return lines.join('\n')
}

/** The line every sent proposal message is edited to once the proposal leaves the open state. */
export function proposalResultText(proposal: Proposal): string | null {
  const by = proposal.decidedByName ?? 'người duyệt'
  const at = proposal.decidedAt ? formatVnClock(proposal.decidedAt) : ''
  switch (proposal.status) {
    case 'executed':
      return proposal.decisionChannel === 'autopilot' ? `AI đã tự thực hiện lúc ${at}.` : `Đã được ${by} duyệt lúc ${at}, đã thực hiện.`
    case 'sent_to_staff_app':
      return `Đã được ${by} duyệt lúc ${at}. Đã gửi app nhân sự.`
    case 'failed':
      return proposal.decisionChannel === 'autopilot'
        ? `AI đã tự thực hiện lúc ${at}, thực hiện lỗi.`
        : `Đã được ${by} duyệt lúc ${at}, thực hiện lỗi.`
    case 'rejected':
      return `Đã từ chối: ${proposal.decisionNote ?? ''}`
    case 'stale':
      return TELEGRAM_TEXT.stale
    case 'expired':
      return TELEGRAM_TEXT.expired
    default:
      return null
  }
}

/** The message of a proposal that will run on its own at `runAt`, before the Chặn and Xem buttons. */
export function autopilotScheduledText(titleVi: string, preview: string[], runAt: Date): string {
  return `Sẽ tự chạy lúc ${formatVnClock(runAt)}: ${titleVi}${preview[0] ? ` — ${preview[0]}` : ''}`
}

const STOP_REASON_TEXT: Record<StopReason, (dailyCap: number) => string> = {
  manual: () => 'Tự vận hành đã được dừng theo yêu cầu.',
  enabler_lost: () => 'Tự vận hành đã dừng: người bật không còn là trưởng HTX hoặc đã bị khoá.',
  inactive: () => 'Tự vận hành đã dừng: 7 ngày không có trưởng HTX nào thao tác.',
  brake_failures: () => 'Tự vận hành đã dừng (phanh): có 3 việc tự chạy bị lỗi trong 1 giờ.',
  brake_cap: (cap) => `Tự vận hành đã dừng (phanh): đã tự chạy đủ ${cap} việc trong ngày.`,
  brake_blocks: () => 'Tự vận hành đã dừng (phanh): hơn 30% việc trong ngày bị chặn.',
  brake_volume: () => 'Tự vận hành đã dừng (phanh): số đề xuất của một agent hôm nay vượt 3 lần mức thường ngày.',
}

export function autopilotStoppedText(reason: StopReason, returned: number, dailyCap: number): string {
  const lines = [STOP_REASON_TEXT[reason](dailyCap)]
  lines.push(returned > 0 ? `${returned} việc đang chờ đã chuyển về chờ duyệt.` : 'Các việc đang chờ chuyển về chờ duyệt.')
  lines.push('Chỉ bật lại được trên web.')
  return lines.join('\n')
}

export function autopilotEnabledText(byName: string, openedTitles: string[], dailyCap: number): string {
  const lines = [`Tự vận hành đã được bật bởi ${byName}. Các đề xuất đủ điều kiện sẽ tự chạy sau thời gian chờ để mọi người chặn.`]
  if (openedTitles.length > 0) lines.push(`Đã mở thêm: ${openedTitles.join(', ')}.`)
  lines.push(`Tối đa ${dailyCap} việc tự chạy mỗi ngày. Gửi /dung để dừng ngay.`)
  return lines.join('\n')
}

export interface AutopilotStatusFigures {
  enabled: boolean
  enabledByName: string | null
  pending: number
  ran: number
  blocked: number
  dailyCap: number
}

/** `/tuvanhanh`: the mode and today's counts. */
export function autopilotStatusText(f: AutopilotStatusFigures): string {
  if (!f.enabled) return TELEGRAM_TEXT.autopilotOff
  return [
    `Tự vận hành đang bật${f.enabledByName ? ` (bởi ${f.enabledByName})` : ''}.`,
    `Hôm nay: ${f.ran}/${f.dailyCap} việc đã tự chạy, ${f.blocked} bị chặn, ${f.pending} việc đang chờ giờ chạy.`,
    'Gửi /dung để dừng ngay.',
  ].join('\n')
}

export interface ReportFigures {
  journals_new?: number
  journals_approved?: number
  journals_pending?: number
  proposals_open?: number
  proposals_decided?: number
  disease_reports?: number
  lots_created?: number
}

const MAX_REPORT_LINES = 8

/**
 * The header, up to three lines of figures and, on the daily report, the campaign lines (C9). Missing figures are left
 * out; when the report would pass eight lines, the lowest-priority figure lines go first.
 */
export function reportText(
  kind: 'daily' | 'weekly',
  periodStart: string,
  periodEnd: string,
  figures: ReportFigures,
  campaignLines: string[] = []
): string {
  const range = periodStart === periodEnd ? formatIsoDate(periodStart) : `${formatIsoDate(periodStart)} – ${formatIsoDate(periodEnd)}`
  const lines = [`Báo cáo ${kind === 'daily' ? 'ngày' : 'tuần'} ${range}`]
  const part = (label: string, value: number | undefined, suffix = '') =>
    value === undefined ? null : `${label}: ${value}${suffix}`

  const journals = [
    part('Nhật ký mới', figures.journals_new),
    part('đã duyệt', figures.journals_approved),
    part('chờ duyệt', figures.journals_pending),
  ].filter(Boolean)
  const figureLines: string[] = []
  if (journals.length) figureLines.push(journals.join(' · '))

  const proposals = [
    part('Đề xuất đang mở', figures.proposals_open),
    part('đã xử lý', figures.proposals_decided),
  ].filter(Boolean)
  if (proposals.length) figureLines.push(proposals.join(' · '))

  const others = [part('Báo cáo bệnh hại', figures.disease_reports), part('Lô mới', figures.lots_created)].filter(Boolean)
  if (others.length) figureLines.push(others.join(' · '))

  while (lines.length + figureLines.length + campaignLines.length > MAX_REPORT_LINES && figureLines.length) figureLines.pop()
  return [...lines, ...figureLines, ...campaignLines].join('\n')
}

export function healthText(condition: string, detail: string): string {
  return `Cảnh báo hệ thống: ${condition}\n${detail}`
}

/** Campaign message (contract C6): the day, the count, A9's summary and up to four items. */
export interface CampaignLine {
  title: string
  target: number
  unitVi: string
  /** M12: when this item will run on its own. */
  runAt?: Date | null
}

export function campaignText(
  day: string,
  summaryVi: string,
  lines: CampaignLine[],
  reminders: string[] = [],
  autopilot = false
): string {
  const [, month, dayOfMonth] = day.split('-')
  const out = [`Chiến dịch ngày ${dayOfMonth}/${month}: ${lines.length} việc`, summaryVi]
  if (autopilot) out.unshift('Chiến dịch hôm nay sẽ tự chạy')
  lines.slice(0, 4).forEach((line, index) =>
    out.push(`${index + 1}. ${line.title} · ${line.target} ${line.unitVi}${autopilot && line.runAt ? ` · tự chạy lúc ${formatVnClock(line.runAt)}` : ''}`)
  )
  if (lines.length > 4) out.push(`… và ${lines.length - 4} việc khác`)
  return [...out, ...reminders].join('\n')
}
