// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { NotFoundError } from '@/domain/errors'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { pesticideProducts } from '@/lib/platform-pesticides'

const bodySchema = z.object({
  default_phi_days: z.number().int().min(1).max(365),
  phi_needs_label_check: z.boolean(),
  active: z.boolean(),
})

/** The platform admin edits the floor days of the shared catalogue after checking the label, and clears the label-check flag. */
async function updatePesticide(request: Request, { params }: { params: { id: string } }) {
  await requirePlatformAdmin()
  const data = bodySchema.parse(await request.json().catch(() => null))
  const products = pesticideProducts()
  if (!(await products.findUnique({ where: { id: params.id } }))) throw new NotFoundError('Không tìm thấy thuốc')
  const updated = await products.update({ where: { id: params.id }, data })
  return NextResponse.json({ data: updated })
}

export const PUT = withErrorHandler(updatePesticide)
