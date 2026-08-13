// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import { PrismaClient, ParcelStatus } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Upsert HtxProfile
  await prisma.htxProfile.upsert({
    where: { htx_code: 'MD2' },
    update: {},
    create: {
      name: 'HTX MD2 Mekong Delta',
      htx_code: 'MD2',
      address: 'XÃ£ Long HÃ²a, Huyá»‡n ChÃ¢u ThÃ nh, Tá»‰nh Tiá»n Giang',
      crop_types: ['LÃºa ST25', 'LÃºa OM5451'],
      season_label: 'Vá»¥ HÃ¨ Thu 2026',
      contact_phone: '02733 123 456',
    },
  })

  // Add more seed data based on the spec
  const hh1 = await prisma.household.upsert({
    where: { phone: '0901234567' },
    update: {},
    create: {
      name: 'Nguyá»…n VÄƒn A',
      phone: '0901234567',
      address: 'áº¤p 1, XÃ£ Long HÃ²a',
    },
  })

  const hh2 = await prisma.household.upsert({
    where: { phone: '0901234568' },
    update: {},
    create: {
      name: 'Tráº§n Thá»‹ B',
      phone: '0901234568',
      address: 'áº¤p 2, XÃ£ Long HÃ²a',
    },
  })

  const hh3 = await prisma.household.upsert({
    where: { phone: '0901234569' },
    update: {},
    create: {
      name: 'LÃª VÄƒn C',
      phone: '0901234569',
      address: 'áº¤p 3, XÃ£ Long HÃ²a',
    },
  })

  // Parcels
  await prisma.parcel.upsert({
    where: { parcel_code: 'P-HTX-MD2-001' },
    update: {},
    create: {
      parcel_code: 'P-HTX-MD2-001',
      household_id: hh1.id,
      crop_type: 'LÃºa ST25',
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
      crop_type: 'LÃºa ST25',
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
      crop_type: 'LÃºa OM5451',
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
      crop_type: 'LÃºa OM5451',
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
      crop_type: 'LÃºa ST25',
      area_ha: 0.8,
      status: ParcelStatus.DRAFT,
    },
  })

  process.stdout.write('Database seeded successfully!\n')
}

main()
  .catch((e) => {
    process.stderr.write(String(e) + '\n')
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
