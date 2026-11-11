-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Not IF NOT EXISTS: a second run of this file would fail, which proves migrations run once.
CREATE TABLE tours (
  id       serial PRIMARY KEY,
  htx_code text   NOT NULL,
  name     text   NOT NULL
);
