// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'

async function listMembers(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  const url = new URL(request.url)
  const filterRole = url.searchParams.get('role')
  const adapter = new KeycloakAdminAdapter()
  
  try {
    let data: any[] = []
    if (filterRole) {
      data = await adapter.listUsersByRole(filterRole)
    } else {
      const [farmers, officers] = await Promise.all([
        adapter.listUsersByRole('farmer'),
        adapter.listUsersByRole('officer')
      ])
      // Map roles so the UI knows
      const farmersWithRole = farmers.map(f => ({ ...f, role: 'farmer' }))
      const officersWithRole = officers.map(o => ({ ...o, role: 'officer' }))
      data = [...farmersWithRole, ...officersWithRole]
    }
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
