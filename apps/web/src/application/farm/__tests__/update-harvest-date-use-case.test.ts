// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { UpdateHarvestDateUseCase } from '../update-harvest-date-use-case'
import { CropCyclePort } from '../../../domain/farm/ports/CropCyclePort'

describe('UpdateHarvestDateUseCase', () => {
  let useCase: UpdateHarvestDateUseCase
  let mockPort: jest.Mocked<CropCyclePort>

  beforeEach(() => {
    mockPort = {
      getHarvestSchedule: jest.fn(),
      updateEstimatedHarvestDate: jest.fn(),
      getUnscheduledActiveCycles: jest.fn(),
    }
    useCase = new UpdateHarvestDateUseCase(mockPort)
  })

  it('should call updateEstimatedHarvestDate on the port', async () => {
    mockPort.updateEstimatedHarvestDate.mockResolvedValue()

    await useCase.execute('cycle1', '2026-10-15T00:00:00.000Z')

    expect(mockPort.updateEstimatedHarvestDate).toHaveBeenCalledWith('cycle1', '2026-10-15T00:00:00.000Z')
  })
})
