// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaClient, ParcelStatus } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Upsert HtxProfile
  const htx = await prisma.htxProfile.upsert({
    where: { htx_code: 'MD2' },
    update: {},
    create: {
      name: 'HTX MD2 Mekong Delta',
      htx_code: 'MD2',
      address: 'Xã Long Hòa, Huyện Châu Thành, Tỉnh Tiền Giang',
      crop_types: ['Lúa ST25', 'Lúa OM5451'],
      season_label: 'Vụ Hè Thu 2026',
      contact_phone: '02733 123 456',
    },
  })

  // Add more seed data based on the spec
  const hh1 = await prisma.household.upsert({
    where: { phone: '0901234567' },
    update: { htx_profile_id: htx.id, name: 'Nguyễn Văn A' },
    create: {
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      address: 'Ấp 1, Xã Long Hòa',
      htx_profile_id: htx.id,
    },
  })

  const hh2 = await prisma.household.upsert({
    where: { phone: '0901234568' },
    update: { htx_profile_id: htx.id, name: 'Trần Thị B' },
    create: {
      name: 'Trần Thị B',
      phone: '0901234568',
      address: 'Ấp 2, Xã Long Hòa',
      htx_profile_id: htx.id,
    },
  })

  const hh3 = await prisma.household.upsert({
    where: { phone: '0901234569' },
    update: { htx_profile_id: htx.id, name: 'Lê Văn C' },
    create: {
      name: 'Lê Văn C',
      phone: '0901234569',
      address: 'Ấp 3, Xã Long Hòa',
      htx_profile_id: htx.id,
    },
  })

  // Backfill any existing households with NULL htx_profile_id
  await prisma.household.updateMany({
    where: { htx_profile_id: null },
    data: { htx_profile_id: htx.id },
  })

  // Parcels
  await prisma.parcel.upsert({
    where: { parcel_code: 'P-HTX-MD2-001' },
    update: {},
    create: {
      parcel_code: 'P-HTX-MD2-001',
      household_id: hh1.id,
      crop_type: 'Lúa ST25',
      area_ha: 1.5,
      centroid_lat: 10.762622,
      centroid_lng: 106.660172,
      status: ParcelStatus.SOWING,
    },
  })

  await prisma.parcel.upsert({
    where: { parcel_code: 'P-HTX-MD2-002' },
    update: {},
    create: {
      parcel_code: 'P-HTX-MD2-002',
      household_id: hh1.id,
      crop_type: 'Lúa ST25',
      area_ha: 2.0,
      status: ParcelStatus.TENDING,
    },
  })

  await prisma.parcel.upsert({
    where: { parcel_code: 'P-HTX-MD2-003' },
    update: {},
    create: {
      parcel_code: 'P-HTX-MD2-003',
      household_id: hh2.id,
      crop_type: 'Lúa OM5451',
      area_ha: 3.2,
      status: ParcelStatus.HARVEST_APPROVED,
    },
  })

  await prisma.parcel.upsert({
    where: { parcel_code: 'P-HTX-MD2-004' },
    update: {},
    create: {
      parcel_code: 'P-HTX-MD2-004',
      household_id: hh2.id,
      crop_type: 'Lúa OM5451',
      area_ha: 1.8,
      status: ParcelStatus.HARVESTED,
    },
  })

  await prisma.parcel.upsert({
    where: { parcel_code: 'P-HTX-MD2-005' },
    update: {},
    create: {
      parcel_code: 'P-HTX-MD2-005',
      household_id: hh3.id,
      crop_type: 'Lúa ST25',
      area_ha: 0.8,
      status: ParcelStatus.DRAFT,
    },
  })

  // --- Market Data Baseline Seed ---------------------------------------------
  const marketSeeds = [
    {
      source: 'USDA',
      commodity: 'Rice',
      metric: 'export_price',
      value: 580,
      unit: 'USD/tấn',
      period: '2026-09',
    },
    {
      source: 'FAOSTAT',
      commodity: 'Agricultural Products',
      metric: 'crop_production_index',
      value: 104.5,
      unit: 'index',
      period: '2026',
    },
    {
      source: 'FAOSTAT',
      commodity: 'Fertilizer',
      metric: 'fertilizer_consumption',
      value: 320,
      unit: 'kg/ha arable land',
      period: '2026',
    },
  ]

  for (const m of marketSeeds) {
    await prisma.marketData.upsert({
      where: {
        source_commodity_metric_period: {
          source: m.source,
          commodity: m.commodity,
          metric: m.metric,
          period: m.period,
        },
      },
      update: {
        value: m.value,
        unit: m.unit,
        fetched_at: new Date(),
      },
      create: {
        ...m,
        fetched_at: new Date(),
      },
    })
  }

  // â”€â”€â”€ Weather Cache Baseline Seed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const existingParcels = await prisma.parcel.findMany({
    select: { id: true, parcel_code: true },
  })

  const nowHour = new Date()
  nowHour.setMinutes(0, 0, 0)

  // Generate next 7 days dates YYYY-MM-DD
  const forecastDays: string[] = []
  for (let d = 0; d < 7; d++) {
    const day = new Date()
    day.setDate(day.getDate() + d)
    forecastDays.push(day.toISOString().split('T')[0])
  }

  const sampleForecastJson = {
    time: forecastDays,
    temperature_2m_max: [33.2, 32.5, 31.8, 32.0, 33.5, 34.0, 32.8],
    temperature_2m_min: [25.0, 24.8, 24.5, 25.1, 25.4, 26.0, 25.2],
    precipitation_sum: [4.2, 12.5, 8.0, 2.1, 0.0, 0.0, 6.5],
    weather_code: [61, 63, 61, 3, 0, 0, 61],
  }

  for (const p of existingParcels) {
    await prisma.weatherCache.upsert({
      where: {
        parcel_id_recorded_at: {
          parcel_id: p.id,
          recorded_at: nowHour,
        },
      },
      update: {
        condition: '61', // 61: Mưa nhỏ (WMO code)
        temperature_c: 31.5,
        precipitation_mm: 4.2,
        humidity_pct: 78.0,
        forecast_json: sampleForecastJson,
      },
      create: {
        parcel_id: p.id,
        recorded_at: nowHour,
        condition: '61',
        temperature_c: 31.5,
        precipitation_mm: 4.2,
        humidity_pct: 78.0,
        source: 'open-meteo',
        forecast_json: sampleForecastJson,
      },
    })
  }

  // â”€â”€â”€ Bulletin Baseline Seed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const existingBulletin = await prisma.bulletin.findFirst({
    where: { commodity: 'Lúa gạo', is_latest: true },
  })

  if (!existingBulletin) {
    await prisma.bulletin.create({
      data: {
        commodity: 'Lúa gạo',
        bulletin_vi: 'Bản tin thị trường lúa gạo ĐBSCL: Nhu cầu xuất khẩu gạo duy trì ổn định. Giá gạo xuất khẩu 5% tấm dao động quanh mức 580 USD/tấn. HTX cần tuân thủ lịch thu hoạch và đảm bảo thời gian cách ly theo tiêu chuẩn VietGAP.',
        sources_json: [
          { source: 'USDA', metric: 'export_price', value: 580, date: '2026-09-01' },
          { source: 'WTO', metric: 'import_tariff', value: 35, date: '2026-08-15' },
          { source: 'Sở NN&PTNT', metric: 'production_volume', value: 1500000, date: '2026-08-30' },
        ],
        model_used: 'gemini-1.5-pro',
        is_latest: true,
      },
    })
  }

  // ─── Partner Baseline Seed ───────────────────────────────────────────
  const existingPartner = await prisma.partner.findFirst({
    where: { name: 'Công ty Thu mua Nông sản Xanh' },
  })

  if (!existingPartner) {
    await prisma.partner.createMany({
      data: [
        {
          name: 'Công ty Thu mua Nông sản Xanh',
          partner_type: 'BUYER',
          contact_phone: '0987654321',
          address: 'Ninh Kiều, Cần Thơ',
          lat: 10.0452,
          lng: 105.7469,
          primary_commodities: ['Lúa ST25', 'Lúa OM5451'],
        },
        {
          name: 'Đại lý Phân bón An Phát',
          partner_type: 'WAREHOUSE',
          contact_phone: '0912345678',
          address: 'Châu Thành, Tiền Giang',
          lat: 10.36,
          lng: 106.36,
          primary_commodities: ['Phân bón NPK', 'Ure'],
        },
        {
          name: 'Hệ thống Siêu thị Co-op',
          partner_type: 'BUYER',
          contact_phone: '0909090909',
          address: 'Quận 1, TP. Hồ Chí Minh',
          lat: 10.7769,
          lng: 106.7009,
          primary_commodities: ['Nông sản sạch VietGAP'],
        },
      ],
    })
  }

  process.stdout.write('Database seeded successfully!\n')
}

main()
  .catch((e) => {
    process.stderr.write(String(e) + '\n')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
