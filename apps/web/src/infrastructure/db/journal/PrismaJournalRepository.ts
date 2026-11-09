// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import {
  JournalPort,
  JournalEntryData,
  CreateJournalData,
  JournalFilters,
} from '@/domain/journal/ports/JournalPort'
import { ActivityType, NotificationType, ParcelStatus } from '@prisma/client'
import { sseEmitter, SSE_EVENTS } from '@/lib/sse-emitter'

function mapEntry(e: any): JournalEntryData {
  return {
    id: e.id,
    parcel_id: e.parcel_id,
    household_id: e.parcel?.household_id,
    parcel_code: e.parcel?.parcel_code,
    household_keycloak_user_id: e.parcel?.household?.keycloak_user_id,
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
    photo_url: e.photo_url,
    photo_minio_key: e.photo_minio_key,
    created_at: e.created_at,
    activities: (e.activities || []).map((a: any) => ({
      id: a.id,
      activity_detail: a.activity_detail,
      product_name: a.product_name,
      dosage: a.dosage,
      withdrawal_days: a.withdrawal_days,
      safe_harvest_date: a.safe_harvest_date,
    })),
  }
}

// Reason for any: Prisma transaction client type is complex to import directly here
async function applyParcelStatus(tx: any, parcelId: string, activityType: string, entryDate: Date) {
  let newStatus: ParcelStatus | undefined = undefined
  if (activityType === ActivityType.SOWING) newStatus = ParcelStatus.SOWING
  else if (activityType === ActivityType.HARVEST) newStatus = ParcelStatus.HARVESTED
  else if (([ActivityType.FERTILIZING, ActivityType.SPRAYING, ActivityType.IRRIGATION, ActivityType.OTHER] as ActivityType[]).includes(activityType as ActivityType)) {
    newStatus = ParcelStatus.TENDING
  }

  if (newStatus) {
    await tx.parcel.update({
      where: { id: parcelId },
      data: { status: newStatus }
    })
  }

  const activeCycle = await tx.parcelCropCycle.findFirst({
    where: { parcel_id: parcelId },
    orderBy: { created_at: 'desc' }
  })

  if (activeCycle) {
    if (activityType === ActivityType.SOWING && !activeCycle.sowed_at) {
      await tx.parcelCropCycle.update({
        where: { id: activeCycle.id },
        data: { sowed_at: entryDate }
      })
    } else if (activityType === ActivityType.HARVEST) {
      await tx.parcelCropCycle.update({
        where: { id: activeCycle.id },
        data: { harvested_at: entryDate }
      })
    }
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
        include: {
          activities: true,
          parcel: {
            select: {
              household_id: true,
              parcel_code: true,
              household: { select: { keycloak_user_id: true } },
            },
          },
        },
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
      include: {
        activities: true,
        parcel: {
          select: {
            household_id: true,
            parcel_code: true,
            household: { select: { keycloak_user_id: true } },
          },
        },
      },
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

    const startOfDay = new Date(data.entry_date)
    startOfDay.setUTCHours(0, 0, 0, 0)
    
    const endOfDay = new Date(data.entry_date)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const weatherCache = await prisma.weatherCache.findFirst({
      where: { 
        parcel_id: data.parcel_id,
        recorded_at: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
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

    const e = await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
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
          photo_url: data.photo_url ?? null,
          photo_minio_key: data.photo_minio_key ?? null,
          activities: {
            create: data.activities.map((a: any) => ({
              activity_detail: a.product_name ? `${a.activity_type}: ${a.product_name}` : a.activity_type,
              product_name: a.product_name ?? null,
              dosage: a.dosage ?? null,
              withdrawal_days: a.withdrawal_days ?? null,
              safe_harvest_date: a.withdrawal_days ? new Date(new Date(data.entry_date).getTime() + a.withdrawal_days * 24 * 60 * 60 * 1000) : null,
            })),
          },
        },
        include: {
          activities: true,
          parcel: {
            select: {
              household_id: true,
              parcel_code: true,
              household: { select: { keycloak_user_id: true } },
            },
          },
        },
      })

      if (data.submitted_role === 'FARMER') {
        const parcel = await tx.parcel.findUnique({
          where: { id: data.parcel_id },
          select: { parcel_code: true, household_id: true, household: { select: { htx_profile_id: true } } },
        })

        const notif = await tx.notification.create({
          data: {
            type: NotificationType.JOURNAL_SUBMITTED,
            title: 'Nhật ký mới cần duyệt',
            body: `${data.performed_by} vừa gửi nhật ký ${data.activity_type} cho thửa ${parcel?.parcel_code ?? data.parcel_id}.`,
            sender_id: data.submitted_by_id,
            household_id: parcel?.household_id ?? null,
            htx_profile_id: parcel?.household.htx_profile_id ?? null,
            deep_link_url: '/officer/journal',
          },
        })
        if (notif.recipient_id) {
          sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { userId: notif.recipient_id })
        } else {
          sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { broadcast: true })
        }
      }
      
      if (data.submitted_role === 'OFFICER') {
        await applyParcelStatus(tx, data.parcel_id, data.activity_type, data.entry_date)
      }
      
      return entry
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
      include: {
        activities: true,
        parcel: {
          select: {
            household_id: true,
            parcel_code: true,
            household: { select: { keycloak_user_id: true } },
          },
        },
      },
    })

    return mapEntry(e)
  }

  async delete(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findUnique({
        where: { id },
        include: {
          parcel: {
            select: {
              parcel_code: true,
              household_id: true,
              household: { select: { htx_profile_id: true } },
            },
          },
        },
      })

      await tx.journalEntry.delete({ where: { id } })

      // SYSTEM with no recipient and no HTX is shown to every HTX, so a household without an HTX writes nothing.
      if (entry?.submitted_role === 'FARMER' && entry.status === 'PENDING_APPROVAL' && entry.parcel.household.htx_profile_id) {
        const notif = await tx.notification.create({
          data: {
            type: NotificationType.SYSTEM,
            title: 'Nhật ký đã được rút lại',
            body: `Nông dân đã rút nhật ký ${entry.activity_type} cho thửa ${entry.parcel.parcel_code}.`,
            sender_id: entry.submitted_by_id,
            household_id: entry.parcel.household_id,
            htx_profile_id: entry.parcel.household.htx_profile_id,
            deep_link_url: '/officer/journal',
          },
        })
        if (notif.recipient_id) {
          sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { userId: notif.recipient_id })
        } else {
          sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { broadcast: true })
        }
      }
    })
  }

  async batchApprove(entryIds: string[], approvedById: string): Promise<{ approved: number; failed: string[] }> {
    const failed: string[] = []
    let approved = 0

    await prisma.$transaction(async (tx) => {
      for (const entryId of entryIds) {
        const entry = await tx.journalEntry.findUnique({
          where: { id: entryId },
          include: {
            parcel: {
              select: {
                parcel_code: true,
                household_id: true,
                household: { select: { keycloak_user_id: true } },
              },
            },
          },
        })
        if (!entry || entry.status !== 'PENDING_APPROVAL') {
          failed.push(entryId)
          continue
        }

        await tx.journalEntry.update({
          where: { id: entryId },
          data: {
            status: 'APPROVED',
            approved_by_id: approvedById,
            approved_at: new Date(),
          },
        })
        
        await applyParcelStatus(tx, entry.parcel_id, entry.activity_type, entry.entry_date)
        if (entry.submitted_role === 'FARMER' && entry.parcel.household.keycloak_user_id) {
          const notif = await tx.notification.create({
            data: {
              type: NotificationType.JOURNAL_APPROVED,
              title: 'Nhật ký đã được duyệt',
              body: `Nhật ký ${entry.activity_type} cho thửa ${entry.parcel.parcel_code} đã được duyệt.`,
              recipient_id: entry.parcel.household.keycloak_user_id,
              household_id: entry.parcel.household_id,
              sender_id: approvedById,
              deep_link_url: '/farmer/journal',
            },
          })
          if (notif.recipient_id) {
            sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { userId: notif.recipient_id })
          } else {
            sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { broadcast: true })
          }
        }
        approved++
      }
    })

    return { approved, failed }
  }
}
