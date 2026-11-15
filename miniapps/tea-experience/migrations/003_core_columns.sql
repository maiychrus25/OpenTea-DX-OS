-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_tea_experience with search_path app_tea_experience (dxos install, one transaction).
-- Aligns the copy of the core with its real columns (apps/web/prisma/schema.prisma). Migration 001 is not edited.
-- Numbered after 002_featured.sql (another change of the same app, is_featured on experiences).

ALTER TABLE htx_intro
  ADD COLUMN address text CHECK (char_length(address) <= 300),          -- the core's address: manager only
  ADD COLUMN locality_public text CHECK (char_length(locality_public) <= 200),  -- typed by the manager; shown to guests
  ADD COLUMN crop_types text CHECK (char_length(crop_types) <= 300),
  ADD COLUMN season_label text CHECK (char_length(season_label) <= 100);

-- Crop names were filled from a column the core does not have; keep the value as the crop list before dropping it.
UPDATE htx_intro SET crop_types = primary_crop WHERE primary_crop IS NOT NULL AND crop_types IS NULL;

-- The core has no province, district, commune or certification. certification stays, typed by the manager.
ALTER TABLE htx_intro
  DROP COLUMN province,
  DROP COLUMN district,
  DROP COLUMN commune,
  DROP COLUMN primary_crop;
COMMENT ON COLUMN htx_intro.certification IS 'Nhập tay: lõi không có chứng nhận';

-- The core has no parcel name: the parcel code is the name shown. planting: a cycle is open (not harvested).
ALTER TABLE core_parcels
  DROP COLUMN name,
  ADD COLUMN planting boolean NOT NULL DEFAULT false;
