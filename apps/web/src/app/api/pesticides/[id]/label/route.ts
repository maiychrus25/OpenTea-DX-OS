// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { DomainError, ForbiddenError, NotFoundError } from '@/domain/errors'
import { PrismaPesticideRepository } from '@/infrastructure/db/pesticide/PrismaPesticideRepository'

const labelSchema = z.object({
  label_phi_days: z.number().int().min(1).max(365),
  label_note: z.string().trim().max(200).optional(),
})

async function tenantAndId(context: unknown) {
  const tenant = await requireTenant()
  if (tenant.role !== 'officer' && tenant.role !== 'manager') throw new ForbiddenError('Forbidden')
  const { id } = await (context as { params: Promise<{ id: string }> | { id: string } }).params
  return { tenant, id }
}

async function putLabel(request: Request, context: unknown) {
  const { tenant, id } = await tenantAndId(context)
  const body = labelSchema.safeParse(await request.json().catch(() => ({})))
  if (!body.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: body.error.issues[0]?.message ?? 'Invalid input' } }, { status: 400 })
  }

  const repo = new PrismaPesticideRepository()
  const product = (await repo.list(tenant.htxProfileId, {})).find((row) => row.id === id)
  if (!product) throw new NotFoundError('Không tìm thấy thuốc trong danh mục')
  // A label below the default needs a note (batch number or label text) so a typo can be traced.
  if (body.data.label_phi_days < product.default_phi_days && !body.data.label_note) {
    throw new DomainError(`Thấp hơn mức sàn mặc định ${product.default_phi_days} ngày: cần ghi chú số lô hoặc nội dung nhãn.`)
  }

  const data = await repo.setLabel(tenant.htxProfileId, id, {
    label_phi_days: body.data.label_phi_days,
    label_note: body.data.label_note ?? null,
    verified_by_id: tenant.userId,
  })
  return NextResponse.json({ data })
}

async function deleteLabel(_request: Request, context: unknown) {
  const { tenant, id } = await tenantAndId(context)
  const data = await new PrismaPesticideRepository().clearLabel(tenant.htxProfileId, id)
  if (!data) throw new NotFoundError('Không tìm thấy thuốc trong danh mục')
  return NextResponse.json({ data })
}

export const PUT = withErrorHandler(putLabel)
export const DELETE = withErrorHandler(deleteLabel)
