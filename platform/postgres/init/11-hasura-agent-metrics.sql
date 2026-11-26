-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- M8: Hasura reads the AI metrics tab of htx-dashboard (/ai) through the owner role it connects as. The manager role's
-- column and cooperative filter live in platform/hasura/metadata; these grants only let the connection read the tables.
-- Idempotent: GRANT on an existing privilege is a no-op. Runs after 08-agent.sql, which creates platform.improvements.
GRANT SELECT ON platform.agent_proposals, platform.agent_runs, platform.improvements TO agrimarket;
