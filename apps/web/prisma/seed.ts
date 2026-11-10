// Copyright (c) 2026 OpenTea Developers
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

// Demo data for the Tân Cương (TC) and La Bằng (LB) tea cooperatives. Re-runnable: it changes only TC and LB rows
// (and the shared market, bulletin and partner rows below), and every date is relative to the run.
// Names, phones and coordinates are made up; coordinates fall inside the two tea areas but are not real plots.
import { PrismaClient, ParcelStatus, Prisma } from '@prisma/client'
import QRCode from 'qrcode'
// Same value as SIMULATED_MARKET_SOURCE in src/domain/market/simulated-price.ts (ts-node cannot import it here).
const SIMULATED_MARKET_SOURCE = 'Mô phỏng (Toàn quốc)'

const prisma = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date()
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

// Keycloak ids fixed in docker/keycloak/realm-agrimarket.json, so the demo farmers own their household.
const FARMER_TC = '6f2c9a10-1b3d-4e5f-8a01-0000000000a1'
const OFFICER_TC = '6f2c9a10-1b3d-4e5f-8a01-0000000000a2'
const FARMER_LB = '6f2c9a10-1b3d-4e5f-8a01-0000000000b1'

// Stable, so a printed demo QR code keeps working after a re-seed; the app's own codes carry a date.
const A3_LOT_CODE = 'TC-CHE-A3-001'

interface ParcelSeed {
  code: string
  crop: string
  area: number
  lat: number
  lng: number
  status: ParcelStatus
}

interface HouseholdSeed {
  phone: string
  name: string
  address: string
  keycloakUserId?: string
  parcels: ParcelSeed[]
}

interface HtxSeed {
  id: string
  code: string
  name: string
  address: string
  phone: string
  households: HouseholdSeed[]
}

const HTXS: HtxSeed[] = [
  {
    id: 'htx_tc',
    code: 'TC',
    name: 'HTX Chè Tân Cương',
    address: 'Xã Tân Cương, TP. Thái Nguyên, Tỉnh Thái Nguyên',
    phone: '0900100000',
    households: [
      {
        phone: '0900100001', name: 'Hoàng Văn Tâm', address: 'Xóm 1, xã Tân Cương', keycloakUserId: FARMER_TC,
        parcels: [
          { code: 'TC-A1', crop: 'Chè Trung du', area: 0.45, lat: 21.5612, lng: 105.7698, status: ParcelStatus.TENDING },
          { code: 'TC-A3', crop: 'Chè Kim Tuyên', area: 0.32, lat: 21.5638, lng: 105.7731, status: ParcelStatus.TENDING },
        ],
      },
      {
        phone: '0900100002', name: 'Đỗ Thị Hạnh', address: 'Xóm 3, xã Tân Cương',
        parcels: [
          { code: 'TC-A2', crop: 'Chè LDP1', area: 0.6, lat: 21.5587, lng: 105.7752, status: ParcelStatus.HARVESTED },
          { code: 'TC-B1', crop: 'Chè Trung du', area: 0.38, lat: 21.5551, lng: 105.7664, status: ParcelStatus.HARVEST_APPROVED },
        ],
      },
      {
        phone: '0900100003', name: 'Lương Văn Khải', address: 'Xóm 5, xã Tân Cương',
        parcels: [
          { code: 'TC-B2', crop: 'Chè Kim Tuyên', area: 0.27, lat: 21.5669, lng: 105.762, status: ParcelStatus.TENDING },
        ],
      },
    ],
  },
  {
    id: 'htx_lb',
    code: 'LB',
    name: 'HTX Chè La Bằng',
    address: 'Xã La Bằng, Huyện Đại Từ, Tỉnh Thái Nguyên',
    phone: '0900200000',
    households: [
      {
        phone: '0900200001', name: 'Ma Văn Thắng', address: 'Xóm 2, xã La Bằng', keycloakUserId: FARMER_LB,
        parcels: [
          { code: 'LB-A1', crop: 'Chè Trung du', area: 0.52, lat: 21.7124, lng: 105.6215, status: ParcelStatus.TENDING },
          { code: 'LB-A2', crop: 'Chè LDP1', area: 0.41, lat: 21.7088, lng: 105.625, status: ParcelStatus.HARVESTED },
        ],
      },
      {
        phone: '0900200002', name: 'Hà Thị Mai', address: 'Xóm 4, xã La Bằng',
        parcels: [
          { code: 'LB-B1', crop: 'Chè Kim Tuyên', area: 0.35, lat: 21.7151, lng: 105.6182, status: ParcelStatus.TENDING },
        ],
      },
    ],
  },
]

const vietnamYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' })

