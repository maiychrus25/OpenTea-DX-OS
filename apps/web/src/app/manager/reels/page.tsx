// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { auth } from '@/auth'
import { ReelsPage } from '@/components/features/reels/ReelsPage'

export const metadata = { title: 'Reels' }

export default async function Page() {
  const session = await auth()
  return <ReelsPage userName={session?.user.name || 'Tôi'} role="manager" />
}
