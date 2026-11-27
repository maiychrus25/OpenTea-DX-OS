// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformAdmin } from '@/lib/api/platform'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { ValidationError } from '@/domain/errors'
import { prisma } from '@/infrastructure/db/prisma.client'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { PrismaMembershipRepository } from '@/infrastructure/db/auth/PrismaMembershipRepository'
import { logger } from '@/lib/logger'

const bodySchema = z.object({
  htx_code: z.string().regex(/^[A-Z0-9]{2,6}$/),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).optional(),
  manager: z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().min(10).max(15),
    pin: z.string().min(6).max(64),
  }),
})

const conflict = (message: string) => NextResponse.json({ error: { code: 'CONFLICT', message } }, { status: 409 })

/** Creates a cooperative and its first manager. A Keycloak failure removes the profile row again, so no cooperative is left without a manager. */
async function createHtx(request: Request) {
  await requirePlatformAdmin()
  const body = bodySchema.parse(await request.json().catch(() => null))

  if (await prisma.htxProfile.findUnique({ where: { htx_code: body.htx_code } })) return conflict('Mã HTX này đã tồn tại')

  const htx = await prisma.htxProfile.create({
    data: { htx_code: body.htx_code, name: body.name, address: body.address ?? '', crop_types: [] },
  })

  try {
    const userId = await new KeycloakAdminAdapter().registerUser(
      { ...body.manager, htxId: htx.id, htxCode: body.htx_code },
      ['manager'],
      true
    )
    await new PrismaMembershipRepository().sync(userId, htx.id, ['manager'])
  } catch (error) {
    try {
      await prisma.htxProfile.delete({ where: { id: htx.id } })
    } catch (deleteError) {
      logger.error('Could not remove the profile after a failed manager account', { error: deleteError, htxCode: body.htx_code })
    }
    if (error instanceof ValidationError) return conflict(error.message)
    throw error
  }

  return NextResponse.json({ data: { id: htx.id, htx_code: htx.htx_code, name: htx.name } }, { status: 201 })
}

export const POST = withErrorHandler(createHtx)
