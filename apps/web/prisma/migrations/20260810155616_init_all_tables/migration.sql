/*
  Warnings:

  - You are about to drop the `Bulletin` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DiseaseReport` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Household` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HtxProfile` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JournalActivity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JournalEntry` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LotParcel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MarketData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Parcel` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ParcelCropCycle` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Partner` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WeatherCache` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DiseaseReport" DROP CONSTRAINT "DiseaseReport_household_id_fkey";

-- DropForeignKey
ALTER TABLE "DiseaseReport" DROP CONSTRAINT "DiseaseReport_parcel_id_fkey";

-- DropForeignKey
ALTER TABLE "JournalActivity" DROP CONSTRAINT "JournalActivity_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_parcel_id_fkey";

-- DropForeignKey
ALTER TABLE "LotParcel" DROP CONSTRAINT "LotParcel_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "LotParcel" DROP CONSTRAINT "LotParcel_parcel_id_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_household_id_fkey";

-- DropForeignKey
ALTER TABLE "Parcel" DROP CONSTRAINT "Parcel_household_id_fkey";

-- DropForeignKey
ALTER TABLE "ParcelCropCycle" DROP CONSTRAINT "ParcelCropCycle_parcel_id_fkey";

-- DropForeignKey
ALTER TABLE "WeatherCache" DROP CONSTRAINT "WeatherCache_parcel_id_fkey";

-- DropTable
DROP TABLE "Bulletin";

-- DropTable
DROP TABLE "ChatHistory";

-- DropTable
DROP TABLE "DiseaseReport";

-- DropTable
DROP TABLE "Household";

-- DropTable
DROP TABLE "HtxProfile";

-- DropTable
DROP TABLE "JournalActivity";

-- DropTable
DROP TABLE "JournalEntry";

-- DropTable
DROP TABLE "LotParcel";

-- DropTable
DROP TABLE "MarketData";

-- DropTable
DROP TABLE "Notification";

-- DropTable
DROP TABLE "Parcel";

-- DropTable
DROP TABLE "ParcelCropCycle";

-- DropTable
DROP TABLE "Partner";

-- DropTable
DROP TABLE "WeatherCache";

-- CreateTable
CREATE TABLE "htx_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "crop_types" TEXT[],
    "season_label" TEXT,
    "htx_code" TEXT NOT NULL,
    "total_area_ha" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "htx_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "keycloak_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "parcel_code" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "crop_type" TEXT NOT NULL,
    "area_ha" DOUBLE PRECISION NOT NULL,
    "centroid_lat" DOUBLE PRECISION,
    "centroid_lng" DOUBLE PRECISION,
    "polygon_geojson" JSONB,
    "status" "ParcelStatus" NOT NULL DEFAULT 'DRAFT',
    "estimated_yield_per_ha" DOUBLE PRECISION,
    "harvest_approved_by" TEXT,
    "harvest_approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_crop_cycles" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "season" TEXT,
    "sowed_at" TIMESTAMP(3),
    "harvested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_crop_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "activity_type" "ActivityType" NOT NULL,
    "performed_by" TEXT NOT NULL,
    "submitted_by_id" TEXT,
    "submitted_role" "UserRole" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "notes" TEXT,
    "weather_condition" TEXT,
    "weather_temperature" DOUBLE PRECISION,
    "weather_precipitation" DOUBLE PRECISION,
    "weather_humidity" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_activities" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "activity_detail" TEXT NOT NULL,
    "product_name" TEXT,
    "dosage" TEXT,
    "withdrawal_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_parcels" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,

    CONSTRAINT "lot_parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient_id" TEXT,
    "household_id" TEXT,
    "sender_id" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "deep_link_url" TEXT,
    "tts_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disease_reports" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "detected_by_id" TEXT NOT NULL,
    "detection_date" TIMESTAMP(3) NOT NULL,
    "photo_url" TEXT NOT NULL,
    "photo_minio_key" TEXT NOT NULL,
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,
    "ai_disease_name" TEXT NOT NULL,
    "ai_confidence" DOUBLE PRECISION NOT NULL,
    "confirmed_diagnosis" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "treatment_notes" TEXT,
    "status" "DiseaseReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disease_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_data" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletins" (
    "id" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "bulletin_vi" TEXT NOT NULL,
    "sources_json" JSONB NOT NULL,
    "model_used" TEXT NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_cache" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "condition" TEXT NOT NULL,
    "temperature_c" DOUBLE PRECISION NOT NULL,
    "precipitation_mm" DOUBLE PRECISION NOT NULL,
    "humidity_pct" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'open-meteo',

    CONSTRAINT "weather_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partner_type" "PartnerType" NOT NULL,
    "contact_phone" TEXT,
    "primary_commodities" TEXT[],
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sources_json" JSONB,
    "chat_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "htx_profiles_htx_code_key" ON "htx_profiles"("htx_code");

-- CreateIndex
CREATE UNIQUE INDEX "households_phone_key" ON "households"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "parcels_parcel_code_key" ON "parcels"("parcel_code");

-- CreateIndex
CREATE UNIQUE INDEX "lot_parcels_lot_id_parcel_id_key" ON "lot_parcels"("lot_id", "parcel_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_is_read_idx" ON "notifications"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "market_data_commodity_fetched_at_idx" ON "market_data"("commodity", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "market_data_source_commodity_metric_period_key" ON "market_data"("source", "commodity", "metric", "period");

-- CreateIndex
CREATE INDEX "bulletins_commodity_is_latest_idx" ON "bulletins"("commodity", "is_latest");

-- CreateIndex
CREATE UNIQUE INDEX "weather_cache_parcel_id_recorded_at_key" ON "weather_cache"("parcel_id", "recorded_at");

-- CreateIndex
CREATE INDEX "chat_history_session_id_created_at_idx" ON "chat_history"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_history_user_id_created_at_idx" ON "chat_history"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_crop_cycles" ADD CONSTRAINT "parcel_crop_cycles_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_activities" ADD CONSTRAINT "journal_activities_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_parcels" ADD CONSTRAINT "lot_parcels_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_parcels" ADD CONSTRAINT "lot_parcels_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disease_reports" ADD CONSTRAINT "disease_reports_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disease_reports" ADD CONSTRAINT "disease_reports_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather_cache" ADD CONSTRAINT "weather_cache_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
