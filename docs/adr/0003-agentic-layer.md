<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 OpenTea Developers -->
# ADR 0003: Agentic layer with human approval and trust-zone separation

- Status: Proposed
- Date: 2026-11-24

## Context

OpenTea DX-OS already collects operational signals across cooperatives
(pending journal entries, telemetry via `telemetry.sensor_daily`, weather
cache, disease reports, harvest cycles, and bulletins) and records business
actions in an append-only hash-chained audit log (`audit.events`). Cooperative
managers and technical officers still have to poll dashboards and act
manually, and farmers or officers cannot complete workflows from Telegram.

The owner requested an agentic AI layer (tracked in issue #55 and specified
in `docs/specs/2026-11-23-agentic-layer-design.md`, open in PR #54) that
observes cooperative data, drafts actionable proposals, delivers daily
campaigns and digests, and supports Telegram as a first-class channel, while
preserving tenant isolation, auditability, and human accountability.

Because LLM calls read untrusted user-authored text (such as farmer journal
notes or disease descriptions), the component that calls an LLM is exposed to
prompt injection and cannot sit inside the authoritative web server or hold
direct write credentials.

## Decision

We split the agentic layer across four trust zones with `apps/web` remaining
the sole authority, and gate every action through a typed catalogue:

- **Web (`apps/web`) is the only authority:**
  - Holds the typed action catalogue (TypeScript + Zod schemas, preview,
    staleness check, and execution), stores proposals, receives human
    decisions, executes changes via existing domain use cases under the
    approver's identity, and records everything in `audit.events`.
  - Requires a human approver for every agent proposal in normal mode (D1).
  - Supports an optional manager-enabled autonomous mode (D8) that bypasses
    only the approval step for allowed catalogue kinds after a veto window,
    bounded by five non-overridable hard limits (H1–H5: business validation
    still runs, AI cannot widen its own permissions or limits, AI cannot
    self-approve AI disease predictions, no destructive deletes, full audit
    and Telegram reporting).
- **`dxos-agent` (`platform/agent`) runs agents and builds proposals:**
  - Runs scheduled and event-driven agents separately from web handlers and
    n8n.
  - Reads core data only through Hasura using a dedicated `agent` role
    scoped by `htx_code` with personal columns (`households.name`, `phone`,
    `address`, and equivalents) hidden; farmers and parcels are referenced by
    ID/code and resolved for display by `web`.
  - Proposes only; holds no business write credentials and cannot approve.
  - Evidence payloads are constructed deterministically in code with a
    SHA-256 digest of source rows; `web` recomputes the digest at approval
    time and marks changed proposals `stale`.
- **`dxos-telegram` (`platform/telegram`) is the messaging transport:**
  - Bridges Telegram Bot API updates (long polling) and `web`'s outbox.
  - Does not call LLMs and holds no business logic.
- **`dxos-builder` (`platform/builder`, milestone M13) is the least-trusted
  zone:**
  - Isolated sandbox for AI-assisted mini-app generation; has no access to
    core data or secrets, and outputs must pass static/runtime gates and
    manager approval before installation.
- **Zero-Trust identities and gateway:**
  - One Keycloak client-credentials identity per cooperative
    (`dxos-agent-<htx>`) enforces tenant scoping via `htx_code` claims;
    separate clients for `dxos-telegram`, `dxos-builder`, and `dxos-staff`.
  - Internal `/api/internal/*` endpoints route through APISIX with token and
    client-scope verification at both gateway and `web`.

## Hasura exposure of the agent role

- The `agent` role reads parcel geometry, which the disease agent needs for
  its radius rule, and journal notes, which the journal-review agent (A1)
  needs to read what a farmer wrote.
- It never reads household names, phone numbers or addresses; those columns
  stay hidden from the role.
- External model providers receive these fields only under the data policy
  of spec §8.3, which is delivered in milestone M3.

## Alternatives considered

- **Running agents inside n8n workflows:** rejected. n8n uses a
  fair-code license (ADR 0001), is difficult to unit-test with deterministic
  scenarios, and blurs the credential boundary between data collection and
  LLM execution.
- **Running agent loops inside Next.js API routes:** rejected. Agent turns
  can wait minutes for an LLM and would place prompt-injection-exposed code
  inside the authoritative process that holds session secrets and database
  write access.
- **Allowing LLMs to generate free-form database mutations or SQL:**
  rejected. All mutations must be typed catalogue entries executed by
  existing web use cases so domain invariants (e.g., withdrawal days) and
  audit logging cannot be bypassed.

## Consequences

- `docs/rules-and-limits.md` §1.1 is amended to allow catalogue-constrained
  action proposals (normal mode) and bounded autonomous execution (optional
  autonomous mode) while keeping citation-only rules for chat, bulletins,
  and `/predict`.
- Two new Python platform services (`platform/agent`, `platform/telegram`)
  join `docker/docker-compose.yml` starting in milestone M0 as stdlib-only
  heartbeat skeletons; agent logic, internal APIs, Hasura role, and bot
  wiring follow in milestones M1–M15.
- Errors or downtime in `dxos-agent` or `dxos-telegram` degrade gracefully
  and never block direct operations in `apps/web`.
