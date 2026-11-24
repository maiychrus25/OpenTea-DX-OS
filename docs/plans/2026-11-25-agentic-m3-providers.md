<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M3: external LLM providers — implementation plan

**Goal:** a manager can switch each agent of the cooperative from the local Ollama to Claude (Anthropic) or OpenAI, within a monthly budget and a data policy; with the network to the outside cut, or the budget spent, everything keeps working on Ollama and the hard rules. Milestone M3 of issue #55.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` (Vietnamese, the authority): §8.1–§8.4 (provider layer, keys and cost, data policy, local model), §7.3 (settings tab), §14 (provider failures), §15 tests 8, 9, 35; decisions D3, D13. Milestone row M3 in §17.

**Architecture:** the agent asks the web for its cooperative's settings at the start of each run, picks the provider, sends only redacted data, and reports tokens and estimated cost with the run. The web owns the settings, the budget arithmetic, the consent text and the audit event for every call that leaves the server. Provider calls use plain HTTP from the standard library, like the Ollama provider; no SDK is added.

## Global constraints

- Repository rules apply: `AGENTS.md`, English Conventional Commits, English identifiers, Vietnamese user-facing text with diacritics, SPDX headers on new files, no secrets or `.env*` files committed.
- No new runtime dependency in `platform/agent` (standard library only). Ruling: the spec and ADR 0004 say "official SDK"; plain HTTP keeps the agent dependency-free and the two APIs are small JSON calls. Track I updates ADR 0004 with this.
- Ollama stays the default for every agent; external providers are off until a manager turns them on for one agent of one cooperative.
- API keys exist only in the `dxos-agent` container environment (D13); the web never sees them and never stores them.
- Model names come from configuration; no model id is hard-coded except a documented default per provider.

## Review focus

1. A request sent to an external provider never contains a household name, a phone number, an e-mail address, an identity number or a photo, even when a farmer typed one into a note (spec test 9).
2. Outbound network cut, provider 5xx, timeout or 429: the run falls back to Ollama, then to the rules; nothing is lost and no proposal is made from malformed output (spec tests 8, 35).
3. Budget: at 80% of the month's budget the manager is told once; at 100% the agent stops calling external providers for the rest of the month (Vietnam calendar month) and uses Ollama.
4. A manager of cooperative TC cannot change the settings of LB; an officer cannot change settings at all.
5. Switching a provider shows exactly what leaves the server before the manager confirms, and the switch is in the audit chain.

## Contracts

### C1. Settings for the agent

`GET /api/internal/agent/settings` (agent token, cooperative from the token): `{ "data": { "agents": { "<agent name>": { "enabled": bool, "provider": "ollama" | "anthropic" | "openai", "model": string | null, "thresholds": { … } } }, "report_time": "HH:MM", "budget": { "monthly_limit_usd": number | null, "spent_usd": number, "month": "YYYY-MM", "exhausted": bool } } }`. Agents not configured come back with `provider: "ollama"`. The agent caches the answer for one run.

### C2. Usage with the run

`PATCH /api/internal/agent/runs/{id}` gains `provider`, `model`, `tokens_in`, `tokens_out`, `cost_estimate_usd` (number, may be 0), `external_calls` (integer). For a run with `external_calls > 0` the web writes one audit event `agent.external_call` with the provider, model, agent and number of evidence rows, never the content. The month's spend is the sum of `cost_estimate_usd` of the cooperative's runs in the Vietnam calendar month.

### C3. Providers available on this installation

`POST /api/internal/agent/heartbeat` body becomes `{ "version", "providers": ["ollama", "anthropic"?, "openai"?] }`: a provider is listed when its key is set in the agent container. The web keeps it (column `details jsonb` on `platform.service_heartbeats`, added idempotently) and offers only listed providers in the settings tab.

### C4. Provider HTTP calls (agent)

