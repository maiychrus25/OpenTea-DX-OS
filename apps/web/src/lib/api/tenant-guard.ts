// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { PrismaClient } from '@prisma/client'
import { NotFoundError } from '@/domain/errors'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { Tenant } from './tenant'

const viaHousehold = { household: { select: { htx_profile_id: true } } }
const viaParcel = { parcel: { select: viaHousehold } }

/**
 * Checks that a record belongs to the caller's HTX before it is changed.
 * A foreign, missing or unlinked record all throw NotFoundError, so ids of other HTXs are not revealed.
 */
export class TenantGuard {
  constructor(private readonly tenant: Tenant, private readonly db: PrismaClient = prisma) {}

  async parcel(id: string): Promise<void> {
    const r = await this.db.parcel.findUnique({ where: { id }, select: viaHousehold })
    this.check(r?.household.htx_profile_id)
  }

  async household(id: string): Promise<void> {
    const r = await this.db.household.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async lot(id: string): Promise<void> {
    const r = await this.db.lot.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async journalEntry(id: string): Promise<void> {
    const r = await this.db.journalEntry.findUnique({ where: { id }, select: viaParcel })
    this.check(r?.parcel.household.htx_profile_id)
  }

  async diseaseReport(id: string): Promise<void> {
    const r = await this.db.diseaseReport.findUnique({ where: { id }, select: viaHousehold })
    this.check(r?.household.htx_profile_id)
  }

  async cropCycle(id: string): Promise<void> {
    const r = await this.db.parcelCropCycle.findUnique({ where: { id }, select: viaParcel })
    this.check(r?.parcel.household.htx_profile_id)
  }

  async leafGrade(id: string): Promise<void> {
    const r = await this.db.leafGrade.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async leafTicket(id: string): Promise<void> {
    const r = await this.db.freshLeafTicket.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async inputItem(id: string): Promise<void> {
    const r = await this.db.inputItem.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async inputAdvance(id: string): Promise<void> {
    const r = await this.db.inputAdvance.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async processingBatch(id: string): Promise<void> {
    const r = await this.db.processingBatch.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async certificate(id: string): Promise<void> {
    const r = await this.db.htxCertificate.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  async salesOrder(id: string): Promise<void> {
    const r = await this.db.salesOrder.findUnique({ where: { id }, select: { htx_profile_id: true } })
    this.check(r?.htx_profile_id)
  }

  private check(htxProfileId: string | null | undefined): void {
    if (!htxProfileId || htxProfileId !== this.tenant.htxProfileId) throw new NotFoundError('Resource not found')
  }
}
