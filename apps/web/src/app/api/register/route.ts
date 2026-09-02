// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { KeycloakAdminAdapter } from '@/infrastructure/db/auth/KeycloakAdminAdapter';
import { RegisterFarmerUseCase } from '@/application/auth/RegisterFarmerUseCase';
import { withErrorHandler } from '@/lib/api/withErrorHandler';
import { logger } from '@/lib/logger';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Họ và tên quá ngắn'),
  phone: z.string().regex(/^[0-9]{10,11}$/, 'Số điện thoại không hợp lệ'),
  htxId: z.string().min(1, 'Vui lòng chọn HTX'),
  pin: z.string().regex(/^[0-9]{6}$/, 'Mã PIN phải gồm 6 chữ số'),
});

async function postRegister(req: Request) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
      { status: 400 }
    );
  }

  const adapter = new KeycloakAdminAdapter();
  const useCase = new RegisterFarmerUseCase(adapter);

  try {
    const result = await useCase.execute(parsed.data);
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Registration failed', { message: error.message });
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: error.message } },
      { status: 400 }
    );
  }
}

export const POST = withErrorHandler(postRegister);
