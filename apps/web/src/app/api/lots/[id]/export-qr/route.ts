// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { PrismaLotRepository } from '@/infrastructure/db/lot/PrismaLotRepository'
import { PrismaLotTraceRepository } from '@/infrastructure/db/repositories/prisma-lot-trace-repository'
import { ExportQrUseCase } from '@/application/lot/ExportQrUseCase'
import { z } from 'zod'

const exportQrSchema = z.object({
  certificate_keys: z.array(z.string()).optional(),
})

async function postExportQr(request: Request, context: unknown) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }
  const role = (session.user as any).role
  if (role !== 'officer' && role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Only officer/manager can export QR' } }, { status: 403 })
  }

  const { params } = context as { params: Promise<{ id: string }> }
  const { id } = await params

  let certificateKeys: string[] | undefined
  try {
    const body = await request.json()
    const parsed = exportQrSchema.parse(body)
    certificateKeys = parsed.certificate_keys
  } catch (e) {
    // If no body or invalid json, just ignore (certificate_keys is optional)
  }

  const lotRepo = new PrismaLotRepository()
  const traceRepo = new PrismaLotTraceRepository()
  const useCase = new ExportQrUseCase(lotRepo, traceRepo)
  const data = await useCase.execute(id, certificateKeys)
  return NextResponse.json({ data })
}

export const POST = withErrorHandler(postExportQr)
