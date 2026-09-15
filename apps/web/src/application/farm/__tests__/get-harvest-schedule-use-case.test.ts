// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { GetHarvestScheduleUseCase } from '../get-harvest-schedule-use-case'
import { CropCyclePort } from '../../../domain/farm/ports/CropCyclePort'

describe('GetHarvestScheduleUseCase', () => {
  let useCase: GetHarvestScheduleUseCase
  let mockPort: jest.Mocked<CropCyclePort>

  beforeEach(() => {
    mockPort = {
      getHarvestSchedule: jest.fn(),
      updateEstimatedHarvestDate: jest.fn(),
      getUnscheduledActiveCycles: jest.fn(),
    }
    useCase = new GetHarvestScheduleUseCase(mockPort)
  })

  it('should call getHarvestSchedule on the port and return the result', async () => {
    const mockEvents = [
      {
        cycleId: '1',
        parcelId: 'p1',
        parcelName: 'Thửa 1',
        householdName: 'Hộ A',
        cropType: 'Lúa',
        estimatedYieldKg: 1000,
        estimatedHarvestDate: '2026-10-10T00:00:00.000Z',
        safeHarvestDate: null,
        status: 'SAFE' as const,
      }
    ]
    mockPort.getHarvestSchedule.mockResolvedValue(mockEvents)

    const result = await useCase.execute('2026-10-01', '2026-10-31')

    expect(mockPort.getHarvestSchedule).toHaveBeenCalledWith('2026-10-01', '2026-10-31')
    expect(result).toEqual(mockEvents)
  })
})
