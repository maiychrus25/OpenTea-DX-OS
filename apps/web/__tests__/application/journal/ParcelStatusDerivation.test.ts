// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import { PrismaJournalRepository } from '@/infrastructure/db/journal/PrismaJournalRepository'
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository'
import { CreateJournalEntryUseCase } from '@/application/journal/CreateJournalEntryUseCase'
import { BatchApproveJournalUseCase } from '@/application/journal/BatchApproveJournalUseCase'
import { ParcelStatus, ActivityType } from '@prisma/client'

describe('Story 3.4: Parcel Status Auto-Derivation', () => {
  const isDbError = (e: unknown) => {
    const str = String(e)
    return str.includes('Can\'t reach database server') || str.includes('Invalid `prisma.') || (e as any)?.code?.startsWith('P')
  }

  let householdId: string | undefined
  let parcelId: string | undefined
  let activeCycleId: string | undefined

  beforeAll(async () => {
    try {
      const hh = await prisma.household.create({
        data: { name: 'HH Status Derivation', phone: '093' + Math.floor(Math.random() * 10000000) }
      })
      householdId = hh.id

      const p = await prisma.parcel.create({
        data: {
          household_id: hh.id,
          parcel_code: 'P-STAT-' + Math.floor(Math.random() * 1000),
          area_ha: 1,
          centroid_lat: 10,
          centroid_lng: 105,
          polygon_geojson: {},
          crop_type: 'Lúa',
          status: ParcelStatus.DRAFT,
          crop_cycles: {
            create: [{ season: 'Vụ test' }]
          }
        },
        include: { crop_cycles: true }
      })
      parcelId = p.id
      activeCycleId = p.crop_cycles[0]?.id
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  afterAll(async () => {
    try {
      if (parcelId) await prisma.journalActivity.deleteMany({ where: { journal_entry: { parcel_id: parcelId } } }).catch(() => {})
      if (parcelId) await prisma.journalEntry.deleteMany({ where: { parcel_id: parcelId } }).catch(() => {})
      if (activeCycleId) await prisma.parcelCropCycle.delete({ where: { id: activeCycleId } }).catch(() => {})
      if (parcelId) await prisma.parcel.delete({ where: { id: parcelId } }).catch(() => {})
      if (householdId) await prisma.household.delete({ where: { id: householdId } }).catch(() => {})
    } catch (e: unknown) {
      if (!isDbError(e)) throw e
    }
  })

  test('Officer creating SOWING immediately updates parcel to SOWING', async () => {
    if (!parcelId) return console.warn("DB not reachable, skipping...")
    
    const journalRepo = new PrismaJournalRepository()
    const parcelRepo = new PrismaParcelRepository()
    const useCase = new CreateJournalEntryUseCase(journalRepo, parcelRepo)

    const entryDate = new Date('2026-08-01T10:00:00Z')
    await useCase.execute({
      parcel_id: parcelId,
      entry_date: entryDate,
      activity_type: ActivityType.SOWING,
      performed_by: 'Officer',
      submitted_by_id: 'officer-1',
      submitted_role: 'OFFICER',
      activities: [{ activity_type: ActivityType.SOWING }]
    }, 'OFFICER')

    const parcel = await prisma.parcel.findUnique({ where: { id: parcelId }, include: { crop_cycles: true } })
    expect(parcel?.status).toBe(ParcelStatus.SOWING)
    expect(parcel?.crop_cycles[0].sowed_at?.toISOString()).toBe(entryDate.toISOString())
  })

  test('Farmer creating FERTILIZING is PENDING, Parcel is NOT updated yet', async () => {
    if (!parcelId) return console.warn("DB not reachable, skipping...")
    
    const journalRepo = new PrismaJournalRepository()
    const parcelRepo = new PrismaParcelRepository()
    const useCase = new CreateJournalEntryUseCase(journalRepo, parcelRepo)

    const entry = await useCase.execute({
      parcel_id: parcelId,
      entry_date: new Date(),
      activity_type: ActivityType.FERTILIZING,
      performed_by: 'Farmer',
      submitted_by_id: 'farmer-1',
      submitted_role: 'FARMER',
      activities: [{ activity_type: ActivityType.FERTILIZING }]
    }, 'FARMER', householdId)

    expect(entry.status).toBe('PENDING_APPROVAL')

    // Status should still be SOWING from previous test
    const parcel = await prisma.parcel.findUnique({ where: { id: parcelId } })
    expect(parcel?.status).toBe(ParcelStatus.SOWING)

    // Now batch approve
    const batchApproveUseCase = new BatchApproveJournalUseCase(journalRepo)
    await batchApproveUseCase.execute([entry.id], 'officer-1')

    // Status should now be TENDING
    const updatedParcel = await prisma.parcel.findUnique({ where: { id: parcelId } })
    expect(updatedParcel?.status).toBe(ParcelStatus.TENDING)
  })

  test('Batch Approve HARVEST updates parcel to HARVESTED', async () => {
    if (!parcelId) return console.warn("DB not reachable, skipping...")
    
    const journalRepo = new PrismaJournalRepository()
    const parcelRepo = new PrismaParcelRepository()
    const useCase = new CreateJournalEntryUseCase(journalRepo, parcelRepo)

    const entryDate = new Date('2026-11-01T10:00:00Z')
    const entry = await useCase.execute({
      parcel_id: parcelId,
      entry_date: entryDate,
      activity_type: ActivityType.HARVEST,
      performed_by: 'Farmer',
      submitted_by_id: 'farmer-1',
      submitted_role: 'FARMER',
      activities: [{ activity_type: ActivityType.HARVEST }]
    }, 'FARMER', householdId)

    const batchApproveUseCase = new BatchApproveJournalUseCase(journalRepo)
    await batchApproveUseCase.execute([entry.id], 'officer-1')

    const parcel = await prisma.parcel.findUnique({ where: { id: parcelId }, include: { crop_cycles: true } })
    expect(parcel?.status).toBe(ParcelStatus.HARVESTED)
    expect(parcel?.crop_cycles[0].harvested_at?.toISOString()).toBe(entryDate.toISOString())
  })
})
