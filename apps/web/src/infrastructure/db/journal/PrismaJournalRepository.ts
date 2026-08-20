// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import {
  JournalPort,
  JournalEntryData,
  CreateJournalData,
  JournalFilters,
} from '@/domain/journal/ports/JournalPort'

function mapEntry(e: any): JournalEntryData {
  return {
    id: e.id,
    parcel_id: e.parcel_id,
    entry_date: e.entry_date,
    activity_type: e.activity_type,
    performed_by: e.performed_by,
    submitted_by_id: e.submitted_by_id,
    submitted_role: e.submitted_role,
    status: e.status,
    approved_by_id: e.approved_by_id,
    approved_at: e.approved_at,
    notes: e.notes,
    weather_temperature: e.weather_temperature,
    weather_precipitation: e.weather_precipitation,
    weather_humidity: e.weather_humidity,
    weather_condition: e.weather_condition,
    created_at: e.created_at,
    activities: (e.activities || []).map((a: any) => ({
      id: a.id,
      activity_detail: a.activity_detail,
      product_name: a.product_name,
      dosage: a.dosage,
      withdrawal_days: a.withdrawal_days,
    })),
  }
}

export class PrismaJournalRepository implements JournalPort {
  async findAll(filters: JournalFilters): Promise<{ entries: JournalEntryData[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (filters.parcel_id) where.parcel_id = filters.parcel_id
    if (filters.status) where.status = filters.status
    if (filters.household_id) {
      where.parcel = { household_id: filters.household_id }
    }

    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: { activities: true },
        orderBy: { entry_date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.journalEntry.count({ where }),
    ])

    return { entries: entries.map(mapEntry), total }
  }

  async findById(id: string): Promise<JournalEntryData | null> {
    const e = await prisma.journalEntry.findUnique({
      where: { id },
      include: { activities: true },
    })
    if (!e) return null
    return mapEntry(e)
  }

  async create(data: CreateJournalData): Promise<JournalEntryData> {
    // Auto-attach weather from weather_cache
    let weatherData: { temperature: number | null; precipitation: number | null; humidity: number | null; condition: string | null } = {
      temperature: null,
      precipitation: null,
      humidity: null,
      condition: null,
    }

    const weatherCache = await prisma.weatherCache.findFirst({
      where: { parcel_id: data.parcel_id },
      orderBy: { recorded_at: 'desc' },
    })

    if (weatherCache) {
      weatherData = {
        temperature: weatherCache.temperature_c,
        precipitation: weatherCache.precipitation_mm,
        humidity: weatherCache.humidity_pct,
        condition: weatherCache.condition,
      }
    }

    const e = await prisma.journalEntry.create({
      data: {
        parcel_id: data.parcel_id,
        entry_date: data.entry_date,
        activity_type: data.activity_type as any,
        performed_by: data.performed_by,
        submitted_by_id: data.submitted_by_id,
        submitted_role: data.submitted_role as any,
        status: data.submitted_role === 'FARMER' ? 'PENDING_APPROVAL' : 'APPROVED',
        approved_by_id: data.submitted_role === 'OFFICER' ? data.submitted_by_id : null,
        approved_at: data.submitted_role === 'OFFICER' ? new Date() : null,
        notes: data.observation ?? null,
        weather_temperature: weatherData.temperature,
        weather_precipitation: weatherData.precipitation,
        weather_humidity: weatherData.humidity,
        weather_condition: weatherData.condition,
        activities: {
          create: data.activities.map(a => ({
            activity_detail: a.product_name ? `${a.activity_type}: ${a.product_name}` : a.activity_type,
            product_name: a.product_name ?? null,
            dosage: a.dosage ?? null,
            withdrawal_days: a.withdrawal_days ?? null,
          })),
        },
      },
      include: { activities: true },
    })

    return mapEntry(e)
  }

  async update(id: string, data: Partial<CreateJournalData>): Promise<JournalEntryData> {
    const updateData: Record<string, unknown> = {}
    if (data.entry_date) updateData.entry_date = data.entry_date
    if (data.observation !== undefined) updateData.notes = data.observation

    const e = await prisma.journalEntry.update({
      where: { id },
      data: updateData,
      include: { activities: true },
    })

    return mapEntry(e)
  }

  async delete(id: string): Promise<void> {
    await prisma.journalEntry.delete({ where: { id } })
  }

  async batchApprove(entryIds: string[], approvedById: string): Promise<{ approved: number; failed: string[] }> {
    const failed: string[] = []
    let approved = 0

    for (const entryId of entryIds) {
      const entry = await prisma.journalEntry.findUnique({ where: { id: entryId } })
      if (!entry || entry.status !== 'PENDING_APPROVAL') {
        failed.push(entryId)
        continue
      }

      await prisma.journalEntry.update({
        where: { id: entryId },
        data: {
          status: 'APPROVED',
          approved_by_id: approvedById,
          approved_at: new Date(),
        },
      })
      approved++
    }

    return { approved, failed }
  }
}
