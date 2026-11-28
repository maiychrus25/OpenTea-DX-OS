<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# GĐ4-A Cross-check Agent, Yield Forecast, PDF RAG and Farmer TTS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:**
- Rule-based alerts on real operating data reach officers and heads for review: pesticide advanced but no spraying, leaf weighed above the area norm.
- The workshop sees a 14-day fresh/dry forecast.
- The technical chatbot answers from text PDFs and the tea handbook, picking passages by relevance.
- Farmers can listen to the key screens.

**Architecture:**
- Hasura `agent` permissions for the new tables, without money or personal columns.
- A Python rule agent following `harvest_ready.py`, emitting `notification.internal` proposals.
- A deterministic forecast use case in the web.
- A BM25 chunk index over P.A.R.A text, plus `unpdf` extraction cached as `.txt` sidecars.
- The existing Piper route, with a per-user limit and an audio cache.

**Spec:** `docs/specs/2026-11-28-phase4-intelligence-pests-zalo-design.md` §3 and §7.

## Global Constraints

- Human in the loop: every alert is a proposal or a read-only block. Nothing changes data on its own.
- Agent tables expose no `amount_vnd`, `unit_price_vnd`, `price_vnd_per_kg`, names or phones.
- Defaults, all editable per cooperative through `THRESHOLD_DEFAULTS`:
  - `cross-check.grace_days = 14`;
  - `cross-check.fresh_norm_kg_per_ha_flush = 2000`;
  - `cross-check.norm_tolerance = 1.3`;
  - `cross-check.realert_extra = 0.2`.
- Forecast:
  - median of the last 3 closed flushes; fall back to `area_ha × fresh_norm_kg_per_ha_flush` with `source = 'NORM'`;
  - dry = fresh ÷ 4.75, one decimal;
  - window = open cycles with `estimated_harvest_date` in `[today, today + 14]`.
- RAG:
  - chunks of 1,200 characters with 150 overlap;
  - BM25 with k1 1.2 and b 0.75 on diacritic-folded lowercase tokens;
  - top 4 chunks, each cited by file name;
  - exclude front-matter `ai: false` and any folder containing `.ai-ignore`;
  - no vector store.
- New dependency: `unpdf` only (MIT). Pin its exact version in `apps/web/package.json`.
- TTS: 20 requests per minute per user, then 429 `RATE_LIMITED`. Cache by `sha256(voice + text)` in `para/_tts-cache/` for 7 days.
- Patterns:
  - agent: `platform/agent/dxos_agent/agents/harvest_ready.py`, `evidence.py`, `tests/scenarios/*.json`, `test_m4_scenarios.py`;
  - web evidence: `apps/web/src/application/agent/actions/*-evidence.ts`;
  - Hasura: `platform/hasura/metadata/databases/default/tables/public_parcels.yaml`;
  - chatbot: `apps/web/src/application/chatbot/ChatbotUseCase.ts`;
  - TTS: `apps/web/src/app/api/tts/route.ts`, `ListenBulletinButton.tsx`.
- Commits: identity maiychrus25 / ninhkhuongpl7@gmail.com, English Conventional Commits, no AI attribution. Before reporting run tsc, lint, full jest, `platform/agent` pytest and `platform/tests` pytest.

## Review Focus

1. A spraying logged on a different parcel of the same household counts for R1. One on another household's parcel does not.
2. A voided advance or ticket never triggers an alert. A DRAFT or REJECTED spraying never clears one.
3. An R2 re-alert fires only after a further 20% over the last alerted total, never twice for the same total.
4. A question in Vietnamese with or without diacritics retrieves the same passage, and a file marked `ai: false` never appears in the context.
5. A scanned PDF yields "không đọc được" and no garbage text in the prompt.

## Tracks

