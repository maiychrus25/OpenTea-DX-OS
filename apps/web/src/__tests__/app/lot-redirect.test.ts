// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import LotRedirect from '@/app/lot/[lot_code]/page'

const mockRedirect = jest.fn((_url: string) => { throw new Error('NEXT_REDIRECT') })
const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND') })
jest.mock('next/navigation', () => ({ permanentRedirect: (url: string) => mockRedirect(url), notFound: () => mockNotFound() }))

const run = (code: string) => LotRedirect({ params: Promise.resolve({ lot_code: code }) })

describe('/lot/[lot_code]', () => {
  it('redirects permanently to /q/ with the code encoded', async () => {
    await expect(run('TC-CHE-20261127-001')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/q/TC-CHE-20261127-001')
    await expect(run(encodeURIComponent('TC CHÈ-1'))).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenLastCalledWith(`/q/${encodeURIComponent('TC CHÈ-1')}`)
  })

  it.each(['%E0%A4%A', encodeURIComponent('a/b'), 'x'.repeat(101)])('answers 404 for a bad code (%s)', async (code) => {
    await expect(run(code)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
