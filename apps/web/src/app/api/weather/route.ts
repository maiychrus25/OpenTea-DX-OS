// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { weatherSchema } from '@/lib/validations/weather.schema';
import { GetWeatherUseCase } from '@/application/farm/GetWeatherUseCase';
import { PrismaWeatherCacheRepository } from '@/infrastructure/db/farm/PrismaWeatherCacheRepository';
import { PrismaParcelRepository } from '@/infrastructure/db/farm/PrismaParcelRepository';
import { withErrorHandler } from '@/lib/api/withErrorHandler';

// Initialize dependencies
const weatherCachePort = new PrismaWeatherCacheRepository();
const parcelPort = new PrismaParcelRepository();

const getWeatherUseCase = new GetWeatherUseCase(
  weatherCachePort,
  parcelPort
);

export const GET = withErrorHandler(async (req: Request) => {
  const session = await auth();
  
  if (!session || !session.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date');
  const parcelId = searchParams.get('parcelId');

  // Validate request parameters using Zod
  const validationResult = weatherSchema.safeParse({ date: dateStr, parcelId });
  
  if (!validationResult.success) {
    return NextResponse.json(
      { 
        error: 'Validation Error', 
        details: validationResult.error.flatten().fieldErrors 
      },
      { status: 400 }
    );
  }

  const { date, parcelId: validatedParcelId } = validationResult.data;

  // Execute use case
  const weatherData = await getWeatherUseCase.execute(validatedParcelId, date, {
    id: session.user.id as string,
    role: session.user.role as string,
    householdId: (session.user as any).household_id,
  });

  return NextResponse.json(
    { data: weatherData },
    { status: 200 }
  );
});
