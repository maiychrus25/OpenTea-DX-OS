// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'

async function listMembers(request: Request) {
  const { htxCode } = await requireTenant()

  const url = new URL(request.url)
  const filterRole = url.searchParams.get('role')
  const adapter = new KeycloakAdminAdapter()
  
  try {
    let data: any[] = []
    if (filterRole) {
      data = await adapter.listUsersByRole(filterRole, htxCode)
    } else {
      const [farmers, officers] = await Promise.all([
        adapter.listUsersByRole('farmer', htxCode),
        adapter.listUsersByRole('officer', htxCode)
      ])
      // Map roles so the UI knows
      const farmersWithRole = farmers.map(f => ({ ...f, role: 'farmer' }))
      const officersWithRole = officers.map(o => ({ ...o, role: 'officer' }))
      data = [...farmersWithRole, ...officersWithRole]
    }
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
