// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ListLotsUseCase } from '@/application/lot/ListLotsUseCase'
import { LotPort } from '@/domain/lot/ports/LotPort'

describe('ListLotsUseCase', () => {
  it('passes published status filters to the lot port', async () => {
    const findAll = jest.fn().mockResolvedValue([])
    const port = {
      findAll,
      findById: jest.fn(),
      create: jest.fn(),
      exportQr: jest.fn(),
    } as unknown as LotPort

    const useCase = new ListLotsUseCase(port)

    await useCase.execute({ statuses: ['READY', 'QR_EXPORTED'] })

    expect(findAll).toHaveBeenCalledWith({ statuses: ['READY', 'QR_EXPORTED'] })
  })
})
