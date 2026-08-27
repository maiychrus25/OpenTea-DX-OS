// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ChatInterface } from '@/components/ui/chat-interface/chat-interface'

export const metadata = {
  title: 'Trợ lý Thị trường | DX-AgriMarket',
  description: 'Hỏi đáp thông tin thị trường nông sản với trợ lý AI',
}

export default async function ManagerChatPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (role !== 'manager' && role !== 'officer') redirect('/unauthorized')

  return (
    <ChatInterface role="manager" />
  )
}
