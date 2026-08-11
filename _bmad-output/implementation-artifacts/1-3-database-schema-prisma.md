# Story 1.3: Database Schema & Prisma Setup

Status: ready-for-dev

## Story

As a developer,
I want the complete Prisma schema and initial migration applied,
so that all domain entities are defined once and all subsequent features can use Prisma Client without schema conflicts or re-migrations.

## Dependencies
- **Depends on:** 1.2
- **Blocks:** 1.4

## Acceptance Criteria

1. **Given** the `postgres` Docker service is running **When** `npx prisma migrate deploy` is run **Then** migration succeeds and all 15 tables exist: `HtxProfile`, `Household`, `Parcel`, `ParcelCropCycle`, `JournalEntry`, `JournalActivity`, `Lot`, `Notification`, `DiseaseReport`, `MarketData`, `Bulletin`, `FxRate`, `WeatherCache`, `Partner`, `ChatHistory`
2. **Given** the schema is defined **When** `npx prisma generate` runs **Then** Prisma Client generates with no TypeScript errors and full type coverage for all models
3. **Given** `infrastructure/db/prisma.client.ts` exists **When** it is imported in any server file **Then** it returns a singleton Prisma Client instance (no new instances per request)
4. **Given** the seed script runs (`npx prisma db seed`) **When** it completes **Then** database contains: 1 HtxProfile (id="htx-md2", name="HTX MD2 Mekong Delta", crop_types=["Lúa ST25","Lúa OM5451"]), 3 Households, 5 Parcels (one per status: SOWING, TENDING, HARVEST_APPROVED, HARVESTED, DRAFT), 5 Partners (2 Buyers, 2 Middlemen, 1 Warehouse)
5. **Given** the schema **When** table relationships are checked **Then** all foreign keys are correct: Parcel → Household, JournalEntry → Parcel, Lot → multiple Parcels (many-to-many via LotParcel join table), DiseaseReport → Parcel + Household, Notification → (no required FK — can be system-generated), ChatHistory → userId
6. **Given** TypeScript strict mode **When** any Prisma model field is accessed **Then** nullable fields return `T | null` (not `T | undefined`), required fields return `T`, optional fields return `T | undefined`

## Tasks / Subtasks

- [ ] **T1: Write Prisma Schema** (AC: 1, 2, 5, 6)
  - [ ] Create/update `apps/web/prisma/schema.prisma` with all 15 models + enums
  - [ ] Define enums: `ParcelStatus`, `ActivityType`, `LotStatus`, `NotificationType`, `PartnerType`, `ChatRole`
  - [ ] Define `HtxProfile` model (singleton — only 1 row expected)
  - [ ] Define `Household` model with Parcel relation
  - [ ] Define `Parcel` model with `status: ParcelStatus`, `crop_type`, `area_ha`, `centroid_lat/lng`, `polygon_geojson` (JSON type)
  - [ ] Define `ParcelCropCycle` model (links Parcel to a season; auto-created on new "Sowing" entry)
  - [ ] Define `JournalEntry` model with `JournalActivity` one-to-many
  - [ ] Define `Lot` model + `LotParcel` join table (many-to-many)
  - [ ] Define `Notification` model with optional `deep_link_url` and `tts_text`
  - [ ] Define `DiseaseReport` model with `photo_url`, `ai_disease_name`, `ai_confidence`, `confirmed_diagnosis` (nullable)
  - [ ] Define `MarketData` model with unique constraint on `(source, commodity, metric, period)`
  - [ ] Define `Bulletin` model with `is_latest: Boolean @default(false)` per commodity
  - [ ] Define `FxRate` model with `currency_pair` + `rate` + `fetched_at`
  - [ ] Define `WeatherCache` model with unique constraint on `(parcel_id, recorded_at)`
  - [ ] Define `Partner` model with `lat`, `lng`, `partner_type: PartnerType`
  - [ ] Define `ChatHistory` model with `role: ChatRole` enum (`USER | ASSISTANT`), `sources_json`, `session_id`
  - [ ] Run `npx prisma format` to auto-format schema

- [ ] **T2: Create Migration** (AC: 1)
  - [ ] Run `npx prisma migrate dev --name init-all-tables` inside web container
  - [ ] Verify migration file created at `prisma/migrations/YYYYMMDDHHMMSS_init_all_tables/migration.sql`
  - [ ] Commit the migration file (it is source-controlled)

