-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Installed mini-apps, written by `dxos commit` and read by the web proxy and menu. Idempotent.
CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION agrimarket;

CREATE TABLE IF NOT EXISTS platform.installed_apps (
  id           text        PRIMARY KEY,
  name         text        NOT NULL,
  version      text        NOT NULL,
  menu         jsonb       NOT NULL DEFAULT '[]',
  manifest     jsonb       NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now()
);
