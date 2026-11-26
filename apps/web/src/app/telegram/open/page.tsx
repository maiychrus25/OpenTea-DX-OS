// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { TelegramOpenBinder } from '@/components/features/telegram/TelegramOpenBinder'
import { miniAppTarget, type MiniAppRole } from '@/lib/telegram-webapp-target'

export const metadata: Metadata = { title: 'Mở ứng dụng' }

/** Where the bot's menu button and chat buttons land: sign in if needed, bind Telegram, then open the target. */
export default async function TelegramOpenPage({ searchParams }: { searchParams: { to?: string } }) {
  const user = (await auth())?.user
  if (!user?.id) redirect('/login')
  const role = user.role as MiniAppRole
  return (
    <main style={{ padding: '24px 16px' }}>
      <TelegramOpenBinder target={miniAppTarget(role, searchParams.to)} />
    </main>
  )
}
