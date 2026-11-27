// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import type { HtxCertificate, Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import type { CertificatePort, NewCertificate } from '@/domain/certificate/ports/CertificatePort'
import type { CertificateRow } from '@/domain/certificate/views'
import { certificateStatus } from '@/domain/certificate/status'

type Tx = Prisma.TransactionClient

const day = (d: Date) => d.toISOString().slice(0, 10)

function toRow(c: HtxCertificate): CertificateRow {
  return {
    id: c.id, htx_profile_id: c.htx_profile_id, kind: c.kind, number: c.number, issuer: c.issuer,
    issued_on: day(c.issued_on), expires_on: day(c.expires_on), scope_note: c.scope_note,
    file_key: c.file_key, file_name: c.file_name, file_mime: c.file_mime, file_size: c.file_size,
    revoked_at: c.revoked_at, revoke_reason: c.revoke_reason,
  }
}

async function setActor(tx: Tx, userId: string) {
  // Row audit events of these writes name the person.
  await tx.$executeRaw`SELECT set_config('dxos.actor', ${`user:${userId}`}, true)`
}

export class PrismaCertificateRepository implements CertificatePort {
  async list(htxProfileId: string): Promise<CertificateRow[]> {
    const rows = await prisma.htxCertificate.findMany({ where: { htx_profile_id: htxProfileId }, orderBy: [{ expires_on: 'desc' }, { created_at: 'desc' }] })
    return rows.map(toRow)
  }

  async find(htxProfileId: string, id: string): Promise<CertificateRow | null> {
    const row = await prisma.htxCertificate.findFirst({ where: { id, htx_profile_id: htxProfileId } })
    return row ? toRow(row) : null
  }

  async create(input: NewCertificate): Promise<CertificateRow> {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, input.userId)
      const row = await tx.htxCertificate.create({
        data: {
          htx_profile_id: input.htxProfileId, kind: input.kind, number: input.number, issuer: input.issuer,
          issued_on: new Date(`${input.issued_on}T00:00:00Z`), expires_on: new Date(`${input.expires_on}T00:00:00Z`),
          scope_note: input.scope_note, file_key: input.file_key, file_name: input.file_name,
          file_mime: input.file_mime, file_size: input.file_size, created_by_id: input.userId,
        },
      })
      return toRow(row)
    })
  }

  async revoke(htxProfileId: string, id: string, userId: string, reason: string): Promise<CertificateRow | null> {
    return prisma.$transaction(async (tx) => {
      await setActor(tx, userId)
      const done = await tx.htxCertificate.updateMany({
        where: { id, htx_profile_id: htxProfileId, revoked_at: null },
        data: { revoked_at: new Date(), revoked_by_id: userId, revoke_reason: reason },
      })
      if (done.count === 0) return null
      return toRow(await tx.htxCertificate.findUniqueOrThrow({ where: { id } }))
    })
  }

  async validForLot(htxProfileId: string, ids: string[] | null, today: string) {
    const rows = (await prisma.htxCertificate.findMany({
      where: { htx_profile_id: htxProfileId, ...(ids ? { id: { in: ids } } : {}) },
    })).map(toRow)
    const valid = rows.filter((r) => certificateStatus(r, today) === 'VALID')
    if (!ids) return { ok: valid }
    const okIds = new Set(valid.map((r) => r.id))
    const invalid = ids.filter((id) => !okIds.has(id))
    return invalid.length ? { invalid } : { ok: valid }
  }
}
