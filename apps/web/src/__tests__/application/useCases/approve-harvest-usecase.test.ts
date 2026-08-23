// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { ApproveHarvestUseCase } from '@/application/farm/approve-harvest-usecase'
import { ParcelPort } from '@/domain/farm/ports/ParcelPort'
import { JournalPort } from '@/domain/journal/ports/JournalPort'
import { NotificationPort } from '@/domain/ports/notification-port'
import { DomainError } from '@/domain/errors/DomainError'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'

describe('ApproveHarvestUseCase', () => {
  let mockParcelPort: jest.Mocked<ParcelPort>
  let mockJournalPort: jest.Mocked<JournalPort>
  let mockNotificationPort: jest.Mocked<NotificationPort>
  let useCase: ApproveHarvestUseCase

  beforeEach(() => {
    mockParcelPort = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      approveHarvest: jest.fn(),
    } as any

    mockJournalPort = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      batchApprove: jest.fn(),
    } as any

    mockNotificationPort = {
      getRecentByUserId: jest.fn(),
      markAsRead: jest.fn(),
      delete: jest.fn(),
      updatePreferences: jest.fn(),
      broadcastDiseaseReport: jest.fn(),
      broadcastAnnouncement: jest.fn(),
      broadcastHarvestApproved: jest.fn(),
    } as any

    useCase = new ApproveHarvestUseCase(mockParcelPort, mockJournalPort, mockNotificationPort)
  })

  it('should block non-officer/manager roles', async () => {
    await expect(useCase.execute('parcel-1', 'user-1', 'farmer')).rejects.toThrow(ForbiddenError)
  })

  it('should throw if withdrawal period not passed', async () => {
    mockParcelPort.findById.mockResolvedValue({ id: 'parcel-1', parcel_code: 'P1' } as any)
    
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 5)

    mockJournalPort.findAll.mockResolvedValue({
      entries: [
        {
          activities: [
            { safe_harvest_date: futureDate }
          ]
        }
      ]
    } as any)

    await expect(useCase.execute('parcel-1', 'officer-1', 'officer')).rejects.toThrow(DomainError)
    await expect(useCase.execute('parcel-1', 'officer-1', 'officer')).rejects.toThrow('Chưa qua thời gian cách ly')
  })

  it('should approve harvest and notify manager if safe', async () => {
    mockParcelPort.findById.mockResolvedValue({ id: 'parcel-1', parcel_code: 'P1' } as any)
    
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 5)

    mockJournalPort.findAll.mockResolvedValue({
      entries: [
        {
          activities: [
            { safe_harvest_date: pastDate }
          ]
        }
      ]
    } as any)

    mockParcelPort.approveHarvest.mockResolvedValue({ id: 'parcel-1', status: 'HARVEST_APPROVED' } as any)

    const result = await useCase.execute('parcel-1', 'officer-1', 'officer')

    expect(result.status).toBe('HARVEST_APPROVED')
    expect(mockParcelPort.approveHarvest).toHaveBeenCalledWith('parcel-1', 'officer-1')
    expect(mockNotificationPort.broadcastHarvestApproved).toHaveBeenCalledWith('P1', 'officer-1')
  })
})
