// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// Closed stage-demo dataset for the Tân Cương (TC) cooperative. Run it after `seed`: it assumes the TC households, parcels,
// leaf grades and lot TC-CHE-A3-001 that seed.ts creates, and never changes seed.ts rows except that lot's trace snapshot.
// Re-runnable: every row is found by a fixed natural key (client_id, batch note, certificate number, period of the HTX) and a
// run that finds it leaves it alone. Dates are relative to the first run. `npm run demo-seed` runs it.
import type { Prisma } from '@prisma/client'
import { prisma } from '@/infrastructure/db/prisma.client'
import { vnDayOf, vnDayStart } from '@/application/agent/campaign/vn-day'
import { computeTicket } from '@/domain/weighing/ticket-math'
import { CreateCertificate } from '@/application/certificate/CertificateUseCases'
import { CloseSettlementPeriodUseCase, CreateSettlementPeriodUseCase, GetSettlementUseCase, type SettlementActor } from '@/application/ledger/SettlementUseCases'
import { zaloNotifier } from '@/application/zalo/zalo-services'
import { PrismaCertificateRepository } from '@/infrastructure/db/certificate/PrismaCertificateRepository'
import { PrismaSettlementRepository } from '@/infrastructure/db/ledger/PrismaSettlementRepository'
import { MinioDocumentAdapter } from '@/infrastructure/storage/minio-document.adapter'
import type { DocumentStoragePort } from '@/domain/document/ports/document-storage.port'
import type { LotTraceBatch, LotTraceIntake } from '@/domain/entities/lot-trace-data'

const DAY = 24 * 60 * 60 * 1000
const HTX_CODE = 'TC'
const LOT_CODE = 'TC-CHE-A3-001'
// Fixed in docker/keycloak/realm-agrimarket.json; the demo tickets are weighed by this officer.
const OFFICER_TC = '6f2c9a10-1b3d-4e5f-8a01-0000000000a2'
const DEMO_ACTOR = 'demo-seed'
const BATCH_NOTE = 'Mẻ sao demo (demo-seed)'
const CERTIFICATE_NUMBER = 'DEMO-VIETGAP-2026-001'

const PRICES = [
  { grade: 'Loại 1 (1 tôm 2 lá)', vnd: 24000 },
  { grade: 'Loại 2', vnd: 18000 },
  { grade: 'Loại 3', vnd: 12000 },
]

// Smallest valid PDF: enough for the certificate file check and for a browser to open it.
const DEMO_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 70>>stream\nBT /F1 14 Tf 20 60 Td (DEMO - VietGAP sample certificate) Tj ET\nendstream\nendobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'latin1',
)

interface TicketSeed {
  key: string
  parcel: string
  daysAgo: number
  grade: string
  gross: number
  deduction: number
  minute: number
  /** The flush the ticket belongs to: the open round, or the round that closed when A3 was harvested. */
  round: 'open' | 'closed'
  price?: number
}

// Recent weighing: A1, A2, B1 are ordinary intake. B2 (0.27 ha, norm 656 kg a flush) is weighed far above it, for A13 R2.
const RECENT: TicketSeed[] = [
  { key: 'A1-1', parcel: 'TC-A1', daysAgo: 9, grade: PRICES[0].grade, gross: 82, deduction: 2, minute: 5, round: 'open' },
  { key: 'A1-2', parcel: 'TC-A1', daysAgo: 5, grade: PRICES[0].grade, gross: 72, deduction: 2, minute: 12, round: 'open' },
  { key: 'A1-3', parcel: 'TC-A1', daysAgo: 1, grade: PRICES[0].grade, gross: 64, deduction: 2, minute: 20, round: 'open' },
  { key: 'A2-1', parcel: 'TC-A2', daysAgo: 8, grade: PRICES[1].grade, gross: 92, deduction: 3, minute: 8, round: 'closed' },
  { key: 'A2-2', parcel: 'TC-A2', daysAgo: 3, grade: PRICES[1].grade, gross: 86, deduction: 3, minute: 15, round: 'closed' },
  { key: 'B1-1', parcel: 'TC-B1', daysAgo: 7, grade: PRICES[1].grade, gross: 62, deduction: 2, minute: 10, round: 'open' },
  { key: 'B1-2', parcel: 'TC-B1', daysAgo: 2, grade: PRICES[2].grade, gross: 56, deduction: 2, minute: 18, round: 'open' },
  ...[8, 6, 4, 2, 0].map((daysAgo, i): TicketSeed => ({ key: `B2-${i + 1}`, parcel: 'TC-B2', daysAgo, grade: PRICES[0].grade, gross: 150, deduction: 4, minute: 6 + i, round: 'open' })),
]

