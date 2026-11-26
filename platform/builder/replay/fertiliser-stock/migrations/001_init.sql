-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_gen_fertiliser_stock with its own schema as search_path (dxos install, one transaction).
CREATE TABLE movements (
  id bigserial PRIMARY KEY,
  htx_code text NOT NULL,
  product text NOT NULL CHECK (char_length(product) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  quantity_kg numeric(10, 1) NOT NULL CHECK (quantity_kg > 0),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movements_htx_time ON movements (htx_code, created_at DESC);
