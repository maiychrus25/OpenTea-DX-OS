const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const household = await prisma.household.findFirst({
    where: { name: { contains: 'hùng', mode: 'insensitive' } }
  });

  if (!household) {
    console.log('Không tìm thấy nông hộ Hùng');
    return;
  }

  console.log('Tìm thấy nông hộ:', household.id);

  const parcel = await prisma.parcel.create({
    data: {
      parcel_code: 'P01-LH',
      crop_type: 'Lúa',
      area_ha: 0.5,
      household_id: household.id,
      polygon_geojson: '{"type":"Polygon","coordinates":[[[106.123,9.123],[106.124,9.123],[106.124,9.124],[106.123,9.124],[106.123,9.123]]]}'
    }
  });

  console.log('Đã tạo thửa đất:', parcel.name);

  const cycle = await prisma.parcelCropCycle.create({
    data: {
      parcel_id: parcel.id,
      season: 'Vụ Đông Xuân 2026',
      sowed_at: new Date('2026-07-01')
    }
  });

  console.log('Đã tạo vụ mùa:', cycle.season);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
