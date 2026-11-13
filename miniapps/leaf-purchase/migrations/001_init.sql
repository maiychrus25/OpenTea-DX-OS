-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_leaf_purchase with search_path app_leaf_purchase (dxos install, one transaction).
CREATE TABLE grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  price_vnd int NOT NULL CHECK (price_vnd >= 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (htx_code, name),
  UNIQUE (id, htx_code)  -- target of the tickets foreign key below
);

CREATE TABLE periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  CHECK (date_from <= date_to),
  UNIQUE (id, htx_code)
);
CREATE INDEX periods_htx_dates ON periods (htx_code, date_from, date_to);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  household_id text NOT NULL,
  household_name text NOT NULL,
  weighed_on date NOT NULL,
  grade_id uuid NOT NULL,
  grade_name text NOT NULL,
  kg numeric(7,1) NOT NULL CHECK (kg > 0 AND kg <= 5000),
  price_vnd int NOT NULL CHECK (price_vnd >= 0),  -- copied from the grade when the ticket is written
  amount_vnd bigint NOT NULL,
  voided boolean NOT NULL DEFAULT false,
  period_id uuid,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A ticket always uses a grade and a period of its own HTX.
  FOREIGN KEY (grade_id, htx_code) REFERENCES grades (id, htx_code),
  FOREIGN KEY (period_id, htx_code) REFERENCES periods (id, htx_code)
);
CREATE INDEX tickets_htx_day ON tickets (htx_code, weighed_on);
CREATE INDEX tickets_household ON tickets (htx_code, household_id);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  period_id uuid NOT NULL,
  household_id text NOT NULL,
  household_name text NOT NULL,
  total_kg numeric(9,1) NOT NULL,
  total_vnd bigint NOT NULL,
  paid_at timestamptz,
  paid_by text,
  UNIQUE (period_id, household_id),
  FOREIGN KEY (period_id, htx_code) REFERENCES periods (id, htx_code)
);
