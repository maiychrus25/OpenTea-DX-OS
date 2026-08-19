// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { prisma } from '../../../infrastructure/db/prisma.client';

describe('n8n Database Integration Idempotency Tests', () => {
  // Use a transaction or clean up after tests to ensure DB state is not polluted.
  // In Prisma, we can't easily rollback nested tests, so we'll just insert and delete.

  const testSuffix = `test-${Date.now()}`;
  let testHtxId: string;
  let testHouseholdId: string;
  let testParcelId: string;

  beforeAll(async () => {
    // We need a parcel to test weather_cache
    const htx = await prisma.htxProfile.create({
      data: {
        name: 'Test HTX',
        htx_code: `HTX-${testSuffix}`,
        address: 'Test Address',
      }
    });
    testHtxId = htx.id;

    const household = await prisma.household.create({
      data: {
        name: 'Test Household',
        phone: `0000${Date.now()}`.slice(-10),
        htx_profile_id: testHtxId,
      }
    });
    testHouseholdId = household.id;

    const parcel = await prisma.parcel.create({
      data: {
        parcel_code: `P-${testSuffix}`,
        household_id: testHouseholdId,
        crop_type: 'Test Crop',
        area_ha: 1.5,
      }
    });
    testParcelId = parcel.id;
  });

  afterAll(async () => {
    await prisma.weatherCache.deleteMany({ where: { parcel_id: testParcelId } });
    await prisma.parcel.delete({ where: { id: testParcelId } });
    await prisma.household.delete({ where: { id: testHouseholdId } });
    await prisma.htxProfile.delete({ where: { id: testHtxId } });
    await prisma.marketData.deleteMany({ where: { period: testSuffix } });
    await prisma.notification.deleteMany({ where: { title: `Test Error ${testSuffix}` } });
  });

  it('should enforce idempotency for market_data using unique constraints', async () => {
    const mockData = {
      source: 'TEST_SOURCE',
      commodity: 'TEST_COMMODITY',
      metric: 'TEST_METRIC',
      value: 100,
      unit: 'USD',
      period: testSuffix,
    };

    // First insert should succeed
    const firstInsert = await prisma.marketData.create({
      data: mockData,
    });
    expect(firstInsert.id).toBeDefined();

    // Second insert should fail with P2002 Unique constraint failed
    await expect(prisma.marketData.create({
      data: mockData,
    })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('should enforce idempotency for weather_cache using unique constraints', async () => {
    const now = new Date();
    const mockData = {
      parcel_id: testParcelId,
      recorded_at: now,
      condition: 'Sunny',
      temperature_c: 30,
      precipitation_mm: 0,
      humidity_pct: 60,
      source: 'test-meteo',
    };

    // First insert
    const firstInsert = await prisma.weatherCache.create({
      data: mockData,
    });
    expect(firstInsert.id).toBeDefined();

    // Second insert with same parcel_id and recorded_at should fail
    await expect(prisma.weatherCache.create({
      data: mockData,
    })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('should accept SYSTEM notification for n8n error reporting', async () => {
    const mockErrorNotification = {
      type: 'SYSTEM' as const,
      title: `Test Error ${testSuffix}`,
      body: 'Workflow failed',
      // n8n generates standard strings, Prisma cuid or gen_random_uuid() is fine.
    };

    const notif = await prisma.notification.create({
      data: mockErrorNotification,
    });

    expect(notif.id).toBeDefined();
    expect(notif.type).toBe('SYSTEM');
  });
});