- [ ] **T3: Prisma Client Singleton** (AC: 3)
  - [ ] Create `src/infrastructure/db/prisma.client.ts`
  - [ ] Pattern: `globalThis.__prisma` singleton to prevent hot-reload from creating multiple connections
  - [ ] Export named `prisma` constant (not default export)

- [ ] **T4: Seed Script** (AC: 4)
  - [ ] Create `prisma/seed.ts` with sample data
  - [ ] Add `"prisma": { "seed": "ts-node prisma/seed.ts" }` to `package.json`
  - [ ] Seed is idempotent: uses `upsert` for HtxProfile (by id), Households (by phone), Partners (by name)
  - [ ] Seed 5 Parcels with different statuses for dev testing of map views

- [ ] **T5: Validate & Commit** (AC: 1, 2)
  - [ ] `npx prisma validate` — exits 0
  - [ ] `npx prisma generate` — exits 0, no TS errors
  - [ ] `npx prisma migrate deploy` on fresh DB — exits 0
  - [ ] `npx prisma db seed` — exits 0, data in DB
  - [ ] Commit: `feat(db): add prisma schema with all domain models and seed data`

## Dev Notes

### Architecture Constraints

```
AD-4: Prisma ORM schema-first at apps/web/prisma/schema.prisma
AD-15: Domain layer CANNOT import { prisma } — only infrastructure/ layer can

RULE: prisma.client.ts exports the singleton
      Domain ports (interfaces) define what data operations look like
      Infrastructure adapters (PrismaXxxRepository) call prisma.*
      Use Cases receive adapters via constructor injection
```

### Complete Prisma Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ────────────────────────────────────────────────────────────────────

enum ParcelStatus {
  SOWING
  TENDING
  HARVEST_APPROVED
  HARVESTED
  DRAFT
}

enum ActivityType {
  SOWING
  FERTILIZING
  SPRAYING
  IRRIGATION
  HARVEST
  OTHER
}

enum LotStatus {
  DRAFT
  READY
  QR_EXPORTED
}

enum NotificationType {
  ANNOUNCEMENT
  HARVEST_APPROVED
  DISEASE_REPORT
  JOURNAL_SUBMITTED
  JOURNAL_APPROVED
  MARKET_ALERT
  SYSTEM
  BROADCAST
}

enum PartnerType {
  BUYER
  MIDDLEMAN
  WAREHOUSE
}

enum ChatRole {
  USER
  ASSISTANT
}

enum UserRole {
  MANAGER
  OFFICER
  FARMER
}

enum DiseaseReportStatus {
  PENDING
  CONFIRMED
}

// ─── HTX Profile (singleton) ─────────────────────────────────────────────────

model HtxProfile {
  id              String   @id @default(cuid())
  name            String
  address         String
  contact_phone   String?
  contact_email   String?
  crop_types      String[] // e.g. ["Lúa ST25", "Xoài Cát Chu"]
  season_label    String?  // e.g. "Vụ Hè Thu 2026"
  htx_code        String   @unique // e.g. "MD2" — used in lot codes + public URL
  total_area_ha   Float    @default(0)
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
}

// ─── Households ───────────────────────────────────────────────────────────────

model Household {
  id              String    @id @default(cuid())
  name            String
  phone           String    @unique
  address         String?
  keycloak_user_id String?  // linked after farmer account created
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  parcels         Parcel[]
  disease_reports DiseaseReport[]
  notifications   Notification[]  @relation("RecipientHousehold")
}

// ─── Farm Zone ────────────────────────────────────────────────────────────────

model Parcel {
  id               String       @id @default(cuid())
  parcel_code      String       @unique // auto-generated e.g. "P-HTX-MD2-001"
  household_id     String
  household        Household    @relation(fields: [household_id], references: [id])
  crop_type        String
  area_ha          Float
  centroid_lat     Float?
  centroid_lng     Float?
  polygon_geojson  Json?        // GeoJSON Polygon feature
  status           ParcelStatus @default(DRAFT)
  estimated_yield_per_ha Float?
  harvest_approved_by    String?  // keycloak user ID of officer
  harvest_approved_at    DateTime?
  created_at       DateTime     @default(now())
  updated_at       DateTime     @updatedAt

  crop_cycles      ParcelCropCycle[]
  journal_entries  JournalEntry[]
  lot_parcels      LotParcel[]
  disease_reports  DiseaseReport[]
  weather_cache    WeatherCache[]
}

