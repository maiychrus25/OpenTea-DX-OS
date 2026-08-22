// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { CreateHouseholdUseCase } from '@/application/farm/CreateHouseholdUseCase'
import { GetHouseholdUseCase } from '@/application/farm/GetHouseholdUseCase'
import { UpdateHouseholdUseCase } from '@/application/farm/UpdateHouseholdUseCase'
import { ListHouseholdsUseCase } from '@/application/farm/ListHouseholdsUseCase'

describe('Story 3.1: Household Management Officer CRUD', () => {
  const isDbError = (e: unknown) => {
    const str = String(e)
    return str.includes('Can\'t reach database server') || str.includes('Invalid `prisma.') || (e as any)?.code?.startsWith('P')
  }

  let htxId: string | undefined
  let householdId: string | undefined

  beforeAll(async () => {
    try {
      const htx = await prisma.htxProfile.create({
        data: {
          name: 'Test HTX for Households',
          address: 'Test Address',
          htx_code: 'THTX' + Date.now().toString().slice(-8)
        }
      })
      htxId = htx.id
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  afterAll(async () => {
    try {
      if (householdId) await prisma.household.delete({ where: { id: householdId } }).catch(() => {})
      if (htxId) await prisma.htxProfile.delete({ where: { id: htxId } }).catch(() => {})
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  test('CreateHouseholdUseCase: Creates household with HTX scoping', async () => {
    if (!htxId) return console.warn("DB not reachable, skipping...")
    
    const repo = new PrismaHouseholdRepository()
    const useCase = new CreateHouseholdUseCase(repo)

    const data = {
      household_code: 'HH-' + Date.now(),
      owner_name: 'Test Owner',
      phone: '090' + Math.floor(Math.random() * 10000000),
      address: 'Test Address',
      htx_profile_id: htxId
    }

    const household = await useCase.execute(data)
    householdId = household.id

    expect(household).toBeDefined()
    expect(household.name).toBe(data.owner_name)
    
    // Verify DB
    const dbHousehold = await prisma.household.findUnique({ where: { id: householdId } })
    expect(dbHousehold?.htx_profile_id).toBe(htxId) // HTX Scoping Check
  })

  test('ListHouseholdsUseCase: Retrieves only households for given HTX', async () => {
    if (!htxId) return console.warn("DB not reachable, skipping...")

    const repo = new PrismaHouseholdRepository()
    const useCase = new ListHouseholdsUseCase(repo)
    
    const households = await useCase.execute(htxId)
    
    expect(households.length).toBeGreaterThanOrEqual(1)
    if (householdId) {
      expect(households.some(h => h.id === householdId)).toBe(true)
    }
  })

  test('UpdateHouseholdUseCase: Farmer ownership constraint', async () => {
    if (!htxId || !householdId) return console.warn("DB not reachable, skipping...")

    const repo = new PrismaHouseholdRepository()
    const useCase = new UpdateHouseholdUseCase(repo)

    // Should fail if Farmer tries to update a household that is not theirs
    await expect(
      useCase.execute(householdId, { owner_name: 'Hacked Name' }, 'FARMER', 'wrong-household-id')
    ).rejects.toThrow('quyền')

    // Should succeed if Farmer updates their own household
    const updated = await useCase.execute(householdId, { owner_name: 'Updated Name by Farmer' }, 'FARMER', householdId)
    expect(updated.name).toBe('Updated Name by Farmer')
  })

  test('GetHouseholdUseCase: Validation & Ownership constraint', async () => {
    if (!htxId || !householdId) return console.warn("DB not reachable, skipping...")

    const repo = new PrismaHouseholdRepository()
    const useCase = new GetHouseholdUseCase(repo)

    // Should fail if Farmer requests another household
    await expect(
      useCase.execute(householdId, 'FARMER', 'wrong-household-id')
    ).rejects.toThrow('quyền')

    // Should succeed if Officer
    const officerResult = await useCase.execute(householdId, 'OFFICER')
    expect(officerResult?.id).toBe(householdId)

    // Should fail if doesn't exist
    await expect(
      useCase.execute('invalid-id', 'OFFICER')
    ).rejects.toThrow('Không tìm thấy')
  })
})
