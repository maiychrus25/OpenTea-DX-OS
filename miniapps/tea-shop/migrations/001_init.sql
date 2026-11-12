-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Runs as role app_tea_shop with search_path app_tea_shop (dxos install, one transaction).
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  pack text NOT NULL CHECK (char_length(pack) BETWEEN 1 AND 60),
  price_vnd int NOT NULL CHECK (price_vnd >= 0),
  stock int NOT NULL CHECK (stock >= 0),
  lot_code text CHECK (lot_code ~ '^[A-Za-z0-9-]{1,40}$'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)  -- target of the order_items foreign key below
);
CREATE INDEX products_htx ON products (htx_code, created_at);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  code text NOT NULL UNIQUE CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  customer_name text NOT NULL CHECK (char_length(customer_name) BETWEEN 1 AND 80),
  phone text NOT NULL CHECK (phone ~ '^0[0-9]{9}$'),
  address text NOT NULL CHECK (char_length(address) BETWEEN 1 AND 200),
  note text CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONFIRMED', 'SHIPPING', 'DONE', 'CANCELLED')),
  total_vnd bigint NOT NULL CHECK (total_vnd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, htx_code)  -- target of the order_items foreign key below
);
CREATE INDEX orders_htx_created ON orders (htx_code, created_at DESC);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  -- Copied from the product when the order is placed: later edits never change a past order.
  product_name text NOT NULL,
  pack text NOT NULL,
  price_vnd int NOT NULL CHECK (price_vnd >= 0),
  quantity int NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  -- An item always belongs to an order and a product of its own HTX.
  FOREIGN KEY (order_id, htx_code) REFERENCES orders (id, htx_code),
  FOREIGN KEY (product_id, htx_code) REFERENCES products (id, htx_code)
);
CREATE INDEX order_items_order ON order_items (order_id);
