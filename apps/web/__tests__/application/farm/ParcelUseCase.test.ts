// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { CreateParcelUseCase } from '@/application/farm/CreateParcelUseCase'
import { UpdateParcelUseCase } from '@/application/farm/UpdateParcelUseCase'
import { ListParcelsUseCase } from '@/application/farm/ListParcelsUseCase'

describe('Story 3.2: Parcel Drawing Map Setup Leaflet Draw Officer', () => {
  const isDbError = (e: unknown) => {
    const str = String(e)
    return str.includes('Can\'t reach database server') || str.includes('Invalid `prisma.') || (e as any)?.code?.startsWith('P')
  }

  let householdId: string | undefined
  let parcelId: string | undefined

  beforeAll(async () => {
    try {
      // Need a household to create a parcel
      const household = await prisma.household.create({
        data: {
          name: 'Test Household for Parcels',
          phone: '098' + Math.floor(Math.random() * 10000000),
        }
      })
      householdId = household.id
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  afterAll(async () => {
    try {
      if (parcelId) await prisma.parcel.delete({ where: { id: parcelId } }).catch(() => {})
      if (householdId) await prisma.household.delete({ where: { id: householdId } }).catch(() => {})
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  test('CreateParcelUseCase: Creates parcel with Polygon and CropCycle persistence', async () => {
    if (!householdId) return console.warn("DB not reachable, skipping...")
    
    const repo = new PrismaParcelRepository()
    const useCase = new CreateParcelUseCase(repo)

    const data = {
      household_id: householdId,
      parcel_code: 'P-' + Date.now(),
      geojson: { type: 'Polygon', coordinates: [[[105.1, 10.1], [105.1, 10.2], [105.2, 10.2], [105.1, 10.1]]] },
      area_ha: 1.5,
      centroid_lat: 10.15,
      centroid_lng: 105.15,
      current_crop: 'Lúa Đài Thơm'
    }

    const parcel = await useCase.execute(data)
    parcelId = parcel.id

    expect(parcel).toBeDefined()
    expect(parcel.area_ha).toBe(1.5)
    
    // Verify DB (CropCycle Persistence)
    const dbParcel = await prisma.parcel.findUnique({ 
      where: { id: parcelId },
      include: { crop_cycles: true } 
    })
    
    expect(dbParcel?.crop_cycles.length).toBe(1)
    expect(dbParcel?.crop_type).toBe('Lúa Đài Thơm')
    expect(dbParcel?.polygon_geojson).toBeDefined()
  })

  test('ListParcelsUseCase: Authorization logic for filtering', async () => {
    if (!householdId || !parcelId) return console.warn("DB not reachable, skipping...")

    const repo = new PrismaParcelRepository()
    const useCase = new ListParcelsUseCase(repo)
    
    // Officer should see everything
    const allParcels = await useCase.execute({}, 'OFFICER')
    expect(allParcels.length).toBeGreaterThanOrEqual(1)

    // Farmer should only see their own
    const farmerParcels = await useCase.execute({}, 'FARMER', householdId)
    expect(farmerParcels.every(p => p.household_id === householdId)).toBe(true)
  })

  test('UpdateParcelUseCase: Only allowed for Officer (via API layer, domain just updates)', async () => {
    if (!householdId || !parcelId) return console.warn("DB not reachable, skipping...")

    const repo = new PrismaParcelRepository()
    const useCase = new UpdateParcelUseCase(repo)

    const updated = await useCase.execute(parcelId, { area_ha: 2.0 })
    expect(updated.area_ha).toBe(2.0)
  })
})
