-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_tea_experience with search_path app_tea_experience (dxos install, one transaction).
-- Every table has htx_code NOT NULL, and every foreign key that crosses tables includes htx_code.

CREATE TABLE htx_intro (
  htx_code text PRIMARY KEY CHECK (htx_code ~ '^[A-Za-z0-9_-]{1,20}$'),
  name text CHECK (char_length(name) <= 200),
  province text CHECK (char_length(province) <= 100),
  district text CHECK (char_length(district) <= 100),
  commune text CHECK (char_length(commune) <= 100),
  primary_crop text CHECK (char_length(primary_crop) <= 100),
  total_area_ha numeric(10,2) CHECK (total_area_ha IS NULL OR total_area_ha >= 0),
  member_count int CHECK (member_count IS NULL OR member_count >= 0),
  certification text CHECK (char_length(certification) <= 50),
  intro_text text CHECK (char_length(intro_text) <= 2000),
  synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Copy of the core's parcels (minimal): kept only to pick coordinates for a site. Replaced on every refresh.
CREATE TABLE core_parcels (
  htx_code text NOT NULL,
  parcel_code text NOT NULL CHECK (char_length(parcel_code) BETWEEN 1 AND 50),
  name text CHECK (char_length(name) <= 200),
  centroid_lat numeric(10,7) NOT NULL CHECK (centroid_lat BETWEEN -90 AND 90),
  centroid_lng numeric(10,7) NOT NULL CHECK (centroid_lng BETWEEN -180 AND 180),
  crop text CHECK (char_length(crop) <= 100),
  season text CHECK (char_length(season) <= 50),
  PRIMARY KEY (htx_code, parcel_code)
);

CREATE TABLE core_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (char_length(actor) <= 80),
  parcels int NOT NULL DEFAULT 0 CHECK (parcels >= 0),
  crops int NOT NULL DEFAULT 0 CHECK (crops >= 0),
  skipped int NOT NULL DEFAULT 0 CHECK (skipped >= 0),
  result text NOT NULL CHECK (result IN ('OK', 'ERROR')),
  detail text CHECK (char_length(detail) <= 200)
);
CREATE INDEX core_sync_log_htx ON core_sync_log (htx_code, synced_at DESC);

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (char_length(description) <= 500),
  latitude numeric(10,7) CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(10,7) CHECK (longitude BETWEEN -180 AND 180),
  -- A reference text only (no foreign key): a refresh replaces core_parcels.
  parcel_code text CHECK (char_length(parcel_code) <= 50),
  is_public boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  UNIQUE (id, htx_code)  -- target of the experience_sites foreign key
);
CREATE INDEX sites_htx_order ON sites (htx_code, sort_order, name);

CREATE TABLE experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (char_length(description) <= 1000),
  duration_min int NOT NULL CHECK (duration_min BETWEEN 15 AND 1440),
  price_vnd int NOT NULL CHECK (price_vnd BETWEEN 0 AND 1000000000),
  months int[] NOT NULL DEFAULT '{}' CHECK (months <@ ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::int[] AND cardinality(months) <= 12),
  is_visible boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 999),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)  -- target of the experience_sites foreign key
);
CREATE INDEX experiences_htx_order ON experiences (htx_code, sort_order, name);

CREATE TABLE experience_sites (
  htx_code text NOT NULL,
  experience_id uuid NOT NULL,
  site_id uuid NOT NULL,
  PRIMARY KEY (experience_id, site_id),
  FOREIGN KEY (experience_id, htx_code) REFERENCES experiences (id, htx_code) ON DELETE CASCADE,
  FOREIGN KEY (site_id, htx_code) REFERENCES sites (id, htx_code) ON DELETE CASCADE
);
CREATE INDEX experience_sites_site ON experience_sites (site_id);

CREATE TABLE season_notes (
  htx_code text NOT NULL,
  month_no smallint NOT NULL CHECK (month_no BETWEEN 1 AND 12),
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (htx_code, month_no)
);
