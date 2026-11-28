/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

jest.mock('@/auth', () => ({ auth: jest.fn((handler: unknown) => handler) }))

import { resolveAuthRedirect } from '@/middleware'

const areas = [
  ['/manager/dashboard', 'manager'],
  ['/officer/dashboard', 'officer'],
  ['/farmer/dashboard', 'farmer'],
  ['/accountant/dashboard', 'accountant'],
  ['/platform', 'platform_admin'],
] as const

describe('middleware role areas', () => {
  test.each(areas)('%s is open to the active role %s', (path, role) => {
    expect(resolveAuthRedirect(path, true, role, '', [role])).toBeNull()
  })

  test.each(areas)('%s is closed to a role that does not hold %s', (path, role) => {
    const other = areas.find(([, r]) => r !== role)![1]
    expect(resolveAuthRedirect(path, true, other, '', [other])).toBe('/unauthorized')
  })

  test.each(areas)('%s sends a holder of %s who is on another active role to the switch page', (path, role) => {
    const other = areas.find(([, r]) => r !== role)![1]
    expect(resolveAuthRedirect(path, true, other, '', [other, role])).toBe(`/unauthorized?switch=${role}`)
  })

  test('a legacy session (no roles list) is treated as holding only its role', () => {
    expect(resolveAuthRedirect('/manager/dashboard', true, 'manager')).toBeNull()
    expect(resolveAuthRedirect('/manager/dashboard', true, 'farmer')).toBe('/unauthorized')
  })

  test('the root goes to the home of the active role', () => {
    expect(resolveAuthRedirect('/', true, 'accountant', '', ['accountant'])).toBe('/accountant/dashboard')
    expect(resolveAuthRedirect('/', true, 'platform_admin', '', ['platform_admin'])).toBe('/platform')
  })

  test('an unrecognised active role is fail-closed', () => {
    expect(resolveAuthRedirect('/manager/dashboard', true, 'admin', '', ['admin'])).toBe('/unauthorized')
    expect(resolveAuthRedirect('/', true, undefined)).toBe('/unauthorized')
  })

  test('an active role that is not in the roles list never opens an area', () => {
    expect(resolveAuthRedirect('/manager/dashboard', true, 'manager', '', ['farmer'])).toBe('/unauthorized')
  })
})
