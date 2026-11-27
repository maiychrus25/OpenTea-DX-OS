// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '@/infrastructure/db/prisma.client'
import {
  JournalPort,
  JournalEntryData,
  CreateJournalData,
  JournalActivityData,
  JournalFilters,
  JournalReviewDecision,
} from '@/domain/journal/ports/JournalPort'
import { ValidationError } from '@/domain/errors'
import { ActivityType, NotificationType, ParcelStatus, Prisma } from '@prisma/client'
import { cycleForEntryDate, cycleForHarvest, ensureOpenCycle } from '@/infrastructure/db/farm/PrismaCropCycleRepository'
import { sseEmitter, SSE_EVENTS } from '@/lib/sse-emitter'

function mapEntry(e: any): JournalEntryData {
  return {
    id: e.id,
    parcel_id: e.parcel_id,
    household_id: e.parcel?.household_id,
    parcel_code: e.parcel?.parcel_code,
    household_keycloak_user_id: e.parcel?.household?.keycloak_user_id,
    cycle_id: e.cycle_id ?? null,
    client_id: e.client_id ?? null,
    entry_date: e.entry_date,
    activity_type: e.activity_type,
    performed_by: e.performed_by,
    submitted_by_id: e.submitted_by_id,
    submitted_role: e.submitted_role,
    status: e.status,
    approved_by_id: e.approved_by_id,
    approved_at: e.approved_at,
    review_note: e.review_note ?? null,
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
      pesticide_product_id: a.pesticide_product_id ?? null,
      fresh_leaf_kg: a.fresh_leaf_kg ?? null,
    })),
  }
}

// Reason for any: Prisma transaction client type is complex to import directly here
/** The flush an entry belongs to; HARVEST closes the newest open one and SOWING opens one when none is open. */
async function assignCycle(tx: any, parcelId: string, activityType: string, entryDate: Date): Promise<string | null> {
  if (activityType === ActivityType.HARVEST) return cycleForHarvest(tx, parcelId)
  if (activityType === ActivityType.SOWING) return (await cycleForHarvestOpen(tx, parcelId)) ?? ensureOpenCycle(tx, parcelId, new Date())
  return cycleForEntryDate(tx, parcelId, entryDate)
}

async function cycleForHarvestOpen(tx: any, parcelId: string): Promise<string | null> {
  const open = await tx.parcelCropCycle.findFirst({ where: { parcel_id: parcelId, harvested_at: null }, orderBy: { created_at: 'desc' }, select: { id: true } })
  return open?.id ?? null
}

