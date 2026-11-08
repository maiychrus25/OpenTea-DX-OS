<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 OpenTea Developers -->
# ADR 0001: n8n as the Tier-1 workflow engine

- Status: Accepted
- Date: 2026-11-08

## Context

The exam requires a Workflow engine in the platform. The exam's own reference
stack lists n8n. Ten workflows already exist in `workflows/` and are authored
as n8n exports.

## Decision

Use n8n 2.47.2 (pinned in `docker/docker-compose.yml`) as the Tier-1 workflow
engine.

- n8n's internal tables live in a dedicated Postgres schema `n8n`, isolated
  from application data.
- Webhooks are exposed only through the APISIX gateway
  (`/api/workflow/*` to `n8n:5678/webhook/*`), which enforces the Keycloak JWT.
  n8n's own port is not the public entry point.

## License

n8n is distributed under the Sustainable Use License: fair-code, source
available, not OSI-approved.

- n8n runs as a separate network service (its own container).
- No n8n code is imported, linked or bundled into this project.
- The project itself stays MIT.

## Consequences

- Risk: the "OSI license consistency" criterion may be judged against a
  non-OSI component.
- Mitigations: the version is pinned; n8n is declared in the third-party
  licenses list; it is a replaceable, separate service communicating only over
  HTTP and Postgres.
- n8n databases cannot be downgraded, so version bumps are one-way. Upgrade
  deliberately and back up the `n8n` schema first.

## Exit path

Replace n8n with Kestra (Apache-2.0), where flows are YAML:

1. Add a Kestra service and point the gateway route `/api/workflow/*` at it.
2. Port each of the 10 workflows in `workflows/` to a Kestra flow (webhook
   trigger, HTTP and database tasks map directly).
3. Run both engines in parallel, compare outputs, then cut over.
4. Drop the `n8n` schema and container, and remove n8n from the third-party
   licenses list.
