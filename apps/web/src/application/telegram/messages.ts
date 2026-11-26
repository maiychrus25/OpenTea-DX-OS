// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Vietnamese message wording for Telegram. Pure: no personal data, only codes, counts and dates (spec §8.3).
import { formatVnDate } from '@/application/agent/actions/journal-labels'
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
  campaignApproved: (r: { executed: number; waitingHigh: number; forwarded: number; failed: number }) =>
    `Đã duyệt chiến dịch: ${r.executed} việc đã chạy, ${r.waitingHigh} việc chờ xác nhận riêng, ${r.forwarded} việc chuyển người đủ quyền.` +
    (r.failed > 0 ? ` ${r.failed} việc lỗi.` : ''),
}

/** Button labels of the chat cards and steps (contract C10). */
export const TELEGRAM_BUTTON = {
  confirm: 'Xác nhận',
  cancel: 'Huỷ',
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
      return `Đã được ${by} duyệt lúc ${at}, đã thực hiện.`
    case 'failed':
      return `Đã được ${by} duyệt lúc ${at}, thực hiện lỗi.`
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
}

export function campaignText(day: string, summaryVi: string, lines: CampaignLine[]): string {
  const [, month, dayOfMonth] = day.split('-')
  const out = [`Chiến dịch ngày ${dayOfMonth}/${month}: ${lines.length} việc`, summaryVi]
  lines.slice(0, 4).forEach((line, index) => out.push(`${index + 1}. ${line.title} · ${line.target} ${line.unitVi}`))
  if (lines.length > 4) out.push(`… và ${lines.length - 4} việc khác`)
  return out.join('\n')
}