async function applyParcelStatus(tx: any, parcelId: string, activityType: string, entryDate: Date, cycleId?: string | null) {
  let newStatus: ParcelStatus | undefined = undefined
  if (activityType === ActivityType.SOWING) newStatus = ParcelStatus.SOWING
  else if (activityType === ActivityType.HARVEST) newStatus = ParcelStatus.HARVESTED
  else if (([ActivityType.FERTILIZING, ActivityType.SPRAYING, ActivityType.IRRIGATION, ActivityType.PRUNING, ActivityType.OTHER] as ActivityType[]).includes(activityType as ActivityType)) {
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
    } else if (activityType === ActivityType.HARVEST && !cycleId) {
      await tx.parcelCropCycle.update({
        where: { id: activeCycle.id },
        data: { harvested_at: entryDate }
      })
    }
  }

  // A harvest closes the flush of its own entry, not whichever flush was created last.
  if (activityType === ActivityType.HARVEST && cycleId) {
    await tx.parcelCropCycle.updateMany({ where: { id: cycleId, harvested_at: null }, data: { harvested_at: entryDate } })
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function activityRows(activities: JournalActivityData[], entryDate: Date) {
  return activities.map((a) => ({
    activity_detail: a.product_name ? `${a.activity_type}: ${a.product_name}` : a.activity_type,
    product_name: a.product_name ?? null,
    dosage: a.dosage ?? null,
    withdrawal_days: a.withdrawal_days ?? null,
    pesticide_product_id: a.pesticide_product_id ?? null,
    fresh_leaf_kg: a.fresh_leaf_kg ?? null,
    safe_harvest_date: a.withdrawal_days ? new Date(new Date(entryDate).getTime() + a.withdrawal_days * DAY_MS) : null,
  }))
}

// Reason for any: Prisma transaction client type is complex to import directly here
async function notifyOfficers(tx: any, parcelId: string, performedBy: string, activityType: string, senderId: string | null) {
  const parcel = await tx.parcel.findUnique({
    where: { id: parcelId },
    select: { parcel_code: true, household_id: true, household: { select: { htx_profile_id: true } } },
  })
  const notif = await tx.notification.create({
    data: {
      type: NotificationType.JOURNAL_SUBMITTED,
      title: 'Nhật ký mới cần duyệt',
      body: `${performedBy} vừa gửi nhật ký ${activityType} cho thửa ${parcel?.parcel_code ?? parcelId}.`,
      sender_id: senderId,
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

const ENTRY_INCLUDE = {
  activities: true,
  parcel: {
    select: {
      household_id: true,
      parcel_code: true,
      household: { select: { keycloak_user_id: true } },
    },
  },
} as const

export class PrismaJournalRepository implements JournalPort {
  async findAll(filters: JournalFilters): Promise<{ entries: JournalEntryData[]; total: number }> {
    const where: Record<string, unknown> = {}
    if (filters.parcel_id) where.parcel_id = filters.parcel_id
    if (filters.status) where.status = filters.status
    if (filters.household_id) {
      where.parcel = { household_id: filters.household_id }
    }
    if (filters.htx_profile_id) {
      where.parcel = { ...(where.parcel as object | undefined), household: { htx_profile_id: filters.htx_profile_id } }
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

  /** Entries of one cooperative, loaded in a single query; ids of other cooperatives are simply absent. */
  async findManyScoped(ids: string[], htxProfileId: string): Promise<JournalEntryData[]> {
    if (ids.length === 0) return []
    const rows = await prisma.journalEntry.findMany({
      where: { id: { in: ids }, parcel: { household: { htx_profile_id: htxProfileId } } },
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
    return rows.map(mapEntry)
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

    let e
    try {
      e = await prisma.$transaction(async (tx) => {
        const cycleId = await assignCycle(tx, data.parcel_id, data.activity_type, data.entry_date)
        const entry = await tx.journalEntry.create({
          data: {
            cycle_id: cycleId,
            parcel_id: data.parcel_id,
            entry_date: data.entry_date,
            activity_type: data.activity_type as any,
            performed_by: data.performed_by,
            submitted_by_id: data.submitted_by_id,
            submitted_role: data.submitted_role as any,
            client_id: data.client_id ?? null,
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
            activities: { create: activityRows(data.activities, data.entry_date) },
          },
          include: ENTRY_INCLUDE,
        })

        if (data.submitted_role === 'FARMER') {
          await notifyOfficers(tx, data.parcel_id, data.performed_by, data.activity_type, data.submitted_by_id)
        }

        if (data.submitted_role === 'OFFICER') {
          await applyParcelStatus(tx, data.parcel_id, data.activity_type, data.entry_date, cycleId)
        }

        return entry
      })
    } catch (err) {
      // Two replays racing past the pre-check: the unique key stopped the second, so hand back the first.
      if (data.client_id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const first = await this.findByClientId(data.submitted_by_id, data.client_id)
        if (first) return first
      }
      throw err
    }

    return mapEntry(e)
  }

  async findByClientId(submittedById: string, clientId: string): Promise<JournalEntryData | null> {
    const e = await prisma.journalEntry.findUnique({
      where: { submitted_by_id_client_id: { submitted_by_id: submittedById, client_id: clientId } },
      include: ENTRY_INCLUDE,
    })
    return e ? mapEntry(e) : null
  }

  async update(id: string, data: Partial<CreateJournalData>, resubmit = false): Promise<JournalEntryData> {
    const updateData: Record<string, unknown> = {}
    if (data.entry_date) updateData.entry_date = data.entry_date
    if (data.observation !== undefined) updateData.notes = data.observation
    if (data.photo_url !== undefined) updateData.photo_url = data.photo_url
    if (data.photo_minio_key !== undefined) updateData.photo_minio_key = data.photo_minio_key
    if (data.submitted_by_id) updateData.submitted_by_id = data.submitted_by_id
    if (data.submitted_role) updateData.submitted_role = data.submitted_role
    if (data.performed_by) updateData.performed_by = data.performed_by
    if (data.activities?.length) updateData.activity_type = data.activities[0].activity_type
    // A returned or draft entry goes to the review queue with the old review cleared.
    if (resubmit) {
      updateData.status = 'PENDING_APPROVAL'
      updateData.review_note = null
      updateData.reviewed_by_id = null
    }

    const e = await prisma.$transaction(async (tx) => {
      if (data.activities) {
        const current = await tx.journalEntry.findUnique({ where: { id }, select: { entry_date: true } })
        await tx.journalActivity.deleteMany({ where: { journal_entry_id: id } })
        updateData.activities = { create: activityRows(data.activities, data.entry_date ?? current!.entry_date) }
      }
      // The flush is assigned when the entry is submitted (a draft has none) or its date changes.
      if (resubmit || data.entry_date) {
        const current = await tx.journalEntry.findUnique({ where: { id }, select: { parcel_id: true, entry_date: true, activity_type: true, status: true } })
        if (current && (resubmit || current.status !== 'DRAFT')) {
          const type = (updateData.activity_type as string | undefined) ?? current.activity_type
          updateData.cycle_id = await assignCycle(tx, current.parcel_id, type, (data.entry_date ?? current.entry_date) as Date)
        }
      }
      const updated = await tx.journalEntry.update({ where: { id }, data: updateData, include: ENTRY_INCLUDE })
      // The safe dates follow the spray date: a prescribed draft is dated when the farmer confirms the spraying.
      if (!data.activities && (resubmit || data.entry_date)) {
        for (const activity of updated.activities) {
          if (!activity.withdrawal_days) continue
          const safe = new Date(updated.entry_date.getTime() + activity.withdrawal_days * DAY_MS)
          await tx.journalActivity.update({ where: { id: activity.id }, data: { safe_harvest_date: safe } })
          activity.safe_harvest_date = safe
        }
      }
      if (resubmit && updated.submitted_role === 'FARMER') {
        await notifyOfficers(tx, updated.parcel_id, updated.performed_by, updated.activity_type, updated.submitted_by_id)
      }
      return updated
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
      // Row audit events of these updates name the approver.
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${approvedById}`}, true)`
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

        // Conditional on the status so a concurrent review cannot be overwritten.
        const { count } = await tx.journalEntry.updateMany({
          where: { id: entryId, status: 'PENDING_APPROVAL' },
          data: {
            status: 'APPROVED',
            approved_by_id: approvedById,
            approved_at: new Date(),
            reviewed_by_id: approvedById,
          },
        })
        if (count === 0) {
          failed.push(entryId)
          continue
        }
        
        await applyParcelStatus(tx, entry.parcel_id, entry.activity_type, entry.entry_date, entry.cycle_id)
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

  async review(
    entryId: string,
    decision: JournalReviewDecision,
    reason: string,
    reviewerId: string
  ): Promise<{ status: JournalReviewDecision }> {
    const trimmedReason = reason.trim()
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${reviewerId}`}, true)`
      const entry = await tx.journalEntry.findUnique({
        where: { id: entryId },
        include: {
          parcel: {
            select: {
              parcel_code: true,
              household_id: true,
              household: { select: { keycloak_user_id: true, htx_profile_id: true } },
            },
          },
        },
      })
      if (!entry || entry.status !== 'PENDING_APPROVAL') {
        throw new ValidationError('Nhật ký không còn ở trạng thái chờ duyệt')
      }

      // Conditional on the status so a concurrent review cannot be overwritten.
      const { count } = await tx.journalEntry.updateMany({
        where: { id: entryId, status: 'PENDING_APPROVAL' },
        data: {
          status: decision,
          review_note: trimmedReason,
          reviewed_by_id: reviewerId,
        },
      })
      if (count === 0) {
        throw new ValidationError('Nhật ký không còn ở trạng thái chờ duyệt')
      }

      if (entry.submitted_role === 'FARMER' && entry.parcel.household.keycloak_user_id) {
        const notif = await tx.notification.create({
          data: {
            type: NotificationType.SYSTEM,
            title: decision === 'REQUEST_CHANGES' ? 'Nhật ký cần chỉnh sửa' : 'Nhật ký bị từ chối',
            body: `Nhật ký ${entry.activity_type} cho thửa ${entry.parcel.parcel_code}: ${trimmedReason}`,
            recipient_id: entry.parcel.household.keycloak_user_id,
            household_id: entry.parcel.household_id,
            htx_profile_id: entry.parcel.household.htx_profile_id,
            sender_id: reviewerId,
            deep_link_url: '/farmer/journal',
          },
        })
        if (notif.recipient_id) {
          sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { userId: notif.recipient_id })
        } else {
          sseEmitter.emit(SSE_EVENTS.NEW_NOTIFICATION, { broadcast: true })
        }
      }
    })

    return { status: decision }
  }
}
