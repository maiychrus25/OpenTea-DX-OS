import { HtxProfileRepository } from '@/domain/profile/ports/HtxProfileRepository'
import { GetHtxProfileUseCase } from '@/application/useCases/GetHtxProfileUseCase'
import { NotFoundError } from '@/domain/errors'

describe('GetHtxProfileUseCase', () => {
  it('returns profile when found', async () => {
    const mockProfile = {
      id: 'test-id',
      name: 'Test HTX',
      address: 'Test Address',
      contact_phone: null,
      contact_email: null,
      crop_types: ['Rice'],
      season_label: null,
      htx_code: 'TEST',
      total_area_ha: 0,
    }

    const mockRepo: HtxProfileRepository = {
      getProfile: jest.fn().mockResolvedValue(mockProfile),
      updateProfile: jest.fn(),
    }

    const useCase = new GetHtxProfileUseCase(mockRepo)
    const result = await useCase.execute()

    expect(result).toEqual(mockProfile)
    expect(mockRepo.getProfile).toHaveBeenCalledTimes(1)
  })

  it('throws NotFoundError when profile is missing', async () => {
    const mockRepo: HtxProfileRepository = {
      getProfile: jest.fn().mockResolvedValue(null),
      updateProfile: jest.fn(),
    }

    const useCase = new GetHtxProfileUseCase(mockRepo)

    await expect(useCase.execute()).rejects.toThrow(NotFoundError)
  })
})
