/*
  Warnings:

  - You are about to drop the `Lot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "lot_parcels" DROP CONSTRAINT "lot_parcels_lot_id_fkey";

-- AlterTable
ALTER TABLE "households" ADD COLUMN     "htx_profile_id" TEXT;

-- DropTable
DROP TABLE "Lot";

-- CreateTable
CREATE TABLE "lots" (
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
    "htx_profile_id" TEXT,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lots_lot_code_key" ON "lots"("lot_code");

-- AddForeignKey
ALTER TABLE "households" ADD CONSTRAINT "households_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_htx_profile_id_fkey" FOREIGN KEY ("htx_profile_id") REFERENCES "htx_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_parcels" ADD CONSTRAINT "lot_parcels_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
