// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ChatInterface } from '@/components/ui/chat-interface/chat-interface'

export const metadata = {
  title: 'Chatbot',
  description: 'Hỏi đáp về canh tác chè với trợ lý AI',
}

export default async function FarmerAiPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if (session.user.role !== 'farmer') redirect('/unauthorized')

  return <ChatInterface role="farmer" />
}