/** `Lứa <n>/<year>` for rounds started at these instants, numbered as the app numbers a new round. */
function roundLabels(startedAts: Date[]): string[] {
  return startedAts.map((at, i) => {
    const year = vietnamYear.format(at)
    const sameYear = startedAts.slice(0, i).filter((earlier) => vietnamYear.format(earlier) === year).length
    return `Lứa ${sameYear + 1}/${year}`
  })
}

const [A3_PREVIOUS_ROUND, A3_CURRENT_ROUND] = roundLabels([ago(75), ago(28)])

type Tx = Prisma.TransactionClient

async function upsertHousehold(tx: Tx, htxId: string, h: HouseholdSeed) {
  const existing = await tx.household.findUnique({ where: { phone: h.phone } })
  if (existing && existing.htx_profile_id !== htxId) {
    throw new Error(`Household phone ${h.phone} already belongs to another HTX; the seed only changes TC and LB rows`)
  }
  const data = { name: h.name, address: h.address, htx_profile_id: htxId, keycloak_user_id: h.keycloakUserId }
  return tx.household.upsert({ where: { phone: h.phone }, update: data, create: { phone: h.phone, ...data } })
}

async function upsertParcel(tx: Tx, householdId: string, p: ParcelSeed) {
  const existing = await tx.parcel.findUnique({ where: { parcel_code: p.code } })
  if (existing && existing.household_id !== householdId) {
    throw new Error(`Parcel ${p.code} already belongs to another household; the seed only changes TC and LB rows`)
  }
  const approved = p.status === ParcelStatus.HARVEST_APPROVED
  const data = {
    household_id: householdId,
    crop_type: p.crop,
    area_ha: p.area,
    centroid_lat: p.lat,
    centroid_lng: p.lng,
    status: p.status,
    estimated_yield_per_ha: 1800,
    harvest_approved_by: approved ? OFFICER_TC : null,
    harvest_approved_at: approved ? ago(1) : null,
  }
  return tx.parcel.upsert({ where: { parcel_code: p.code }, update: data, create: { parcel_code: p.code, ...data } })
}

/** Removes what the seed creates under its own parcels, so a re-run starts from the same history. */
async function clearParcelHistory(tx: Tx, htxIds: string[], parcelIds: string[]) {
  const lots = await tx.lot.findMany({
    where: {
      htx_profile_id: { in: htxIds },
      OR: [{ lot_code: A3_LOT_CODE }, { lot_parcels: { some: { parcel_id: { in: parcelIds } } } }],
    },
    select: { id: true },
  })
  const lotIds = lots.map((l) => l.id)
  await tx.lotParcel.deleteMany({ where: { lot_id: { in: lotIds } } })
  await tx.lot.deleteMany({ where: { id: { in: lotIds } } })
  await tx.journalEntry.deleteMany({ where: { parcel_id: { in: parcelIds } } }) // activities cascade
  await tx.parcelCropCycle.deleteMany({ where: { parcel_id: { in: parcelIds } } })
  await tx.diseaseReport.deleteMany({ where: { parcel_id: { in: parcelIds } } })
  await tx.weatherCache.deleteMany({ where: { parcel_id: { in: parcelIds } } })
}

interface EntrySeed {
  date: Date
  type: 'FERTILIZING' | 'SPRAYING' | 'HARVEST'
  detail: string
  product?: string
  dosage?: string
  withdrawalDays?: number
}

async function addApprovedEntry(tx: Tx, parcelId: string, performedBy: string, e: EntrySeed) {
  return tx.journalEntry.create({
    data: {
      parcel_id: parcelId,
      entry_date: e.date,
      activity_type: e.type,
      performed_by: performedBy,
      submitted_by_id: FARMER_TC,
      submitted_role: 'FARMER',
      status: 'APPROVED',
      approved_by_id: OFFICER_TC,
      approved_at: new Date(e.date.getTime() + DAY / 4),
      activities: {
        create: [{
          activity_detail: e.detail,
          product_name: e.product ?? null,
          dosage: e.dosage ?? null,
          withdrawal_days: e.withdrawalDays ?? null,
          safe_harvest_date: e.withdrawalDays ? new Date(e.date.getTime() + e.withdrawalDays * DAY) : null,
        }],
      },
    },
  })
}

