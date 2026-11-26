// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import React from 'react'
import { auth } from '@/auth'
import { ShortsPage } from '@/components/features/shorts/ShortsPage'

export const metadata = { title: 'Video ngắn' }

export default async function VideosPage() {
  const session = await auth()
  return <ShortsPage userName={session?.user.name || 'Tôi'} />
}
