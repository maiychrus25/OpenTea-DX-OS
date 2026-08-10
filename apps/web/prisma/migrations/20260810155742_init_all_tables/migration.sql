/*
  Warnings:

  - The primary key for the `bulletins` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `bulletins` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `market_data` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `market_data` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `weather_cache` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `weather_cache` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "bulletins" DROP CONSTRAINT "bulletins_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "market_data" DROP CONSTRAINT "market_data_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "market_data_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "weather_cache" DROP CONSTRAINT "weather_cache_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "weather_cache_pkey" PRIMARY KEY ("id");
