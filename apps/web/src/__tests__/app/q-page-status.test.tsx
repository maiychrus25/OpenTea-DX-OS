// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { NotFoundError } from '@/domain/errors'
import QrTracePage from '@/app/q/[lot_code]/page'

const execute = jest.fn()
jest.mock('@/application/useCases/get-lot-trace-data-usecase', () => ({
  GetLotTraceDataUseCase: jest.fn(() => ({ execute: (...args: unknown[]) => execute(...args) })),
}))
jest.mock('@/infrastructure/db/repositories/prisma-lot-trace-repository', () => ({ PrismaLotTraceRepository: jest.fn() }))

test.each(['revoked', 'expired', 'invalid'])('ignores ?status=%s and shows what the lot data says', async (status) => {
  execute.mockRejectedValue(new NotFoundError('no lot'))
  const page = await (QrTracePage as any)({ params: Promise.resolve({ lot_code: 'TC-1' }), searchParams: Promise.resolve({ status }) })
  render(page)
  expect(execute).toHaveBeenCalledWith('TC-1')
  expect(screen.queryByText('Lô hàng đã bị thu hồi')).not.toBeInTheDocument()
  expect(screen.queryByText('Lô hàng đã hết hạn')).not.toBeInTheDocument()
})
