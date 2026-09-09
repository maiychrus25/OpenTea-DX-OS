// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { prisma } from '@/infrastructure/db/prisma.client'
import { z } from 'zod'

const ALLOWED_ROLES = ['farmer', 'officer'] as const

const inviteSchema = z.object({
  fullName: z.string().min(2, 'Tên phải có ít nhất 2 ký tự'),
  phone: z.string().min(10, 'Số điện thoại phải có ít nhất 10 số'),
  pin: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  role: z.enum(ALLOWED_ROLES).default('farmer'),
  address: z.string().optional(),
})

const ROLE_LABELS: Record<string, string> = {
  farmer: 'nông dân',
  officer: 'cán bộ kỹ thuật',
}

async function inviteMember(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
  }

  // Lấy tạm role do NextAuth type chưa extend
  const currentRole = (session.user as any).role
  if (currentRole !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ Trưởng HTX mới được mời thành viên' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = inviteSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.errors[0]?.message || 'Dữ liệu không hợp lệ' } }, { status: 400 })
  }

  const { fullName, phone, pin, role, address } = parse.data

  // Get HTX profile for linking
  const htx = await prisma.htxProfile.findFirst()
  if (!htx) {
    return NextResponse.json({ error: { code: 'HTX_NOT_FOUND', message: 'Chưa có hồ sơ HTX' } }, { status: 400 })
  }

  // Step 1: Create Keycloak user with specified role
  const keycloakAdapter = new KeycloakAdminAdapter()
  const keycloakUserId = await keycloakAdapter.registerUser({
    fullName,
    phone,
    pin,
    htxId: htx.id,
  }, role, true) // enabled = true, login được ngay

  // Step 2: Create or Update Household in DB (only for farmer)
  let householdId: string | null = null
  if (role === 'farmer') {
    const orphanedHousehold = await prisma.household.findFirst({
      where: {
        phone: phone,
        keycloak_user_id: null,
      }
    })

    if (orphanedHousehold) {
      const updatedHousehold = await prisma.household.update({
        where: { id: orphanedHousehold.id },
        data: {
          keycloak_user_id: keycloakUserId,
        }
      })
      householdId = updatedHousehold.id
    } else {
      const household = await prisma.household.create({
        data: {
          name: fullName,
          phone,
          address: address || null,
          keycloak_user_id: keycloakUserId,
          htx_profile_id: htx.id,
        },
      })
      householdId = household.id
    }
  }

  const roleLabel = ROLE_LABELS[role] || role

  return NextResponse.json({
    data: {
      keycloakUserId,
      householdId,
      username: phone,
      role,
      message: `Đã tạo tài khoản ${roleLabel} "${fullName}". Đăng nhập bằng SĐT: ${phone}`,
    }
  }, { status: 201 })
}

export const POST = withErrorHandler(inviteMember)
