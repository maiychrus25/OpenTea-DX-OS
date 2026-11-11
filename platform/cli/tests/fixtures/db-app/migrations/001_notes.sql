-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
CREATE TABLE notes (
  id       serial PRIMARY KEY,
  htx_code text   NOT NULL,
  body     text   NOT NULL
);