/** Parcel A3 of TC: a previous round harvested and exported as a lot, and a current round under a 7-day withdrawal. */
async function seedA3(tx: Tx, htx: { id: string; name: string }, a3: { id: string; parcel_code: string; area_ha: number; crop_type: string }, household: { id: string; name: string }) {
  await tx.parcelCropCycle.create({ data: { parcel_id: a3.id, season: A3_PREVIOUS_ROUND, sowed_at: ago(75), harvested_at: ago(30), created_at: ago(75) } })
  await tx.parcelCropCycle.create({ data: { parcel_id: a3.id, season: A3_CURRENT_ROUND, sowed_at: ago(28), created_at: ago(28) } })

  const previous: EntrySeed[] = [
    { date: ago(70), type: 'FERTILIZING', detail: 'Bón phân hữu cơ vi sinh quanh gốc', product: 'Phân hữu cơ vi sinh', dosage: '600 kg/ha' },
    { date: ago(45), type: 'SPRAYING', detail: 'Phun trừ rầy xanh', product: 'Chế phẩm sinh học trừ rầy', dosage: '1 lít/ha', withdrawalDays: 7 },
    { date: ago(30), type: 'HARVEST', detail: 'Hái một tôm hai lá, 120 kg búp tươi' },
  ]
  for (const e of previous) await addApprovedEntry(tx, a3.id, household.name, e)
  await addApprovedEntry(tx, a3.id, household.name, { date: ago(10), type: 'FERTILIZING', detail: 'Bón thúc sau đốn', product: 'Phân NPK 5-10-3', dosage: '300 kg/ha' })
  await addApprovedEntry(tx, a3.id, household.name, { date: ago(3), type: 'SPRAYING', detail: 'Phun trừ bọ xít muỗi', product: 'Thuốc trừ sâu gốc Abamectin', dosage: '0,4 lít/ha', withdrawalDays: 7 })

  // The lot is seeded as already exported: exporting now would fail on A3's active withdrawal (ruling R5).
  const harvestDate = ago(30)
  const exportedAt = ago(29)
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const qrImageUrl = await QRCode.toDataURL(`${baseUrl}/lot/${encodeURIComponent(A3_LOT_CODE)}`, { margin: 1 })
  // Same shape as the snapshot ExportQrUseCase stores (LotTraceData); status and qr_image_url hold the exported values the trace page expects.
  const snapshot = {
    lot_code: A3_LOT_CODE,
    commodity: 'Chè',
    quality_grade: 'Grade 1',
    status: 'QR_EXPORTED',
    packaging_date: harvestDate,
    packaging_spec: 'Túi hút chân không 500 g',
    total_weight_kg: 24,
    qr_image_url: qrImageUrl,
    created_at: exportedAt,
    is_harvest_safe: true,
    latest_safe_harvest_date: new Date(ago(45).getTime() + 7 * DAY),
    parcels: [{ parcel_code: a3.parcel_code, area_ha: a3.area_ha, household_name: household.name, crop_type: a3.crop_type, status: 'HARVESTED' }],
    journal_summaries: previous.map((e) => ({
      entry_date: e.date,
      activity_type: e.type,
      performed_by: household.name,
      approved_by_id: OFFICER_TC,
      activity_detail: e.detail,
      product_name: e.product ?? null,
      dosage: e.dosage ?? null,
      withdrawal_days: e.withdrawalDays ?? null,
    })),
    certificate_keys: [],
    htx_name: htx.name,
  }
  await tx.lot.create({
    data: {
      lot_code: A3_LOT_CODE,
      commodity: 'Chè',
      quality_grade: 'Grade 1',
      harvest_date: harvestDate,
      estimated_weight_kg: 25,
      actual_weight_kg: 24,
      packaging_type: 'Túi hút chân không 500 g',
      status: 'QR_EXPORTED',
      qr_image_url: qrImageUrl,
      public_page_data: JSON.parse(JSON.stringify(snapshot)),
      created_by_id: OFFICER_TC,
      created_at: exportedAt,
      htx_profile_id: htx.id,
      lot_parcels: { create: [{ parcel_id: a3.id }] },
    },
  })

  await tx.diseaseReport.create({
    data: {
      parcel_id: a3.id,
      household_id: household.id,
      detected_by_id: FARMER_TC,
      detection_date: ago(1),
      photo_url: 'para/TC/Archives/Disease_Photos/seed-tc-a3-la-che.jpg',
      photo_minio_key: 'para/TC/Archives/Disease_Photos/seed-tc-a3-la-che.jpg',
      gps_lat: 21.5638,
      gps_lng: 105.7731,
      ai_disease_name: 'Bệnh chấm xám',
      ai_confidence: 0.82,
      status: 'PENDING',
    },
  })
}

/** One open round per parcel; a HARVESTED parcel's round is closed so a new one can start in the demo. */
async function seedRound(tx: Tx, parcel: { id: string; status: ParcelStatus }) {
  const startedAt = parcel.status === ParcelStatus.TENDING ? ago(20) : ago(55)
  const [label] = roundLabels([startedAt])
  await tx.parcelCropCycle.create({
    data: {
      parcel_id: parcel.id,
      season: label,
      sowed_at: startedAt,
      harvested_at: parcel.status === ParcelStatus.HARVESTED ? ago(2) : null,
      created_at: startedAt,
    },
  })
}

