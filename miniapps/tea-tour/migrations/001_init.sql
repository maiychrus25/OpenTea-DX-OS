-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_tea_tour with search_path app_tea_tour (dxos install, one transaction).
CREATE TABLE tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  starts_at timestamptz NOT NULL,
  meeting_point text NOT NULL CHECK (char_length(meeting_point) BETWEEN 1 AND 200),
  seats int NOT NULL CHECK (seats BETWEEN 1 AND 50),
  price_vnd int NOT NULL CHECK (price_vnd >= 0),
  description text CHECK (char_length(description) <= 2000),
  guide_user_id text,
  guide_name text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)  -- target of the bookings foreign key below
);
CREATE INDEX tours_htx_starts_at ON tours (htx_code, starts_at);
CREATE INDEX tours_guide ON tours (htx_code, guide_user_id);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  tour_id uuid NOT NULL,
  code text NOT NULL UNIQUE CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  guest_name text NOT NULL CHECK (char_length(guest_name) BETWEEN 1 AND 80),
  phone text NOT NULL CHECK (phone ~ '^0[0-9]{9}$'),
  party_size int NOT NULL CHECK (party_size BETWEEN 1 AND 10),
  note text CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A booking always belongs to a tour of its own HTX.
  FOREIGN KEY (tour_id, htx_code) REFERENCES tours (id, htx_code)
);
CREATE INDEX bookings_tour ON bookings (tour_id);
