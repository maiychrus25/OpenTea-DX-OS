-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('SOWING', 'TENDING', 'HARVEST_APPROVED', 'HARVESTED', 'DRAFT');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('SOWING', 'FERTILIZING', 'SPRAYING', 'IRRIGATION', 'HARVEST', 'OTHER');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('DRAFT', 'READY', 'QR_EXPORTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT', 'HARVEST_APPROVED', 'DISEASE_REPORT', 'JOURNAL_SUBMITTED', 'JOURNAL_APPROVED', 'MARKET_ALERT', 'SYSTEM', 'BROADCAST');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('BUYER', 'MIDDLEMAN', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MANAGER', 'OFFICER', 'FARMER');

-- CreateEnum
CREATE TYPE "DiseaseReportStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "HtxProfile" (
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

    CONSTRAINT "HtxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "keycloak_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcel" (
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

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelCropCycle" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "season" TEXT,
    "sowed_at" TIMESTAMP(3),
    "harvested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParcelCropCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
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

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalActivity" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "activity_detail" TEXT NOT NULL,
    "product_name" TEXT,
    "dosage" TEXT,
    "withdrawal_days" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "lot_code" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "quality_grade" TEXT,
    "packaging_date" TIMESTAMP(3),
    "total_weight_kg" DOUBLE PRECISION,
    "packaging_spec" TEXT,
    "status" "LotStatus" NOT NULL DEFAULT 'DRAFT',
    "qr_image_url" TEXT,
    "certificate_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotParcel" (
    "id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,

    CONSTRAINT "LotParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
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

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiseaseReport" (
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

    CONSTRAINT "DiseaseReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketData" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bulletin" (
    "id" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "bulletin_vi" TEXT NOT NULL,
    "sources_json" JSONB NOT NULL,
    "model_used" TEXT NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bulletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rates" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeatherCache" (
    "id" TEXT NOT NULL,
    "parcel_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "condition" TEXT NOT NULL,
    "temperature_c" DOUBLE PRECISION NOT NULL,
    "precipitation_mm" DOUBLE PRECISION NOT NULL,
    "humidity_pct" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'open-meteo',

    CONSTRAINT "WeatherCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
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

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatHistory" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sources_json" JSONB,
    "chat_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HtxProfile_htx_code_key" ON "HtxProfile"("htx_code");

-- CreateIndex
CREATE UNIQUE INDEX "Household_phone_key" ON "Household"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_parcel_code_key" ON "Parcel"("parcel_code");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lot_code_key" ON "Lot"("lot_code");

-- CreateIndex
CREATE UNIQUE INDEX "LotParcel_lot_id_parcel_id_key" ON "LotParcel"("lot_id", "parcel_id");

-- CreateIndex
CREATE INDEX "Notification_recipient_id_is_read_idx" ON "Notification"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "MarketData_commodity_fetched_at_idx" ON "MarketData"("commodity", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "MarketData_source_commodity_metric_period_key" ON "MarketData"("source", "commodity", "metric", "period");

-- CreateIndex
CREATE INDEX "Bulletin_commodity_is_latest_idx" ON "Bulletin"("commodity", "is_latest");

-- CreateIndex
CREATE UNIQUE INDEX "WeatherCache_parcel_id_recorded_at_key" ON "WeatherCache"("parcel_id", "recorded_at");

-- CreateIndex
CREATE INDEX "ChatHistory_session_id_created_at_idx" ON "ChatHistory"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "ChatHistory_user_id_created_at_idx" ON "ChatHistory"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelCropCycle" ADD CONSTRAINT "ParcelCropCycle_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalActivity" ADD CONSTRAINT "JournalActivity_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotParcel" ADD CONSTRAINT "LotParcel_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotParcel" ADD CONSTRAINT "LotParcel_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiseaseReport" ADD CONSTRAINT "DiseaseReport_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiseaseReport" ADD CONSTRAINT "DiseaseReport_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeatherCache" ADD CONSTRAINT "WeatherCache_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
