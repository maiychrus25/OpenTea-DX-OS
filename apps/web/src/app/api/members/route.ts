// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/KeycloakAdminAdapter'

async function listMembers(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const url = new URL(request.url)
  const filterRole = url.searchParams.get('role') ?? 'farmer' // Default to fetching farmers for now

  // Use Keycloak directly instead of Prisma
  const adapter = new KeycloakAdminAdapter()
  
  try {
    let data = await adapter.listUsersByRole(filterRole)
    // Filter by HTX ID if the manager has one
    // But since manager doesn't have an HTX ID easily available in session right now, we return all for MVP
    
    // Sort so newest users (createdTimestamp) appear first
    data.sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0))
    
    // Map is_active boolean to our UI statuses
    data = data.map(d => ({
      ...d,
      status: d.is_active ? 'ACTIVE' : 'PENDING'
    }))

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: { message: error.message } }, { status: 500 })
  }
}

export const GET = withErrorHandler(listMembers)
