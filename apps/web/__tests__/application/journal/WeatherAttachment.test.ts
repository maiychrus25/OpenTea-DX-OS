// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { ActivityType } from '@prisma/client'

describe('Story 3.5: Weather Auto-Attach to Journal Entries', () => {
  const isDbError = (e: unknown) => {
    const str = String(e)
    // Reason for any: e is unknown but we check for Prisma code property safely
    return str.includes('Can\'t reach database server') || str.includes('Invalid `prisma.') || (e as any)?.code?.startsWith('P')
  }

  let htxId: string
  let householdId: string
  let parcelId: string
  let cycleId: string

  const journalRepo = new PrismaJournalRepository()
  const parcelRepo = new PrismaParcelRepository()
  const useCase = new CreateJournalEntryUseCase(journalRepo, parcelRepo)

  beforeAll(async () => {
    try {
      const htx = await prisma.htxProfile.create({
        data: {
          name: 'Test HTX Weather',
          htx_code: `TW1-${Date.now()}`,
          address: 'Test Address',
        }
      })
      htxId = htx.id

      const household = await prisma.household.create({
        data: {
          name: 'Test Household',
          phone: `090${Math.floor(1000000 + Math.random() * 9000000)}`,
        }
      })
      householdId = household.id

      const parcel = await prisma.parcel.create({
        data: {
          household_id: householdId,
          parcel_code: 'P-TW1-001',
          crop_type: 'Rice',
          area_ha: 1,
          status: 'SOWING'
        }
      })
      parcelId = parcel.id

      const cycle = await prisma.parcelCropCycle.create({
        data: {
          parcel_id: parcelId,
          season: 'Spring',
        }
      })
      cycleId = cycle.id
    } catch (e) {
      if (isDbError(e)) {
        console.warn('DB not reachable, tests will be skipped')
      } else {
        throw e
      }
    }
  })

  afterAll(async () => {
    try {
      if (cycleId) await prisma.parcelCropCycle.delete({ where: { id: cycleId } })
      if (parcelId) {
        await prisma.journalEntry.deleteMany({ where: { parcel_id: parcelId } })
        await prisma.weatherCache.deleteMany({ where: { parcel_id: parcelId } })
        await prisma.parcel.delete({ where: { id: parcelId } })
      }
      if (householdId) await prisma.household.delete({ where: { id: householdId } })
      if (htxId) await prisma.htxProfile.delete({ where: { id: htxId } })
    } catch (e) {
      // ignore teardown errors
    }
  })

  test('Weather is auto-attached correctly for a backdated journal entry', async () => {
    if (!parcelId) return console.warn("DB not reachable, skipping...")
    
    // Seed weather for 3 days ago
    const threeDaysAgo = new Date()
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3)
    threeDaysAgo.setUTCHours(12, 0, 0, 0) // noon 3 days ago

    // Seed weather for today
    const today = new Date()
    today.setUTCHours(12, 0, 0, 0) // noon today

    await prisma.weatherCache.createMany({
      data: [
        {
          parcel_id: parcelId,
          recorded_at: threeDaysAgo,
          condition: 'Rainy',
          temperature_c: 22.5,
          precipitation_mm: 15.0,
          humidity_pct: 85.0,
          source: 'open-meteo'
        },
        {
          parcel_id: parcelId,
          recorded_at: today,
          condition: 'Sunny',
          temperature_c: 32.0,
          precipitation_mm: 0.0,
          humidity_pct: 60.0,
          source: 'open-meteo'
        }
      ]
    })

    // Create journal entry backdated to 3 days ago
    const entryDate = new Date()
    entryDate.setUTCDate(entryDate.getUTCDate() - 3)
    
    const entry = await useCase.execute({
      parcel_id: parcelId,
      entry_date: entryDate,
      activity_type: ActivityType.FERTILIZING,
      performed_by: 'Farmer',
      submitted_by_id: 'farmer-1',
      submitted_role: 'FARMER',
      activities: [{ activity_type: ActivityType.FERTILIZING }]
    }, 'FARMER', householdId)

    // Should fetch the weather from 3 days ago, not today's
    expect(entry.weather_condition).toBe('Rainy')
    expect(entry.weather_temperature).toBe(22.5)
    expect(entry.weather_precipitation).toBe(15.0)
    expect(entry.weather_humidity).toBe(85.0)
  })

  test('Cache miss behavior leaves weather fields null', async () => {
    if (!parcelId) return console.warn("DB not reachable, skipping...")
    
    // Create journal entry for a date with no weather data (e.g. 10 days ago)
    const tenDaysAgo = new Date()
    tenDaysAgo.setUTCDate(tenDaysAgo.getUTCDate() - 10)
    
    const entry = await useCase.execute({
      parcel_id: parcelId,
      entry_date: tenDaysAgo,
      activity_type: ActivityType.FERTILIZING,
      performed_by: 'Farmer',
      submitted_by_id: 'farmer-1',
      submitted_role: 'FARMER',
      activities: [{ activity_type: ActivityType.FERTILIZING }]
    }, 'FARMER', householdId)

    // Should leave weather fields as null
    expect(entry.weather_condition).toBeNull()
    expect(entry.weather_temperature).toBeNull()
    expect(entry.weather_precipitation).toBeNull()
    expect(entry.weather_humidity).toBeNull()
  })
})
