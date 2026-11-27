// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ForbiddenError } from '@/domain/errors'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'

async function listMembers(request: Request) {
  const { htxCode, role } = await requireTenant()
  if (role !== 'manager' && role !== 'officer') throw new ForbiddenError('Forbidden')

  const url = new URL(request.url)
  const filterRole = url.searchParams.get('role')
  const adapter = new KeycloakAdminAdapter()
  
  try {
    // One row per person: a person who holds several roles is listed once with roles[].
    const ORDER = ['manager', 'officer', 'accountant', 'farmer']
    const byRole = await Promise.all(ORDER.map(async (r) => (await adapter.listUsersByRole(r, htxCode)).map((u) => ({ r, u }))))
    const people = new Map<string, any>()
    for (const { r, u } of byRole.flat()) {
      const person = people.get(u.id) ?? { ...u, roles: [] as string[] }
      person.roles.push(r)
      people.set(u.id, person)
    }
    let data: any[] = Array.from(people.values()).map((p) => ({ ...p, role: p.roles[0] }))
    if (filterRole) data = data.filter((p) => p.roles.includes(filterRole))
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
