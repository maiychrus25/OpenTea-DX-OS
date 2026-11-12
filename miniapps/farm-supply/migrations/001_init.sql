-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_farm_supply with search_path app_farm_supply (dxos install, one transaction).
CREATE TABLE rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)  -- target of the foreign keys below
);
CREATE INDEX rounds_htx_deadline ON rounds (htx_code, deadline DESC);

CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  round_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  unit text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 20),
  price_vnd int NOT NULL CHECK (price_vnd >= 0),
  UNIQUE (id, htx_code),
  FOREIGN KEY (round_id, htx_code) REFERENCES rounds (id, htx_code)
);
CREATE INDEX items_round ON items (round_id);

CREATE TABLE requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  round_id uuid NOT NULL,
  item_id uuid NOT NULL,
  household_id text NOT NULL,
  household_name text NOT NULL,
  quantity numeric(8,1) NOT NULL CHECK (quantity > 0 AND quantity <= 10000),
  UNIQUE (item_id, household_id),
  -- A request always belongs to an item of its own HTX.
  FOREIGN KEY (item_id, htx_code) REFERENCES items (id, htx_code)
);
CREATE INDEX requests_round_household ON requests (round_id, household_id);

CREATE TABLE settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  round_id uuid NOT NULL,
  household_id text NOT NULL,
  delivered_at timestamptz,
  paid_at timestamptz,
  UNIQUE (round_id, household_id),
  FOREIGN KEY (round_id, htx_code) REFERENCES rounds (id, htx_code)
);
