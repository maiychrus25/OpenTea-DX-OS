// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { ReplyButton } from '../TelegramUpdateHandler'
import type { ChatRole } from './types'

/** The web's HTTPS base URL (D17). Without it the Mini App buttons are not shown and chat works as before. */
export function miniAppBaseUrl(): string | null {
  const url = process.env.DXOS_WEB_PUBLIC_URL?.trim().replace(/\/+$/, '')
  return url && url.startsWith('https://') ? url : null
}

function webApp(text: string, path: string): ReplyButton | null {
  const base = miniAppBaseUrl()
  return base ? { text, web_app: { url: `${base}${path}` } } : null
}

export const OPEN_APP_LABEL = 'Mở ứng dụng'
export const EDIT_LABEL = 'Sửa'
export const DETAIL_LABEL = 'Mở chi tiết'

/** `/telegram/open` signs in, binds Telegram and then goes to `to`; the page keeps only paths of its allowed list. */
function openPath(to?: string): string {
  return to ? `/telegram/open?to=${encodeURIComponent(to)}` : '/telegram/open'
}

export function openAppButton(): ReplyButton | null {
  return webApp(OPEN_APP_LABEL, openPath())
}

/**
 * `Sửa` of a confirmation card: the matching web form, prefilled. Only farmers have such a form (`journal.create`);
 * officers journal through the household approval page and `harvest.approve` has no page of its own, so those get none.
 */
export function editButton(kind: string, payload: Record<string, unknown>, role: ChatRole): ReplyButton | null {
  if (kind !== 'journal.create' || role !== 'farmer') return null
  const query = new URLSearchParams()
  const put = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  put('parcel', payload.parcel_id)
  put('activity', payload.activity_type)
  put('product', payload.product_name)
  put('dosage', payload.dosage)
  put('withdrawal', payload.withdrawal_days)
  return webApp(EDIT_LABEL, openPath(`/farmer/journal/new?${query.toString()}`))
}

/** `Mở chi tiết` of a `high` proposal: the manager's inbox on that proposal. */
export function detailButton(proposalId: string): ReplyButton | null {
  return webApp(DETAIL_LABEL, openPath(`/manager/ai?proposal=${proposalId}`))
}
