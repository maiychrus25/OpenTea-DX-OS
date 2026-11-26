// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { signCallbackDataV2 } from '@/domain/telegram/callback-data'
import type { ChatRole } from './types'

export const MENU_LABEL = {
  today: 'Hôm nay',
  pending: 'Việc cần duyệt',
  journal: 'Ghi nhật ký',
  disease: 'Báo bệnh',
  ask: 'Hỏi',
} as const

export type MenuKey = keyof typeof MENU_LABEL

/** The buttons of each role (contract C8), shown two per row. */
export const MENU_BY_ROLE: Record<ChatRole, readonly MenuKey[]> = {
  farmer: ['today', 'journal', 'disease', 'ask'],
  officer: ['today', 'pending', 'journal', 'ask'],
  manager: ['today', 'pending', 'ask'],
}

/** Menu buttons carry the fixed token `menu`, so they stay valid until the user taps another step. */
export function menuKeyboard(role: ChatRole, callbackKey: string): { text: string; callback_data: string }[][] {
  const buttons = MENU_BY_ROLE[role].map((key) => ({
    text: MENU_LABEL[key],
    callback_data: signCallbackDataV2(callbackKey, 'menu', key),
  }))
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
  return rows
}
