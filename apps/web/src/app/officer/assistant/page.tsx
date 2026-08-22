// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ChatPanel } from '../../manager/chat/_components/ChatPanel'

export const metadata = {
  title: 'Trợ lý Thị trường | DX-AgriMarket',
  description: 'Hỏi đáp thông tin thị trường nông sản với trợ lý AI',
}

export default async function OfficerAssistantPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const role = (session.user as { role?: string }).role
  if (role !== 'officer' && role !== 'manager') redirect('/unauthorized')

  return (
    <ChatPanel
      userId={session.user.id!}
      userName={session.user.name || 'Cán bộ Kỹ thuật'}
    />
  )
}
