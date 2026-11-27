// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { defaultActiveRole, homeFor, rolesFromRealmRoles } from '@/lib/auth/roles'

describe('rolesFromRealmRoles', () => {
  test('returns every human role in priority order', () => {
    expect(rolesFromRealmRoles(['farmer', 'platform_admin', 'manager', 'accountant', 'officer'])).toEqual([
      'manager',
      'officer',
      'accountant',
      'farmer',
      'platform_admin',
    ])
  })

  test('ignores unknown realm roles and service roles', () => {
    expect(rolesFromRealmRoles(['offline_access', 'agent', 'telegram', 'admin', 'staff', 'farmer'])).toEqual(['farmer'])
    expect(rolesFromRealmRoles(['agent', 'telegram'])).toEqual([])
  })

  test('tolerates garbage input', () => {
    expect(rolesFromRealmRoles(undefined)).toEqual([])
    expect(rolesFromRealmRoles('manager')).toEqual([])
    expect(rolesFromRealmRoles([1, null, { a: 1 }, 'officer'])).toEqual(['officer'])
  })
})

describe('defaultActiveRole', () => {
  test('follows manager > officer > accountant > farmer > platform_admin', () => {
    expect(defaultActiveRole(['platform_admin', 'farmer'])).toBe('farmer')
    expect(defaultActiveRole(['farmer', 'accountant'])).toBe('accountant')
    expect(defaultActiveRole(['accountant', 'officer'])).toBe('officer')
    expect(defaultActiveRole(['officer', 'manager'])).toBe('manager')
  })

  test('is undefined for no roles', () => {
    expect(defaultActiveRole([])).toBeUndefined()
  })
})

describe('homeFor', () => {
  test('maps a role to its landing page', () => {
    expect(homeFor('manager')).toBe('/manager/dashboard')
    expect(homeFor('accountant')).toBe('/accountant/dashboard')
    expect(homeFor('platform_admin')).toBe('/platform')
  })
})