async function seedCooperatives() {
  await prisma.$transaction(async (tx) => {
    const htxIds: string[] = []
    const parcels: { htx: { id: string; name: string }; household: { id: string; name: string }; parcel: Awaited<ReturnType<typeof upsertParcel>> }[] = []
    for (const h of HTXS) {
      const data = {
        name: h.name,
        address: h.address,
        contact_phone: h.phone,
        crop_types: ['Chè Trung du', 'Chè LDP1', 'Chè Kim Tuyên'],
        season_label: A3_CURRENT_ROUND,
        total_area_ha: Math.round(h.households.flatMap((hh) => hh.parcels).reduce((sum, p) => sum + p.area, 0) * 100) / 100,
      }
      const htx = await tx.htxProfile.upsert({ where: { htx_code: h.code }, update: data, create: { id: h.id, htx_code: h.code, ...data } })
      htxIds.push(htx.id)
      for (const hh of h.households) {
        const household = await upsertHousehold(tx, htx.id, hh)
        for (const p of hh.parcels) parcels.push({ htx, household, parcel: await upsertParcel(tx, household.id, p) })
      }
    }

    await clearParcelHistory(tx, htxIds, parcels.map((p) => p.parcel.id))
    for (const { htx, household, parcel } of parcels) {
      if (parcel.parcel_code === 'TC-A3') await seedA3(tx, htx, parcel, household)
      else await seedRound(tx, parcel)
    }

    // Weather baseline for the seeded parcels only.
    const nowHour = new Date(NOW)
    nowHour.setMinutes(0, 0, 0)
    const forecastDays: string[] = []
    for (let d = 0; d < 7; d++) forecastDays.push(new Date(NOW.getTime() + d * DAY).toISOString().split('T')[0])
    const forecast = {
      time: forecastDays,
      temperature_2m_max: [27.5, 26.8, 25.9, 26.4, 27.1, 28.0, 26.2],
      temperature_2m_min: [18.2, 17.9, 17.5, 18.4, 19.0, 19.6, 18.1],
      precipitation_sum: [0.0, 1.2, 3.5, 0.4, 0.0, 0.0, 2.1],
      weather_code: [1, 3, 61, 3, 0, 1, 61],
    }
    await tx.weatherCache.createMany({
      data: parcels.map(({ parcel }) => ({
        parcel_id: parcel.id,
        recorded_at: nowHour,
        condition: '3', // WMO 3: nhiều mây
        temperature_c: 24.5,
        precipitation_mm: 0,
        humidity_pct: 80,
        source: 'open-meteo',
        forecast_json: forecast,
      })),
    })
  }, { timeout: 60_000 })
}

async function main() {
  await seedCooperatives()

  // --- Market Data Baseline Seed ---------------------------------------------
  const marketSeeds = [
    {
      // Made-up demo figures carry only the simulated source (labelled in the UI), never a real agency's name.
      source: SIMULATED_MARKET_SOURCE,
      commodity: 'Tea',
      metric: 'Giá chè búp khô Thái Nguyên',
      value: 200000,
      unit: 'VND/kg',
      period: '2026-11',
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

  // ─── Bulletin Baseline Seed ───────────────────────────────────────────
  const existingBulletin = await prisma.bulletin.findFirst({
    where: { commodity: 'Tea', is_latest: true },
  })

  if (!existingBulletin) {
    await prisma.bulletin.create({
      data: {
        commodity: 'Tea',
        bulletin_vi: 'Bản tin thị trường chè Thái Nguyên: Nhu cầu chè búp khô duy trì ổn định. Giá chè búp khô quanh mức 200.000 đ/kg (giá mô phỏng). HTX cần tuân thủ lịch thu hái và đảm bảo thời gian cách ly theo tiêu chuẩn VietGAP.',
        sources_json: [
          { source: SIMULATED_MARKET_SOURCE, metric: 'Giá chè búp khô Thái Nguyên', value: 200000, date: '2026-11-01' },
        ],
        model_used: 'gemini-1.5-pro',
        is_latest: true,
      },
    })
  }

  // ─── Partner Baseline Seed ───────────────────────────────────────────
  const existingPartner = await prisma.partner.findFirst({
    where: { name: 'Công ty Thu mua Chè Tân Cương' },
  })

  if (!existingPartner) {
    await prisma.partner.createMany({
      data: [
        {
          name: 'Công ty Thu mua Chè Tân Cương',
          partner_type: 'BUYER',
          contact_phone: '0987654321',
          address: 'Tân Cương, TP. Thái Nguyên',
          lat: 21.5650,
          lng: 105.7700,
          primary_commodities: ['Chè Trung du', 'Chè Kim Tuyên'],
        },
        {
          name: 'Đại lý Phân bón An Phát',
          partner_type: 'WAREHOUSE',
          contact_phone: '0912345678',
          address: 'Đại Từ, Thái Nguyên',
          lat: 21.6300,
          lng: 105.6400,
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
