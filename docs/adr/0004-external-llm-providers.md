<!-- SPDX-License-Identifier: MIT -->
<!-- SPDX-FileCopyrightText: 2026 OpenTea Developers -->
# ADR 0004: Optional external LLM providers with local-first fallback

- Status: Proposed
- Date: 2026-11-24

## Context

OpenTea DX-OS aims to remain deployable on open-source infrastructure with
zero paid service dependencies, using Ollama inside `agrimarket-net` as the
default model runtime. However, the currently pinned `qwen2.5:0.5b` model is
insufficient for structured action-proposal reasoning across cooperative data,
and cooperatives that wish to trade external API cost for higher accuracy
requested optional support for Anthropic (Claude) and OpenAI (Codex/GPT)
models (decision D3, spec `docs/specs/2026-11-23-agentic-layer-design.md` §8).

At the same time, cooperative records contain farmer PII, and unbounded API
calls could incur unexpected cost or break offline resilience.

## Decision

We adopt a unified provider abstraction inside `dxos-agent` with Ollama as
the mandatory local baseline and external providers as strictly optional,
policy-governed adapters:

- **Local-first default (`ollama`):**
  - Every agent defaults to the in-house `ollama` provider routed through a
    dedicated APISIX gateway path separate from the web chatbot's rate-limited
    route.
  - Cutting all external network access or omitting all paid API keys must
    leave the platform buildable, testable, and operational (with deterministic
    `replay` adapter support for CI and demo runs).
- **Optional external adapters (`anthropic`, `openai`):**
  - Enabled per cooperative and per agent by a manager. The adapters call the
    provider's HTTPS JSON API with the Python standard library (`urllib`) instead
    of an SDK, so the agent gains no third-party package (see Consequences).
  - Coding CLIs (`claude-code`, `codex-cli`) are restricted solely to the
    isolated `dxos-builder` zone in milestone M13.
- **Installation-wide keys and per-cooperative budgets (D13):**
  - Provider API keys live only in server environment variables or Docker
    secrets managed by the operator; they are never stored in the database,
    never committed to git, and never echoed in the UI.
  - Each cooperative has a monthly token/cost budget; reaching 80% triggers a
    Telegram warning, and reaching 100% automatically falls back to `ollama`
    until the next month.
- **Data minimisation and outbound audit (§8.3):**
  - Outbound requests exclude personal columns (already blocked by the Hasura
    `agent` role), never send photos, and replace parcel/household names with
    opaque codes.
  - When external providers are enabled for conversational chat (`assistant`),
    phone numbers and ID numbers are masked before transmission, and users
    are notified upon linking Telegram.
  - Before any external call, the agent replaces Vietnamese phone numbers (`0` or
    `+84` followed by 9 to 10 digits, with spaces or dots), e-mail addresses and
    9- or 12-digit identity numbers with `[đã ẩn]`. Ollama calls are not redacted:
    the data stays on the server.
  - Every external LLM call logs an entry in `audit.events` with provider,
    model, agent, and record count (without logging prompt content).
- **Fallback chain:**
  - Configured provider → `ollama` → deterministic rule-based proposal (if
    supported by the agent) → skip round with health reporting.

## Alternatives considered

- **Requiring an external paid API key for the agentic layer:** rejected.
  Violates self-hosted open-source deployability and fails when outbound
  connectivity is unavailable.
- **Per-cooperative API keys uploaded via the web UI and stored in Postgres:**
  rejected (decision D13). Storing third-party secrets in application tables
  expands blast radius and complicates rotation compared to operator-managed
  environment secrets with per-cooperative budget caps.
- **Allowing `apps/web` to call external providers directly alongside
  `dxos-agent`:** rejected. The existing chatbot Groq fallback will be
  migrated onto the shared provider and data-minisation layer so outbound
  policies and budgets apply uniformly.

## Consequences

- `docs/rules-and-limits.md` §1.2 is amended from banning all paid API keys
  to requiring zero mandatory paid dependencies while permitting opt-in,
  per-cooperative paid providers.
- Any local Ollama model upgrade beyond `qwen2.5:0.5b` must be benchmarked on
  the §15 scenario suite and verified to carry an OSI-approved license before
  updating `DEPENDENCIES.md`.
- CI and reproducible demos use the `replay` provider with no network or GPU
  dependency.
- The provider adapters need no SDK, so `DEPENDENCIES.md` lists no package for
  them.
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` reach only `dxos-agent`. Services that
  load `.env.local` through `env_file` set both to empty, so the keys never enter
  the web, Hasura, n8n, the broker, or the ingest and simulator workers.
- The provider smoke (`platform/tests/smoke-llm.sh`) runs the Anthropic path
  against `llm-test-stub` with a fake key, and checks the redaction on what the
  stub received.
