// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { safeCallbackUrl } from '@/app/(auth)/login/_components/login-form'

describe('safeCallbackUrl', () => {
  it('keeps the Mini App entry with its query', () => {
    expect(safeCallbackUrl('/telegram/open')).toBe('/telegram/open')
    expect(safeCallbackUrl('/telegram/open?to=%2Fmanager%2Fai')).toBe('/telegram/open?to=%2Fmanager%2Fai')
  })
  it.each([null, undefined, '', '/manager/dashboard', 'https://evil.example', '//evil.example', '/telegram/openx', '/telegram/open#x'])(
    'sends %s to the role home',
    (value) => expect(safeCallbackUrl(value as string)).toBe('/')
  )
})
