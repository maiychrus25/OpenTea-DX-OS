// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/keycloak-admin.adapter';
import { PrismaHouseholdRepository } from '@/infrastructure/db/farm/PrismaHouseholdRepository';
import { RegisterFarmerUseCase } from '@/application/auth/register-farmer.use-case';
import { withErrorHandler } from '@/lib/api/withErrorHandler';
import { logger } from '@/lib/logger';
import { prisma } from '@/infrastructure/db/prisma.client';
import { ValidationError } from '@/domain/errors';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Họ và tên quá ngắn'),
  phone: z.string().regex(/^[0-9]{10,11}$/, 'Số điện thoại không hợp lệ'),
  htxId: z.string().min(1, 'Vui lòng chọn HTX'),
  pin: z.string().regex(/^[0-9]{6}$/, 'Mã PIN phải gồm 6 chữ số'),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
// shortcut: per-process and trusts the forwarded IP, move to the gateway or a shared store when web runs more than one instance
const attemptsByIp = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(req: Request): boolean {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  // The map is in expiry order, so only expired entries at its head are visited.
  let oldest = attemptsByIp.entries().next().value;
  while (oldest && oldest[1].resetAt <= now) {
    attemptsByIp.delete(oldest[0]);
    oldest = attemptsByIp.entries().next().value;
  }
  const attempt = attemptsByIp.get(ip);
  if (!attempt || attempt.resetAt <= now) {
    attemptsByIp.delete(ip);
    attemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  attempt.count += 1;
  return attempt.count > RATE_LIMIT_MAX;
}

async function postRegister(req: Request) {
  if (isRateLimited(req)) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Bạn đã gửi quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 10 phút.' } },
      { status: 429 }
    );
  }

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
      { status: 400 }
    );
  }

  const htx = await prisma.htxProfile.findUnique({
    where: { id: parsed.data.htxId },
    select: { htx_code: true },
  });
  if (!htx) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Hợp tác xã không tồn tại' } },
      { status: 400 }
    );
  }

  const adapter = new KeycloakAdminAdapter();
  const householdRepo = new PrismaHouseholdRepository();
  const useCase = new RegisterFarmerUseCase(adapter, householdRepo);

  try {
    const result = await useCase.execute({ ...parsed.data, htxCode: htx.htx_code });
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: error.message } },
        { status: 400 }
      );
    }
    logger.error('Registration failed', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Không thể đăng ký lúc này. Vui lòng thử lại sau.' } },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler(postRegister);
