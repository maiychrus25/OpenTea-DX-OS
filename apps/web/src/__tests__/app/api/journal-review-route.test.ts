/** @jest-environment node */
// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { auth } from '@/auth'
import { POST } from '@/app/api/journal/[id]/review/route'
import { NotFoundError } from '@/domain/errors'

const execute = jest.fn()
const checkJournalEntry = jest.fn()

jest.mock('@/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/api/tenant', () => ({
  requireTenant: jest.fn().mockResolvedValue({ userId: 'off-1', role: 'officer', htxCode: 'TC', htxProfileId: 'htx-tc' }),
}))
jest.mock('@/lib/api/tenant-guard', () => ({
  TenantGuard: jest.fn().mockImplementation(() => ({ journalEntry: checkJournalEntry })),
}))
jest.mock('@/application/journal/RejectJournalEntryUseCase', () => ({
  RejectJournalEntryUseCase: jest.fn().mockImplementation(() => ({ execute })),
}))
jest.mock('@/infrastructure/db/journal/PrismaJournalRepository', () => ({ PrismaJournalRepository: jest.fn() }))

const post = (body: unknown) =>
  POST(new Request('http://web/api/journal/e1/review', { method: 'POST', body: JSON.stringify(body) }), {
    params: { id: 'e1' },
  })

describe('POST /api/journal/[id]/review', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'off-1', role: 'officer' } })
    checkJournalEntry.mockResolvedValue(undefined)
    execute.mockResolvedValue({ status: 'REQUEST_CHANGES' })
  })

  test('returns 403 for farmer role', async () => {
    ;(auth as jest.Mock).mockResolvedValueOnce({ user: { id: 'far-1', role: 'farmer' } })
    const res = await post({ decision: 'REJECTED', reason: 'Sai' })
    expect(res.status).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  test('returns 400 when reason is empty', async () => {
    const res = await post({ decision: 'REJECTED', reason: '   ' })
    expect(res.status).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })

  test('returns 404 for entry in another HTX', async () => {
    checkJournalEntry.mockRejectedValueOnce(new NotFoundError('Resource not found'))
    const res = await post({ decision: 'REJECTED', reason: 'Sai thửa' })
    expect(res.status).toBe(404)
    expect(execute).not.toHaveBeenCalled()
  })

  test('returns 200 and updates status on valid review', async () => {
    const res = await post({ decision: 'REQUEST_CHANGES', reason: 'Bổ sung liều lượng' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { status: 'REQUEST_CHANGES' } })
    expect(execute).toHaveBeenCalledWith('e1', {
      decision: 'REQUEST_CHANGES',
      reason: 'Bổ sung liều lượng',
      reviewerId: 'off-1',
    })
  })
})
