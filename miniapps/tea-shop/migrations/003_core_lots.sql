-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_tea_shop with search_path app_tea_shop (dxos install, one transaction).
-- A product may be sold from a core lot: lot_id is the core's lot, pack_net_g the net tea in one pack, in grams.
-- Confirming an order writes it to the core's sales book; core_order_no is the number the core gave it.
ALTER TABLE products
  ADD COLUMN lot_id text CHECK (lot_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  ADD COLUMN pack_net_g int CHECK (pack_net_g BETWEEN 1 AND 100000),
  ADD CONSTRAINT products_lot_pack_together CHECK ((lot_id IS NULL) = (pack_net_g IS NULL));
ALTER TABLE orders ADD COLUMN core_order_no text;