model ParcelCropCycle {
  id          String   @id @default(cuid())
  parcel_id   String
  parcel      Parcel   @relation(fields: [parcel_id], references: [id])
  season      String?  // e.g. "Vụ Hè Thu 2026"
  sowed_at    DateTime?
  harvested_at DateTime?
  created_at  DateTime @default(now())
}

// ─── Journal ──────────────────────────────────────────────────────────────────

model JournalEntry {
  id              String       @id @default(cuid())
  parcel_id       String
  parcel          Parcel       @relation(fields: [parcel_id], references: [id])
  entry_date      DateTime
  activity_type   ActivityType
  performed_by    String       // name string (not FK — could be officer or farmer name)
  submitted_by_id String?      // keycloak user ID
  submitted_role  UserRole
  status          String       @default("PENDING_APPROVAL") // PENDING_APPROVAL | APPROVED | DRAFT
  approved_by_id  String?      // keycloak user ID of officer
  approved_at     DateTime?
  notes           String?

  // Weather auto-attach
  weather_condition    String?
  weather_temperature  Float?
  weather_precipitation Float?
  weather_humidity      Float?

  created_at      DateTime     @default(now())
  updated_at      DateTime     @updatedAt

  activities      JournalActivity[]
}

model JournalActivity {
  id               String       @id @default(cuid())
  journal_entry_id String
  journal_entry    JournalEntry @relation(fields: [journal_entry_id], references: [id], onDelete: Cascade)
  activity_detail  String
  product_name     String?      // for Spraying/Fertilizing
  dosage           String?
  withdrawal_days  Int?         // for Spraying
  created_at       DateTime     @default(now())
}

// ─── Lots & QR ───────────────────────────────────────────────────────────────

model Lot {
  id               String    @id @default(cuid())
  lot_code         String    @unique // e.g. "MD2-ST25-20260720-001"
  commodity        String
  quality_grade    String?   // "Grade 1" | "Grade 2" | "Ungraded"
  packaging_date   DateTime?
  total_weight_kg  Float?
  packaging_spec   String?
  status           LotStatus @default(DRAFT)
  qr_image_url     String?   // MinIO URL of generated QR PNG
  certificate_keys String[]  @default([]) // MinIO object keys of attached certificates
  created_by_id    String?   // keycloak officer user ID
  created_at       DateTime  @default(now())
  updated_at       DateTime  @updatedAt

  lot_parcels      LotParcel[]
}

model LotParcel {
  id        String @id @default(cuid())
  lot_id    String
  lot       Lot    @relation(fields: [lot_id], references: [id])
  parcel_id String
  parcel    Parcel @relation(fields: [parcel_id], references: [id])

  @@unique([lot_id, parcel_id])
}

// ─── Notifications ────────────────────────────────────────────────────────────

model Notification {
  id              String           @id @default(cuid())
  type            NotificationType
  title           String
  body            String
  recipient_id    String?          // keycloak user ID (null = system broadcast)
  household_id    String?
  household       Household?       @relation("RecipientHousehold", fields: [household_id], references: [id])
  sender_id       String?          // keycloak user ID of sender
  is_read         Boolean          @default(false)
  deep_link_url   String?
  tts_text        String?          // pre-generated TTS text (summary)
  created_at      DateTime         @default(now())

  @@index([recipient_id, is_read])
  @@index([created_at])
}

// ─── Disease Detection ────────────────────────────────────────────────────────

model DiseaseReport {
  id                  String              @id @default(cuid())
  parcel_id           String
  parcel              Parcel              @relation(fields: [parcel_id], references: [id])
  household_id        String
  household           Household           @relation(fields: [household_id], references: [id])
  detected_by_id      String              // farmer keycloak user ID
  detection_date      DateTime
  photo_url           String              // MinIO pre-signed URL (stored as path key)
  photo_minio_key     String              // MinIO object key for generating new URLs
  gps_lat             Float?
  gps_lng             Float?
  ai_disease_name     String
  ai_confidence       Float
  confirmed_diagnosis String?
  confirmed_by_id     String?             // officer keycloak user ID
  confirmed_at        DateTime?
  treatment_notes     String?             // officer-internal only, never shown to farmer
  status              DiseaseReportStatus @default(PENDING)
  created_at          DateTime            @default(now())
  updated_at          DateTime            @updatedAt
}

// ─── Market & Economic Data (n8n writes, Next.js reads) ──────────────────────

