-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
-- n8n keeps its tables out of public so Prisma owns that schema.
CREATE SCHEMA IF NOT EXISTS n8n AUTHORIZATION agrimarket;
