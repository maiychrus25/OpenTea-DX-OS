/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import * as journal from '@/app/api/journal/route'

const findAll = jest.fn().mockResolvedValue({ entries: [], total: 0 })
const findByKeycloakUserId = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/infrastructure/core/core-gateway.client', () => ({ CoreGatewayClient: jest.fn() }))
jest.mock('@/infrastructure/core/gateway-journal-reader', () => ({
  GatewayJournalReader: jest.fn(() => ({ findAll: (...args: unknown[]) => findAll(...args) })),
}))
jest.mock('@/infrastructure/db/farm/PrismaHouseholdRepository', () => ({
  PrismaHouseholdRepository: jest.fn(() => ({ findByKeycloakUserId: (...args: unknown[]) => findByKeycloakUserId(...args) })),
}))
jest.mock('@/infrastructure/storage/minio-document.adapter', () => ({
  MinioDocumentAdapter: jest.fn(() => ({ generateDownloadUrl: jest.fn() })),
}))

const get = () => new Request('http://localhost/api/journal')
const signIn = (role: string) =>
  (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1', role, htxCode: 'TC', name: 'An' } })

describe('GET /api/journal without a household', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    findAll.mockResolvedValue({ entries: [], total: 0 })
  })

  it('answers an empty list for a farmer with no household, without asking the core for entries', async () => {
    signIn('farmer')
    findByKeycloakUserId.mockResolvedValue(null)

    const res = await journal.GET(get(), {})

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [], meta: { page: 1, total: 0 } })
    expect(findAll).not.toHaveBeenCalled()
  })

  it('still filters a farmer with a household by that household', async () => {
    signIn('farmer')
    findByKeycloakUserId.mockResolvedValue({ id: 'h1' })

    await journal.GET(get(), {})

    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ household_id: 'h1' }))
  })

  it('leaves an officer unfiltered', async () => {
    signIn('officer')

    await journal.GET(get(), {})

    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ household_id: undefined }))
  })
})