| Track | Worker | Tasks |
|---|---|---|
| A-agent | Sonnet | A1 → A2 |
| A-core | Sonnet | A3 → A4 → A6 |
| A-docs | Sonnet | A5 (after the owner's §7.4 choice) |
| A-fe | Codex | F1 (forecast blocks, listen buttons) |

### Task A1: agent read access to phase 1–3 tables

**Files:** `platform/hasura/metadata/databases/default/tables/{public_input_advances,public_input_items,public_fresh_leaf_tickets,public_processing_batches,public_processing_batch_outputs}.yaml`, `tables.yaml`, `platform/tests/test_hasura_agent_permissions.py`.

- Select permission for role `agent` only, filtered by `htx_profile.htx_code = X-Hasura-Htx-Code`, with aggregations. Columns:
  - `input_advances`: id, household_id, item_id, quantity, advanced_on, status, settlement_id;
  - `input_items`: id, kind, pesticide_product_id, active;
  - `fresh_leaf_tickets`: id, household_id, parcel_id, cycle_id, weighed_at, net_kg, status;
  - `processing_batches`: id, status, processed_on, fresh_kg, dry_kg, recovery_ratio, out_of_band;
  - `processing_batch_outputs`: id, batch_id, grade, kg.
- The test pins the exact column lists and asserts no money column is present.

Commit: `feat(agent): let the agent read advances, tickets and batches without money columns`.

### Task A2: cross-check agent (A13)

**Files:** `platform/agent/dxos_agent/agents/cross_check.py`, `evidence.py` (row builders `advance_evidence_row`, `ticket_evidence_row`), `settings.py` (defaults), `__main__.py` (daily 05:45), `tests/test_cross_check.py`, `tests/scenarios/a13_cross_check.json`, shared fixtures `tests/fixtures/evidence-vectors*.json`. On the web side: `apps/web/src/domain/agent/proposal.ts` (`KNOWN_AGENTS` += `cross-check`), the evidence loaders for `input_advances` and `fresh_leaf_tickets` in `application/agent/actions/`, two templates in `actions/message-templates.ts` (`advance_without_spraying`, `weighing_over_norm`), and tests.

**Interfaces:**
- `advance_alerts(advances, items, sprayings, parcels, today, thresholds) -> list[Proposal]`
- `norm_alerts(tickets, parcels, alerted, today, thresholds) -> list[Proposal]`

Both are pure functions. The proposals are `notification.internal` with `dedupe_key`:
- R1: `cross-check:advance:<advance_id>`;
- R2: `cross-check:norm:<parcel_id>:<cycle_id|window>:<bucket>`, where the bucket rises by 20%.

Rules exactly as spec §3.2. Sprayings are matched by `pesticide_product_id`, or any spraying when the item has none. A tests-first scenario runs through `test_m4_scenarios.py`.

Commit: `feat(agent): cross-check advances against sprayings and weighing against the area norm`.

### Task A3: yield forecast use case

**Files:** `apps/web/src/domain/forecast/{views.ts,forecast.ts}`, `apps/web/src/application/forecast/ForecastUseCase.ts`, `apps/web/src/infrastructure/db/forecast/PrismaForecastSource.ts`, tests (unit and Postgres opt-in `FORECAST_TEST_DATABASE_URL`). The board's dry-stock block gains `forecast_dry_kg_14d: number | null` (contract change in `domain/board/views.ts`; update the board use case and tests).

**Interfaces:**
- `ForecastUseCase.read(htxProfileId, today) -> { weeks: { week_start, fresh_kg, dry_kg }[]; parcels: { parcel_id, parcel_code, harvest_on, fresh_kg, dry_kg, source: 'HISTORY' | 'NORM' }[]; total_fresh_kg; total_dry_kg }`.

Commit: `feat(forecast): fresh and dry tea forecast for the next 14 days`.

### Task A4: PDF text and relevant passages for the technical chatbot

**Files:**
- `apps/web/src/application/chatbot/passages.ts`: chunking, folding, BM25, and the exclusion rules;
- `apps/web/src/infrastructure/storage/pdf-text.ts`: `unpdf`, writing `<key>.txt` sidecars, scanned → `null`;
- `ChatbotUseCase.ts`: technical mode uses `selectPassages(question, docs)`;
- the upload completion hook (`application/document/*`) extracts on upload;
- tests: a fixture text PDF and a scanned PDF of a few KB each under `apps/web/src/__tests__/fixtures/pdf/`.

**Interfaces:** `selectPassages(question: string, docs: { key: string; name: string; text: string; ai: boolean }[], k = 4): { name: string; text: string; score: number }[]`.

Commit: `feat(chatbot): read text PDFs and pick passages that match the question`.

### Task A5: tea handbook template (depends on §7.4)

**Files:** `docs/templates/para-tea-cooperative/**`, the `./dxos` script (`para seed <htx>` subcommand), `platform/cli/tests/test_dxos_script.py`.

- Port the selected `.md` and `.csv` files of PR #99 into kebab-case folders. Keep each source's attribution and licence at the top.
- Mark the pesticide reference file `ai: false`.
- `para seed` copies only missing files into `para/<htx>/` through the web document API with a manager token. It never overwrites.

Commit: `docs(templates): tea handbook for the cooperative library from the resource survey`.

### Task A6: TTS limits and cache

**Files:** `apps/web/src/app/api/tts/route.ts`, `apps/web/src/infrastructure/tts/tts-cache.ts`, tests.

- Per-user limiter: an in-memory sliding window per process. Comment it as `shortcut: per-process limit, move to Redis or Postgres if the web scales out`.
- Cache in the object store, keyed by hash.
- `/api/tts/status` stays public.

Commit: `feat(tts): cache spoken text and limit requests per person`.

### Task F1 (Codex): forecast blocks and listen buttons

**Files:** `apps/web/src/components/features/forecast/*`, `apps/web/src/app/{officer,manager}/processing/page.tsx`, the board dry-stock block, `apps/web/src/components/features/tts/ListenButton.tsx` (generalized from `ListenBulletinButton`), and the farmer dashboard, journal, diagnosis and ledger pages, with tests.

- **Forecast block:** weekly bars as text and table, not a chart library; per-parcel rows; a "Theo định mức" badge on NORM rows.
- **Listen button:** builds a short Vietnamese sentence from what is on screen. It never reads bank numbers. It falls back to Web Speech, and shows the 429 message "Bạn nghe nhiều quá, thử lại sau một phút."
- Phone first, light and dark. Run `next build` before reporting.

## Verification (controller)

- All suites. Agent scenarios.
- A throwaway stack with the phase 1–3 flow data, then:
  - one advance with no spraying after 15 days, faked by back-dating `advanced_on`, gives exactly one alert;
  - a parcel over the norm gives one alert;
  - the forecast block matches hand counts;
  - the chatbot cites the PDF passage;
  - listen works with the Piper extras up.
- Two UI rounds.