model MarketData {
  id          String   @id @default(cuid())
  source      String   // "World Bank" | "WTO" | "FAOSTAT" | "NASA"
  commodity   String
  metric      String   // "export_price" | "import_tariff" | "production_volume"
  value       Float
  unit        String
  period      String   // "2026-07" or "2026" or "2026-W30"
  fetched_at  DateTime @default(now())

  @@unique([source, commodity, metric, period])
  @@index([commodity, fetched_at])
}

model Bulletin {
  id           String   @id @default(cuid())
  commodity    String
  bulletin_vi  String   @db.Text
  sources_json Json     // [{source, metric, value, date}]
  model_used   String
  is_latest    Boolean  @default(false)
  created_at   DateTime @default(now())

  @@index([commodity, is_latest])
}

model FxRate {
  id            String   @id @default(cuid())
  currency_pair String   // "USD/VND"
  rate          Float
  fetched_at    DateTime @default(now())

  @@index([currency_pair, fetched_at])
}

model WeatherCache {
  id              String   @id @default(cuid())
  parcel_id       String
  parcel          Parcel   @relation(fields: [parcel_id], references: [id])
  recorded_at     DateTime // hour-truncated timestamp
  condition       String
  temperature_c   Float
  precipitation_mm Float
  humidity_pct    Float
  source          String   @default("open-meteo")

  @@unique([parcel_id, recorded_at])
}

// ─── Partner Map ──────────────────────────────────────────────────────────────

model Partner {
  id              String      @id @default(cuid())
  name            String
  partner_type    PartnerType
  contact_phone   String?
  primary_commodities String[]
  lat             Float
  lng             Float
  address         String?
  created_at      DateTime    @default(now())
  updated_at      DateTime    @updatedAt
}

// ─── Chat History ─────────────────────────────────────────────────────────────

model ChatHistory {
  id           String   @id @default(cuid())
  session_id   String
  user_id      String   // keycloak user ID
  role         ChatRole
  content      String   @db.Text
  sources_json Json?    // [{source, date, url}]
  chat_type    String   // "market" | "technical"
  created_at   DateTime @default(now())

  @@index([session_id, created_at])
  @@index([user_id, created_at])
}
```

### Prisma Client Singleton Pattern

```typescript
// src/infrastructure/db/prisma.client.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

### Seed Data Pattern

```typescript
// prisma/seed.ts
import { PrismaClient, ParcelStatus, PartnerType } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Upsert HtxProfile
  await prisma.htxProfile.upsert({
    where: { id: 'htx-md2' },
    update: {},
    create: {
      id: 'htx-md2',
      name: 'HTX MD2 Mekong Delta',
      htx_code: 'MD2',
      address: 'Xã Long Hòa, Huyện Châu Thành, Tỉnh Tiền Giang',
      crop_types: ['Lúa ST25', 'Lúa OM5451'],
      season_label: 'Vụ Hè Thu 2026',
      contact_phone: '02733 123 456',
    },
  })
  // ... Households, Parcels, Partners
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

### Previous Story Intelligence

- Story 1.1 created `apps/web/` Next.js project — `prisma/` directory may not yet exist; create it
- Story 1.1 created `package.json` — add `"@prisma/client"`, `"prisma"` as dev dependency if not present
- Story 1.2 created `src/infrastructure/` directory structure (stub) — `prisma.client.ts` goes in `src/infrastructure/db/`

### IMPORTANT: n8n Tables Are Write-Only for Next.js

```
Tables n8n WRITES, Next.js READS (never writes):
  market_data, weather_cache, bulletins, fx_rates

Tables Next.js WRITES, n8n NEVER touches:
  htx_profile, household, parcel, parcel_crop_cycle,
  journal_entry, journal_activity, lot, lot_parcel,
  disease_report, partner, chat_history, notification
```

This split is architectural — NEVER add n8n logic to Next.js routes for these tables.

### References

- [Source: docs/database-schema.md] — Full schema specification
- [Source: ARCHITECTURE-SPINE.md#AD-4] — Prisma ORM requirement
- [Source: ARCHITECTURE-SPINE.md#AD-9] — n8n sole-writer rule for market data
- [Source: ARCHITECTURE-SPINE.md#AD-15] — Domain layer isolation from Prisma

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None yet_

### Completion Notes List

_To be filled after implementation_

### File List

**Files to CREATE:**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/seed.ts`
- `apps/web/prisma/migrations/[timestamp]_init_all_tables/migration.sql` (auto-generated by Prisma)
- `apps/web/src/infrastructure/db/prisma.client.ts`

**Files to UPDATE:**
- `apps/web/package.json` — add prisma, @prisma/client, ts-node devDependencies + seed script
