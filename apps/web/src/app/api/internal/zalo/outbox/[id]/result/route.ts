// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { zaloNotifier } from '@/application/zalo/zalo-services'
import { NotFoundError } from '@/domain/errors'
import { requireZaloCaller } from '@/lib/api/internal-zalo-auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'

const resultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), zalo_msg_id: z.union([z.string().max(200), z.number()]).nullable().optional().transform((v) => (v == null ? null : String(v))) }),
  z.object({
    ok: z.literal(false),
    error: z.string().min(1).max(1000),
    retry_after_seconds: z.number().int().min(0).max(3600).optional(),
    permanent: z.boolean().optional(),
  }),
])

async function postZaloResult(request: Request, context: unknown) {
  await requireZaloCaller(request)
  const { params } = context as { params: Promise<{ id: string }> | { id: string } }
  const { id } = await params
  const body = resultSchema.parse(await request.json().catch(() => null))
  const status = await zaloNotifier().recordResult(z.string().uuid().parse(id), body)
  if (!status) throw new NotFoundError('Không tìm thấy tin nhắn')
  return NextResponse.json({ data: { status } })
}

export const POST = withErrorHandler(postZaloResult)
