/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { miniAppTarget } from '@/lib/telegram-webapp-target'

describe('miniAppTarget (C3)', () => {
  it('falls back to the role home without a target', () => {
    expect(miniAppTarget('farmer', null)).toBe('/farmer/dashboard')
    expect(miniAppTarget('officer', undefined)).toBe('/officer/dashboard')
    expect(miniAppTarget('manager', '')).toBe('/manager/dashboard')
  })

  it('keeps a same-origin path of the listed forms, with its query', () => {
    expect(miniAppTarget('farmer', '/farmer/journal/new?parcel=p1&activity=spray')).toBe('/farmer/journal/new?parcel=p1&activity=spray')
    expect(miniAppTarget('manager', '/manager/ai?proposal=abc')).toBe('/manager/ai?proposal=abc')
  })

  it.each([
    'https://evil.example/x',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/farmer/../manager/dashboard',
    '/api/profile',
    '/manager/dashboard',
    'farmer/journal/new',
  ])('refuses %s and goes home', (to) => {
    expect(miniAppTarget('farmer', to)).toBe('/farmer/dashboard')
  })

  it('does not send a role to another role\'s page', () => {
    expect(miniAppTarget('farmer', '/manager/ai')).toBe('/farmer/dashboard')
  })
})
