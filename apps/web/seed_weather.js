const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function seed() {
  const parcels = await prisma.parcel.findMany({
    where: { centroid_lat: { not: null }, centroid_lng: { not: null } }
  });
  for (const p of parcels) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.centroid_lat}&longitude=${p.centroid_lng}&current=temperature_2m,precipitation,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
    const res = await fetch(url);
    const json = await res.json();
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setMilliseconds(0);
    await prisma.weatherCache.upsert({
      where: { parcel_id_recorded_at: { parcel_id: p.id, recorded_at: now } },
      update: {
        condition: json.current.weather_code.toString(),
        temperature_c: json.current.temperature_2m,
        precipitation_mm: json.current.precipitation,
        humidity_pct: json.current.relative_humidity_2m,
        forecast_json: json.daily
      },
      create: {
        parcel_id: p.id,
        recorded_at: now,
        condition: json.current.weather_code.toString(),
        temperature_c: json.current.temperature_2m,
        precipitation_mm: json.current.precipitation,
        humidity_pct: json.current.relative_humidity_2m,
        forecast_json: json.daily,
        source: 'open-meteo'
      }
    });
    console.log('Updated', p.parcel_code);
  }
  console.log('Done');
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); })
