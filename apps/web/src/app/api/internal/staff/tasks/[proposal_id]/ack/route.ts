// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ackBodySchema, StaffSyncUseCase } from '@/application/agent/staff/StaffSyncUseCase'
import { NotFoundError } from '@/domain/errors'
import { notifyProposalDecided } from '@/application/telegram/telegram-services'
import { PrismaStaffSyncRepository } from '@/infrastructure/db/agent/PrismaStaffSyncRepository'
import { requireStaffCaller } from '@/lib/api/internal-staff-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { labsOnly } from '@/lib/labs'

const idSchema = z.string().uuid()

/** The staff app reports the task it created for an approved proposal (contract C3). */
async function postStaffTaskAck(request: Request, context: unknown) {
  const caller = await requireStaffCaller(request)
  const { params } = context as { params: Promise<{ proposal_id: string }> | { proposal_id: string } }
  const { proposal_id: rawId } = await params
  const id = idSchema.safeParse(rawId)
  // A malformed id names no proposal of this cooperative either.
  if (!id.success) throw new NotFoundError('Không tìm thấy đề xuất')
  const body = ackBodySchema.parse(await request.json().catch(() => null))

  const outcome = await new StaffSyncUseCase(new PrismaStaffSyncRepository(), async () => new Map()).acknowledge(
    caller.htxCode,
    id.data,
    body.task_id
  )
  if (outcome === 'not_found') throw new NotFoundError('Không tìm thấy đề xuất')
  if (outcome === 'conflict') {
    return NextResponse.json(
      { error: { code: 'PROPOSAL_NOT_AWAITING_STAFF_APP', message: 'Đề xuất không còn chờ app nhân sự (đã hết hạn hoặc đã xử lý).' } },
      { status: 409 }
    )
  }
  // The messages that said "sent to the staff app" are edited to the final state; a failure never undoes the acknowledgement.
  if (outcome === 'acknowledged') await notifyProposalDecided(caller.htxCode, id.data).catch(() => undefined)
  return NextResponse.json({ data: { proposal_id: id.data, task_id: body.task_id, already: outcome === 'already' } })
}

export const POST = withErrorHandler(labsOnly(postStaffTaskAck))
