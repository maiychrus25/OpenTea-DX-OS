-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_tea_shop with search_path app_tea_shop (dxos install, one transaction).
-- A promotion is a percent off one product from starts_on to ends_on, both days included (Vietnam time).
-- ended_at is set when a manager ends it early; the row stays as history.
CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  product_id uuid NOT NULL,
  discount_pct int NOT NULL CHECK (discount_pct BETWEEN 5 AND 30),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  ended_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  -- A promotion always belongs to a product of its own HTX.
  FOREIGN KEY (product_id, htx_code) REFERENCES products (id, htx_code)
);
CREATE INDEX promotions_product ON promotions (htx_code, product_id, ends_on);
