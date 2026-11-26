// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { signCallbackDataV2 } from '@/domain/telegram/callback-data'
import type { ReplyButton } from '../TelegramUpdateHandler'
import { openAppButton } from './mini-app'
import type { ChatRole } from './types'

export const MENU_LABEL = {
  today: 'Hôm nay',
  pending: 'Việc cần duyệt',
  journal: 'Ghi nhật ký',
  disease: 'Báo bệnh',
  ask: 'Hỏi',
} as const

export type MenuKey = keyof typeof MENU_LABEL

/**
 * The buttons of each role (contract C8), shown two per row. `disease` is left out until `disease.report` is wired:
 * the disease endpoint takes only a web session's token, which a Telegram update does not have.
 */
export const MENU_BY_ROLE: Record<ChatRole, readonly MenuKey[]> = {
  farmer: ['today', 'journal', 'ask'],
  officer: ['today', 'pending', 'journal', 'ask'],
  manager: ['today', 'pending', 'ask'],
}

/** Menu buttons carry the fixed token `menu`, so they stay valid until the user taps another step. */
export function menuKeyboard(role: ChatRole, callbackKey: string): ReplyButton[][] {
  const buttons = MENU_BY_ROLE[role].map((key) => ({
    text: MENU_LABEL[key],
    callback_data: signCallbackDataV2(callbackKey, 'menu', key),
  }))
  const rows: ReplyButton[][] = []
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
  const openApp = openAppButton()
  if (openApp) rows.push([openApp])
  return rows
}
