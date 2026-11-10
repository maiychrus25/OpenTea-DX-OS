// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GetUnscheduledCyclesUseCase } from '../get-unscheduled-cycles-use-case'
import { CropCyclePort } from '../../../domain/farm/ports/CropCyclePort'

describe('GetUnscheduledCyclesUseCase', () => {
  let useCase: GetUnscheduledCyclesUseCase
  let mockPort: jest.Mocked<CropCyclePort>

  beforeEach(() => {
    mockPort = {
      getHarvestSchedule: jest.fn(),
      updateEstimatedHarvestDate: jest.fn(),
      getUnscheduledActiveCycles: jest.fn(),
      startNextRound: jest.fn(),
    }
    useCase = new GetUnscheduledCyclesUseCase(mockPort)
  })

  it('should call getUnscheduledActiveCycles on the port and return the result', async () => {
    const mockEvents = [
      {
        cycleId: '1',
        parcelId: 'p1',
        parcelName: 'Thửa 1',
        householdName: 'Hộ A',
        cropType: 'Lúa',
        estimatedYieldKg: 1000,
        estimatedHarvestDate: null,
        safeHarvestDate: null,
        status: 'SAFE' as const,
      }
    ]
    mockPort.getUnscheduledActiveCycles.mockResolvedValue(mockEvents)

    const result = await useCase.execute('htx-1')

    expect(mockPort.getUnscheduledActiveCycles).toHaveBeenCalledWith('htx-1')
    expect(result).toEqual(mockEvents)
  })
})
