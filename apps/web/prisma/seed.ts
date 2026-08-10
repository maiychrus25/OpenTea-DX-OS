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
      address: 'Xã Long Hòa, Huyện Châu Thành, Tỉnh Tiền Giang',
      crop_types: ['Lúa ST25', 'Lúa OM5451'],
      season_label: 'Vụ Hè Thu 2026',
      contact_phone: '02733 123 456',
    },
  })

  // Add more seed data based on the spec
  const hh1 = await prisma.household.upsert({
    where: { phone: '0901234567' },
    update: {},
    create: {
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      address: 'Ấp 1, Xã Long Hòa',
    },
  })

  const hh2 = await prisma.household.upsert({
    where: { phone: '0901234568' },
    update: {},
    create: {
      name: 'Trần Thị B',
      phone: '0901234568',
      address: 'Ấp 2, Xã Long Hòa',
    },
  })

  const hh3 = await prisma.household.upsert({
    where: { phone: '0901234569' },
    update: {},
    create: {
      name: 'Lê Văn C',
      phone: '0901234569',
      address: 'Ấp 3, Xã Long Hòa',
    },
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

  console.log('Database seeded successfully!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
