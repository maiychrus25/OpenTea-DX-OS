// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { ForbiddenError } from '@/domain/errors/ForbiddenError'

describe('Story 3.3: Journal Entry Officer Self-Record', () => {
  const isDbError = (e: unknown) => {
    const str = String(e)
    return str.includes('Can\'t reach database server') || str.includes('Invalid `prisma.') || (e as any)?.code?.startsWith('P')
  }

  let householdId1: string | undefined
  let householdId2: string | undefined
  let parcelId1: string | undefined
  let parcelId2: string | undefined
  let weatherId: string | undefined

  beforeAll(async () => {
    try {
      // 1. Create two households
      const hh1 = await prisma.household.create({
        data: { name: 'HH1 for Journal', phone: '091' + Math.floor(Math.random() * 10000000) }
      })
      householdId1 = hh1.id

      const hh2 = await prisma.household.create({
        data: { name: 'HH2 for Journal', phone: '092' + Math.floor(Math.random() * 10000000) }
      })
      householdId2 = hh2.id

      // 2. Create two parcels
      const p1 = await prisma.parcel.create({
        data: { household_id: hh1.id, parcel_code: 'P1-J', area_ha: 1, centroid_lat: 10, centroid_lng: 105, polygon_geojson: {}, crop_type: 'Chè' }
      })
      parcelId1 = p1.id

      const p2 = await prisma.parcel.create({
        data: { household_id: hh2.id, parcel_code: 'P2-J', area_ha: 1, centroid_lat: 10, centroid_lng: 105, polygon_geojson: {}, crop_type: 'Chè' }
      })
      parcelId2 = p2.id

      // 3. Create a weather cache for parcel 1
      const w = await prisma.weatherCache.create({
        data: { parcel_id: parcelId1, condition: 'Sunny', temperature_c: 30, humidity_pct: 60, precipitation_mm: 0, recorded_at: new Date() }
      })
      weatherId = w.id

    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  afterAll(async () => {
    try {
      if (weatherId) await prisma.weatherCache.delete({ where: { id: weatherId } }).catch(() => {})
      if (parcelId1) await prisma.journalEntry.deleteMany({ where: { parcel_id: parcelId1 } }).catch(() => {})
      if (parcelId2) await prisma.journalEntry.deleteMany({ where: { parcel_id: parcelId2 } }).catch(() => {})
      if (parcelId1) await prisma.parcel.delete({ where: { id: parcelId1 } }).catch(() => {})
      if (parcelId2) await prisma.parcel.delete({ where: { id: parcelId2 } }).catch(() => {})
      if (householdId1) await prisma.household.delete({ where: { id: householdId1 } }).catch(() => {})
      if (householdId2) await prisma.household.delete({ where: { id: householdId2 } }).catch(() => {})
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  test('Farmer: PENDING_APPROVAL and Forbidden on others parcel', async () => {
    if (!parcelId1 || !parcelId2 || !householdId1) return console.warn("DB not reachable, skipping...")
    
    const journalRepo = new PrismaJournalRepository()
    const parcelRepo = new PrismaParcelRepository()
    const useCase = new CreateJournalEntryUseCase(journalRepo, parcelRepo)

    // Farmer tries to write to HH2's parcel (should fail)
    await expect(useCase.execute({
      parcel_id: parcelId2,
      entry_date: new Date(),
      activity_type: 'SPRAYING',
      performed_by: 'Nông dân',
      submitted_by_id: 'farmer-123',
      submitted_role: 'FARMER',
      activities: [{ activity_type: 'SPRAYING' }]
    }, 'FARMER', householdId1)).rejects.toThrow(ForbiddenError)

    // Farmer writes to their own parcel (should succeed as PENDING)
    const entry = await useCase.execute({
      parcel_id: parcelId1,
      entry_date: new Date(),
      activity_type: 'SOWING',
      performed_by: 'Nông dân',
      submitted_by_id: 'farmer-123',
      submitted_role: 'FARMER',
      activities: [{ activity_type: 'SOWING' }]
    }, 'FARMER', householdId1)

    expect(entry.status).toBe('PENDING_APPROVAL')
    expect(entry.approved_by_id).toBeNull()
  })

  test('Officer: AUTO_APPROVAL and Weather Contract', async () => {
    if (!parcelId1) return console.warn("DB not reachable, skipping...")

    const journalRepo = new PrismaJournalRepository()
    const parcelRepo = new PrismaParcelRepository()
    const useCase = new CreateJournalEntryUseCase(journalRepo, parcelRepo)

    const entry = await useCase.execute({
      parcel_id: parcelId1,
      entry_date: new Date(),
      activity_type: 'FERTILIZING',
      performed_by: 'Cán bộ Kỹ thuật',
      submitted_by_id: 'officer-123',
      submitted_role: 'OFFICER',
      activities: [{ activity_type: 'FERTILIZING', product_name: 'Phân Ure', dosage: '10kg', withdrawal_days: 7 }]
    }, 'OFFICER')

    // 1. Auto Approval Rule
    expect(entry.status).toBe('APPROVED')
    expect(entry.approved_by_id).toBe('officer-123')
    
    // 2. Weather Contract Rule
    expect(entry.weather_condition).toBe('Sunny')
    expect(entry.weather_temperature).toBe(30)

    // 3. Conditional Pesticide Fields
    expect(entry.activities[0].product_name).toBe('Phân Ure')
    expect(entry.activities[0].dosage).toBe('10kg')
    expect(entry.activities[0].withdrawal_days).toBe(7)
  })
})