- Anthropic: `POST {ANTHROPIC_API_BASE:-https://api.anthropic.com}/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body `{ model, max_tokens, system, messages }`; the JSON answer is the text of the first content block. Default model `claude-haiku-5-5`, overridable by `DXOS_ANTHROPIC_MODEL` and by the cooperative's `model`.
- OpenAI: `POST {OPENAI_API_BASE:-https://api.openai.com}/v1/chat/completions`, header `Authorization: Bearer`; body `{ model, messages, response_format: { "type": "json_object" } }`. No default model: `DXOS_OPENAI_MODEL` or the cooperative's `model` must be set, otherwise the provider is not offered.
- Both reuse the provider base: the schema is sent in the system message, one repair retry, one retry after 2 s for non-429 errors, 429 sets `next_allowed_at` from `retry-after` (at least 60 s), every failure becomes `ProviderError` and the run falls back to Ollama, then to the rules.
- Prices for the cost estimate: a small table in code per model (input and output price per million tokens) with a comment naming the date and source; unknown models cost 0 and log a warning.

### C5. Data policy before any external call (agent)

A redaction step over every message: Vietnamese phone numbers (`0` or `+84` followed by 9–10 digits, with spaces or dots), e-mail addresses, 9- or 12-digit identity numbers; replaced by `[đã ẩn]`. Farmer notes stay fenced as untrusted data. Only the fields the agent already sends to Ollama are sent; no photos. Ollama calls are not redacted (the data stays on the server).

### C6. Settings tab (web)

In the inbox for managers: one row per agent (A1 journal review, A6 digest) with the provider (only those available, C3), the model (optional), the monthly budget for the cooperative, the month's spend, and the report time for A6. Choosing an external provider opens a confirmation that lists what leaves the server ("Nhật ký chờ duyệt: mã thửa, ngày, hoạt động, thuốc, liều, số ngày cách ly, ghi chú đã che số điện thoại; không có tên, số điện thoại hay ảnh của nông hộ") and that the data goes to Anthropic or OpenAI. Saving writes `platform.agent_settings` (audited). Officers see the tab read-only; farmers do not see it.

### C7. Budget alerts (web)

When a run pushes the month's spend over 80% and over 100% of the limit, queue one health message to managers (Telegram, M2) and show a banner in the inbox; each threshold once per month.

## Tasks

### Track A — agent (`platform/agent/**`)

1. C1 client and per-run settings; A1 and A6 use the provider and model of their agent and A6 the report time from settings (removes the fixed 18:00).
2. C4 providers `anthropic` and `openai` (stdlib), C5 redaction, the price table, `external_calls` counting, C2 fields on run finish, C3 heartbeat providers.
3. Budget: when `budget.exhausted` is true, external providers are skipped for the run.
4. Tests with fake HTTP servers: request shapes, redaction (spec test 9: a note with a phone number and an e-mail never reaches the request body), fallback chain (test 8), 429 (test 35), budget exhausted, unknown model price.

### Track W — web (`apps/web/**`, `platform/postgres/init/09-telegram.sql` only for the `details` column, `docs/api-contract.md`, `docs/database-schema.md`)

1. C1 settings route; C2 run fields, spend per month, audit event `agent.external_call`; C3 heartbeat details.
2. C6 settings tab with tests (manager edits, officer read-only, other cooperative refused, confirmation text, validation of provider against C3).
3. C7 alerts once per threshold per month.

### Track I — infrastructure and docs (`docker/**`, `platform/tests/**`, `docs/adr/0004-external-llm-providers.md`, `docs/rules-and-limits.md`, `README.md`, `.github/workflows/release.yml` notes, `DEPENDENCIES.md`)

1. `dxos-agent` environment: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DXOS_ANTHROPIC_MODEL`, `DXOS_OPENAI_MODEL`, `ANTHROPIC_API_BASE`, `OPENAI_API_BASE` (all optional, empty in `docker/.env.local.example`, never logged).
2. A stub LLM provider for the smoke (stdlib, profile `llm-test`) that answers both APIs and records request bodies.
3. Smoke (`platform/tests/smoke-agentic.sh` path, web up): set one cooperative's A1 to `anthropic` with the stub as base, seed a pending entry whose note contains a phone number, check the run used the provider, the stub's recorded body has no phone number, the audit has `agent.external_call`; stop the stub and check the next run falls back.
4. ADR 0004 (stdlib HTTP instead of SDKs, the redaction rule), `rules-and-limits.md` (budget thresholds, redaction), README (how to set keys), release notes.

## Done when

Every track's tests pass, the web suite, lint and type check are clean, the platform smoke passes in CI including the provider path against the stub. With a real key the owner switches A1 to Claude for one cooperative on the web, sees the month's spend move, and the inbox keeps working when the key is removed.
