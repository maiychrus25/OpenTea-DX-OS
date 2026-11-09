// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server'
import { requireTenant } from '@/lib/api/tenant'
import { withErrorHandler } from '@/lib/api/withErrorHandler'
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter'
import { InviteMemberUseCase } from '@/application/auth/invite-member.use-case'
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository'
import { PrismaHtxProfileRepository } from '@/infrastructure/db/farm/PrismaHtxProfileRepository'
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
  const tenant = await requireTenant()
  if (tenant.role !== 'manager') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Chỉ Trưởng HTX mới được mời thành viên' } }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = inviteSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: parse.error.errors[0]?.message || 'Dữ liệu không hợp lệ' } }, { status: 400 })
  }

  const { fullName, phone, role } = parse.data

  try {
    const keycloakAdapter = new KeycloakAdminAdapter()
    const householdRepo = new PrismaHouseholdRepository()
    const htxRepo = new PrismaHtxProfileRepository()
    
    const useCase = new InviteMemberUseCase(keycloakAdapter, householdRepo, htxRepo)
    const result = await useCase.execute(parse.data, tenant.htxCode)

    const roleLabel = ROLE_LABELS[role] || role

    return NextResponse.json({
      data: {
        ...result,
        username: phone,
        role,
        message: `Đã tạo tài khoản ${roleLabel} "${fullName}". Đăng nhập bằng SĐT: ${phone}`,
      }
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Invite Member Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: { message: errorMessage } }, { status: 500 })
  }
}

export const POST = withErrorHandler(inviteMember)