// Three tickets of A3's previous round feed the demo batch: 142.5 kg fresh, 30.0 kg dry, ratio 4.75 (band 4.5 to 5.0).
const BATCH_TICKETS: TicketSeed[] = [
  { key: 'A3-1', parcel: 'TC-A3', daysAgo: 31, grade: PRICES[0].grade, gross: 51, deduction: 2, minute: 3, round: 'closed' },
  { key: 'A3-2', parcel: 'TC-A3', daysAgo: 31, grade: PRICES[0].grade, gross: 48.5, deduction: 2, minute: 30, round: 'closed' },
  { key: 'A3-3', parcel: 'TC-A3', daysAgo: 30, grade: PRICES[0].grade, gross: 45.9, deduction: 2, minute: 9, round: 'closed' },
]

export interface DemoSummary {
  lines: string[]
}

export interface DemoDeps {
  storage: Pick<DocumentStoragePort, 'uploadDocument'>
  now?: Date
}

export async function runDemoSeed({ storage, now = new Date() }: DemoDeps): Promise<DemoSummary> {
  const lines: string[] = []
  const say = (line: string) => lines.push(line)
  const dayAgo = (n: number) => vnDayOf(new Date(now.getTime() - n * DAY))
  const weighedAt = (daysAgo: number, minute: number) =>
    new Date(Math.min(now.getTime() - 60_000, vnDayStart(dayAgo(daysAgo)).getTime() + (7 * 60 + minute) * 60_000))
  const dateOnly = (day: string) => new Date(`${day}T00:00:00Z`)

  const htx = await prisma.htxProfile.findUnique({ where: { htx_code: HTX_CODE } })
  if (!htx) throw new Error('HTX TC chưa có: chạy `npm run seed` trước khi chạy demo-seed')
  const parcels = await prisma.parcel.findMany({ where: { household: { htx_profile_id: htx.id } }, include: { household: true, crop_cycles: true } })
  const parcelByCode = new Map(parcels.map((p) => [p.parcel_code, p]))
  const grades = new Map((await prisma.leafGrade.findMany({ where: { htx_profile_id: htx.id } })).map((g) => [g.name, g]))
  const lot = await prisma.lot.findUnique({ where: { lot_code: LOT_CODE } })
  if (!lot || parcelByCode.size < 5 || grades.size < 3) throw new Error('Thiếu dữ liệu nền của seed.ts (hộ, thửa, hạng lá, lô A3): chạy `npm run seed` trước')
  const need = (code: string) => parcelByCode.get(code)!
  const household = (code: string) => need(code).household

  // 1. Today's prices, one per grade.
  const today = dayAgo(0)
  for (const { grade, vnd } of PRICES) {
    const row = grades.get(grade)!
    await prisma.dailyLeafPrice.upsert({
      where: { grade_id_price_date: { grade_id: row.id, price_date: dateOnly(today) } },
      update: {},
      create: { htx_profile_id: htx.id, grade_id: row.id, price_date: dateOnly(today), price_vnd_per_kg: vnd, published_by_id: OFFICER_TC },
    })
  }
  say(`Giá lá tươi hôm nay (${today}): ${PRICES.map((p) => `${p.vnd}`).join(' / ')} đ/kg`)

  // 2. Fresh-leaf tickets, found by (officer, client_id), so a later run never adds a second set.
  let made = 0
  // A3's previous round is the closed one; its current round is the open one.
  const cycleOf = (code: string, round: 'open' | 'closed') =>
    need(code).crop_cycles.filter((c) => (round === 'closed' ? c.harvested_at !== null : c.harvested_at === null)).sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null
  const upsertTicket = async (t: TicketSeed) => {
    const clientId = `demo-${t.key}`
    if (await prisma.freshLeafTicket.findFirst({ where: { created_by_id: OFFICER_TC, client_id: clientId }, select: { id: true } })) return null
    const grade = grades.get(t.grade)!
    const price = t.price ?? PRICES.find((p) => p.grade === t.grade)!.vnd
    const { netKg, amountVnd } = computeTicket({ grossKg: t.gross, deductionPct: t.deduction, priceVndPerKg: price })
    const at = weighedAt(t.daysAgo, t.minute)
    // The ticket number follows the production format {HTX}-PC-{YYYYMMDD}-{NNN}; 9xx keeps clear of the live counter.
    const prefix = `${HTX_CODE}-PC-${vnDayOf(at).replace(/-/g, '')}-`
    const taken = await prisma.freshLeafTicket.count({ where: { ticket_no: { startsWith: prefix, endsWith: '' } } })
    return prisma.freshLeafTicket.create({
      data: {
        htx_profile_id: htx.id,
        ticket_no: `${prefix}${String(900 + taken + 1).padStart(3, '0')}`,
        household_id: need(t.parcel).household_id,
        parcel_id: need(t.parcel).id,
        cycle_id: cycleOf(t.parcel, t.round)?.id ?? null,
        grade_id: grade.id,
        weighed_at: at,
        gross_kg: t.gross.toFixed(1),
        deduction_pct: t.deduction.toFixed(1),
        net_kg: netKg.toFixed(1),
        price_vnd_per_kg: price,
        amount_vnd: amountVnd,
        created_by_id: OFFICER_TC,
        client_id: clientId,
      },
    })
  }
  for (const t of RECENT) if (await upsertTicket(t)) made += 1
  say(made > 0 ? `Phiếu cân: tạo ${made} phiếu mới (10 ngày gần nhất, TC-A1, TC-A2, TC-B1, TC-B2)` : 'Phiếu cân: đã có, giữ nguyên')
  const b2Kg = Number(
    (await prisma.freshLeafTicket.aggregate({ _sum: { net_kg: true }, where: { parcel_id: need('TC-B2').id, status: 'VALID', cycle_id: cycleOf('TC-B2', 'open')?.id } }))._sum.net_kg ?? 0,
  )
  say(`A13 R2: TC-B2 (0,27 ha) đã cân ${b2Kg} kg trong lứa mở, định mức 656 kg`)

  // 3. The finished processing batch behind the lot, and the lot's link to it.
  let batch = await prisma.processingBatch.findFirst({ where: { htx_profile_id: htx.id, notes: BATCH_NOTE }, include: { outputs: true, tickets: true } })
  if (!batch) {
    const tickets: { id: string; net: number; weighed_at: Date }[] = []
    for (const t of BATCH_TICKETS) {
      const row = (await upsertTicket(t)) ?? (await prisma.freshLeafTicket.findFirstOrThrow({ where: { created_by_id: OFFICER_TC, client_id: `demo-${t.key}` } }))
      tickets.push({ id: row.id, net: Number(row.net_kg), weighed_at: row.weighed_at })
    }
    const fresh = tickets.reduce((sum, t) => sum + t.net, 0)
    const dry = 30
    const processedOn = vnDayOf(lot.harvest_date)
    const count = await prisma.processingBatch.count({ where: { htx_profile_id: htx.id, processed_on: dateOnly(processedOn) } })
    batch = await prisma.processingBatch.create({
      data: {
        htx_profile_id: htx.id,
        batch_code: `${HTX_CODE}-MS-${processedOn.replace(/-/g, '')}-${String(90 + count)}`,
        processed_on: dateOnly(processedOn),
        status: 'FINISHED',
        master_name: 'Nghệ nhân Nguyễn Văn Tuyên',
        shift: 'Ca sáng',
        notes: BATCH_NOTE,
        fresh_kg: fresh.toFixed(1),
        dry_kg: dry.toFixed(1),
        recovery_ratio: (fresh / dry).toFixed(2),
        out_of_band: false,
        created_by_id: OFFICER_TC,
        finished_by_id: OFFICER_TC,
        finished_at: new Date(lot.harvest_date.getTime() + 8 * 60 * 60 * 1000),
        tickets: { connect: tickets.map((t) => ({ id: t.id })) },
        outputs: { create: [{ grade: 'DINH', kg: '24.0' }, { grade: 'TOM_NON', kg: '6.0' }] },
      },
      include: { outputs: true, tickets: true },
    })
    say(`Mẻ sao ${batch.batch_code}: ${fresh.toFixed(1)} kg tươi ra ${dry.toFixed(1)} kg khô, tỉ lệ ${batch.recovery_ratio} (trong dải 4,5 đến 5,0)`)
  } else {
    say(`Mẻ sao ${batch.batch_code}: đã có, giữ nguyên`)
  }

  // 4. Lot TC-CHE-A3-001: batch source, certificate, and a snapshot that carries all four layers.
  const dinh = batch.outputs.find((o) => o.grade === 'DINH')!
  await prisma.lotBatchSource.upsert({
    where: { lot_id_output_id: { lot_id: lot.id, output_id: dinh.id } },
    update: {},
    create: { lot_id: lot.id, output_id: dinh.id, kg: '24.0' },
  })
  let certificate = await prisma.htxCertificate.findFirst({ where: { htx_profile_id: htx.id, number: CERTIFICATE_NUMBER } })
  if (!certificate) {
    const view = await new CreateCertificate(new PrismaCertificateRepository(), storage).execute(
      { userId: OFFICER_TC, htxProfileId: htx.id, htxCode: HTX_CODE },
      {
        kind: 'VIETGAP',
        number: CERTIFICATE_NUMBER,
        issuer: 'Tổ chức chứng nhận DEMO',
        issued_on: dayAgo(120),
        expires_on: dayAgo(-245),
        scope_note: 'Mẫu chứng nhận dùng cho buổi demo, không phải chứng nhận thật',
        file: { name: 'vietgap-demo.pdf', mime: 'application/pdf', bytes: DEMO_PDF },
      },
    )
    certificate = await prisma.htxCertificate.findUniqueOrThrow({ where: { id: view.id } })
    say(`Chứng nhận ${CERTIFICATE_NUMBER}: đã tải tệp PDF lên ${certificate.file_key}`)
  } else {
    say(`Chứng nhận ${CERTIFICATE_NUMBER}: đã có, giữ nguyên`)
  }
  await prisma.lotCertificate.upsert({
    where: { lot_id_certificate_id: { lot_id: lot.id, certificate_id: certificate.id } },
    update: {},
    create: { lot_id: lot.id, certificate_id: certificate.id },
  })

  const batchTickets = await prisma.freshLeafTicket.findMany({ where: { processing_batch_id: batch.id }, include: { parcel: true, cycle: true }, orderBy: [{ weighed_at: 'asc' }, { id: 'asc' }] })
  const a3Spray = await prisma.journalEntry.findMany({ where: { parcel_id: need('TC-A3').id, activity_type: 'SPRAYING', cycle_id: batchTickets[0]?.cycle_id ?? undefined }, include: { activities: true } })
  const safeOn = a3Spray.flatMap((e) => e.activities.flatMap((a) => (a.safe_harvest_date ? [vnDayOf(a.safe_harvest_date)] : []))).sort().pop() ?? null
  const batches: LotTraceBatch[] = [{
    batch_code: batch.batch_code,
    processed_on: vnDayOf(batch.processed_on),
    master_name: batch.master_name,
    fresh_kg: Number(batch.fresh_kg),
    dry_kg: Number(batch.dry_kg),
    recovery_ratio: Number(batch.recovery_ratio),
    out_of_band: batch.out_of_band,
    grade: 'DINH',
    kg_in_lot: 24,
    ticket_count: batchTickets.length,
    parcel_codes: ['TC-A3'],
  }]
  const intake: LotTraceIntake[] = batchTickets.map((t) => ({ parcel_code: t.parcel.parcel_code, cycle_label: t.cycle?.season ?? null, weighed_on: vnDayOf(t.weighed_at), net_kg: Number(t.net_kg), safe_on: safeOn }))
  const snapshot = { ...(lot.public_page_data as Record<string, unknown>), dry_grade: 'DINH', batches, intake }
  await prisma.lot.update({ where: { id: lot.id }, data: { dry_grade: 'DINH', public_page_data: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue } })
  say(`Lô ${LOT_CODE}: đủ bốn lớp (vùng trồng, cách ly, mẻ sao ${batch.batch_code}, chứng nhận ${CERTIFICATE_NUMBER})`)

  // 5. Bank fields (demo values, a visible DEMO name) so the slip shows a VietQR for the farmer account.
  await prisma.household.update({
    where: { id: household('TC-A1').id },
    data: { bank_bin: '970436', bank_account: '0011002233445', bank_account_name: 'DEMO HOANG VAN TAM' },
  })

  // 6. Input advances: a fertiliser one for Tâm (settled below), and a pesticide one for Hạnh with no spraying (A13 R1).
  const items = [
    { name: 'Phân NPK 5-10-3 (demo)', unit: 'bao', price: 450000, kind: 'FERTILIZER' as const },
    { name: 'Thuốc BVTV sinh học (demo)', unit: 'chai', price: 85000, kind: 'PESTICIDE' as const },
  ]
  const itemRows = []
  for (const it of items) {
    itemRows.push(await prisma.inputItem.upsert({
      where: { htx_profile_id_name: { htx_profile_id: htx.id, name: it.name } },
      update: {},
      create: { htx_profile_id: htx.id, name: it.name, unit: it.unit, unit_price_vnd: it.price, kind: it.kind },
    }))
  }
  const advances = [
    { clientId: 'demo-adv-npk', item: itemRows[0], household: household('TC-A1'), quantity: 2, daysAgo: 6 },
    { clientId: 'demo-adv-pesticide', item: itemRows[1], household: household('TC-A2'), quantity: 3, daysAgo: 15 },
  ]
  let advanceMade = 0
  for (const a of advances) {
    if (await prisma.inputAdvance.findFirst({ where: { created_by_id: DEMO_ACTOR, client_id: a.clientId }, select: { id: true } })) continue
    const day = dayAgo(a.daysAgo)
    const taken = await prisma.inputAdvance.count({ where: { advance_no: { startsWith: `${HTX_CODE}-VT-${day.replace(/-/g, '')}-` } } })
    await prisma.inputAdvance.create({
      data: {
        htx_profile_id: htx.id,
        advance_no: `${HTX_CODE}-VT-${day.replace(/-/g, '')}-${String(900 + taken + 1).padStart(3, '0')}`,
        household_id: a.household.id,
        item_id: a.item.id,
        quantity: a.quantity.toFixed(2),
        unit_price_vnd: a.item.unit_price_vnd,
        amount_vnd: BigInt(a.item.unit_price_vnd) * BigInt(a.quantity),
        advanced_on: dateOnly(day),
        created_by_id: DEMO_ACTOR,
        client_id: a.clientId,
      },
    })
    advanceMade += 1
  }
  say(advanceMade > 0 ? `Vật tư ứng: tạo ${advanceMade} khoản (phân NPK cho hộ Tâm, thuốc BVTV cho hộ Hạnh, 15 ngày trước, không có nhật ký phun)` : 'Vật tư ứng: đã có, giữ nguyên')

  // 7. One closed settlement period, through the production use cases. The ledger is append-only: an existing period is left as is.
  const existingPeriod = await prisma.settlementPeriod.findFirst({ where: { htx_profile_id: htx.id }, orderBy: { date_to: 'desc' } })
  if (existingPeriod) {
    say(`Kỳ quyết toán ${existingPeriod.code} (${existingPeriod.status}): đã có, giữ nguyên (sổ cái chỉ ghi thêm, không sửa)`)
  } else {
    const actor: SettlementActor = { userId: DEMO_ACTOR, role: 'manager', htxProfileId: htx.id, htxCode: HTX_CODE, userName: 'Demo seed' }
    const port = new PrismaSettlementRepository()
    const earliest = [...BATCH_TICKETS, ...RECENT].reduce((max, t) => Math.max(max, t.daysAgo), 0)
    const period = await new CreateSettlementPeriodUseCase(port, () => now).execute(actor, { date_from: dayAgo(earliest), date_to: dayAgo(4) })
    const draft = await new GetSettlementUseCase(port).execute(actor, period.id)
    const closed = await new CloseSettlementPeriodUseCase(port, () => now, zaloNotifier()).execute(actor, period.id, {
      household_count: draft.totals.households,
      payable_total_vnd: draft.totals.payable_vnd,
    })
    say(`Kỳ quyết toán ${closed.period.code}: đã chốt ${closed.lines.length} hộ, tổng thực lĩnh ${closed.totals.payable_vnd} đ (hộ Tâm có QR VietQR, phiếu sau ngày ${dayAgo(4)} để mở kỳ mới)`)
  }
  return { lines }
}

async function main() {
  const { lines } = await runDemoSeed({ storage: new MinioDocumentAdapter() })
  for (const line of lines) process.stdout.write(`${line}\n`)
  process.stdout.write('Demo data ready.\n')
}

if (require.main === module) {
  main()
    .catch((e) => {
      process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
