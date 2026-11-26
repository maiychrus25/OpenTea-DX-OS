<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M8: weekly improvements A10, `agent.settings.update` and the AI metrics tab — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every Monday, agent A10 looks at how the cooperative's agents and campaigns did over the last weeks.
- It proposes at most 5 improvements, each with its evidence.
- A manager approves or declines them like any proposal.
- Adopted improvements are measured again after 2 and 4 weeks, and the weekly report says whether each one helped.
- The `htx-dashboard` mini-app gains an AI tab with the per-agent figures.

**Architecture:**
- **Rules find the problems; the LLM only words the rationale.** Every improvement is an ordinary proposal:
  - `agent.settings.update` for a threshold or schedule change;
  - `improvement.adopt` for a process note or a campaign template.

  So approval, Telegram, the campaign, staleness and audit all come from M1 to M7.
- **The web stores improvements** in a table and builds the figures A10 needs. A10 never reads business tables for this.
- **The dashboard** reads the AI figures through Hasura with the manager's own token, like its other tabs.

**Tech Stack:** Next.js 14 + Prisma (raw SQL for `platform.*`) + zod (`apps/web`), Python 3.12 standard library (`platform/agent`), FastAPI + Jinja (`miniapps/htx-dashboard`), Hasura metadata, PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md`: §10.3, §10.4 (`improvements`), §6 (`agent.settings.update`), §11.1 (only tightening may run alone, which matters for M12), §13.3 (Monday 07:00 report), §15 (metrics tab), milestone row M8 in §17.

## Global Constraints

- **Repository rules:** `AGENTS.md`.
  - English Conventional Commits and English identifiers.
  - Vietnamese user-facing text with diacritics.
  - SPDX headers on new files.
  - No secrets and no `.env*` files. No new dependency.
- **Standard library only** for `platform/agent`. The dashboard keeps its current dependencies.
- **The agent never writes business data.** It reads inputs and posts improvements through `/api/internal/agent/*` (spec §5.1).
- **Decisions go through `DecideProposalUseCase`.** Execution, staleness and audit work as for every other kind.
- **A10 never proposes** changes to the catalogue, roles, provider policy, budgets, keys or autonomy (spec §10.3, H2). `agent.settings.update` accepts only the threshold keys and the digest schedule listed in C2.
- **New SQL** goes in `platform/postgres/init/08-agent.sql`, idempotent, plus a Prisma migration added with `git add -f`. Every new repository method is checked against a throwaway Postgres.
- **Hasura** exposes only the columns listed in C8, to role `manager`, filtered by `X-Hasura-Htx-Code`.
- **UI** (the dashboard tab) follows the dashboard's own design:
  - light and dark;
  - 390 px width with no page-level horizontal overflow;
  - no text under 11 px.
- **Unchanged behaviour:** A1 to A9, M5 chat, M7 campaign.

## Review Focus

1. **Loosening a threshold is only ever a proposal.** A decided `agent.settings.update` changes exactly the keys in its payload and nothing else. Tightening and loosening are marked in the preview, so M12 can tell them apart. Test: W-2 `settings update changes only the listed keys and marks the direction`.
2. **Settings changed after the proposal.** When the settings changed after the proposal was made, deciding it is `stale` and changes nothing. Test: W-2 `settings update is stale after the settings change`.
3. **No repeats.** A metric with an improvement that is open, or adopted in the last 28 days, gets no new one. Test: A-2 scenario `no repeat while open or recently adopted`.
4. **Too few samples.** A rule never fires on fewer samples than its minimum. Test: A-2 scenarios at the minimum and one below it.
5. **Measuring an improvement that was declined, or whose metric has no data.** Such an improvement is not measured, and the report shows nothing for it. Test: A-3 scenario and W-4 report test.

---

## Contracts

### C1. Tables (`08-agent.sql`, migration `20261127090000_weekly_improvements`)

```sql
CREATE TABLE IF NOT EXISTS platform.improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  week date NOT NULL,                     -- the Monday (Vietnam) it was proposed
  kind text NOT NULL CHECK (kind IN ('setting','process','template')),
  metric_key text NOT NULL,
  title_vi text NOT NULL CHECK (char_length(title_vi) <= 120),
  rationale_vi text NOT NULL CHECK (char_length(rationale_vi) <= 600),
  baseline numeric NOT NULL,
  evidence jsonb NOT NULL,
  proposal_id uuid NULL UNIQUE REFERENCES platform.agent_proposals(id),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','adopted','declined','measured')),
  decided_by text NULL, adopted_at timestamptz NULL,
  effect jsonb NOT NULL DEFAULT '{}',     -- {"after_2w": {"value": n, "verdict": v}, "after_4w": {...}}
  template jsonb NULL,                    -- template kind only: {"weekday": 1..7, "goal_key": "...", "title_vi": "..."}
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, week, metric_key)
);
```

The table gets the audit row trigger.

### C2. Catalogue actions (web)

**`agent.settings.update`**
- `titleVi` `Đổi cài đặt agent`; risk `medium`; approver `manager`; origins `agent`.
- `autonomy` `auto`. M12 enforces tightening only.
- Channels web and telegram. `subjectTable` null; `repeatAfterHours` 168.
- Payload, strict: `{ agent, thresholds?, schedule? }`, with at least one of the two.

| agent | key | range | stricter means |
|---|---|---|---|
| `field-watch` | `silent_hours` | 1..48 | lower |
| | `dry_soil_pct` | 5..80 | higher |
| | `heat_c` | 25..50 | lower |
| | `frost_c` | -5..15 | higher |
| | `heavy_rain_mm` | 1..200 | lower |
| `disease-watch` | `min_reports` | 2..20 | lower |
| | `radius_m` | 200..20000 | higher |
| | `window_days` | 1..60 | higher |
| `harvest-ready` | `harvest_window_days` | 0..30 | higher |
| `digest` | `schedule` (`HH:MM`) | 05:00..22:00 | — |

- Export the table as `SETTING_KEYS` with the direction, for M12.
- `preview`: one line per change, `<label>: <old> → <new> (<siết|nới>)`, for example `Cảm biến im lặng: 6 → 8 giờ (nới)`.
- Evidence: one row `{table: 'agent_settings', id: '<htx>:<agent>', sha256}` over the row's `thresholds` and `schedule`. A new loader in `EVIDENCE_LOADERS` makes it stale when they change.
- `execute`: updates `thresholds` (a merge of only the given keys) and/or `schedule` as the approver. It returns the old and new values.

**`improvement.adopt`**
- `titleVi` `Áp dụng cải tiến`; risk `low`; approver `manager`; origins `agent`; `autonomy` `never`.
- Payload `{ improvement_id }`. `subjectTable` `improvements`.
- Evidence: the improvement row.
- `preview`: the improvement's title and rationale.
- `execute`: sets the improvement `adopted`.
  - `process`: sends its title to the cooperative's linked managers and officers as an internal notification.
  - `template`: activates its template.

**Status follows the proposal.** When the proposal of an improvement is decided:
- approved and executed → `adopted`, with `adopted_at` and `decided_by`;
- rejected → `declined`.

This holds for both kinds.

### C3. Inputs (web → agent)

`GET /api/internal/agent/improvements/inputs?week=YYYY-MM-DD` uses the agent token:

```json
{
  "week": "2026-11-30",
  "settings": {"field-watch": {"thresholds": {}, "schedule": null}},
  "proposal_stats": [{"agent": "field-watch", "kind": "notification.internal", "template": "sensor_silent",
                       "window_days": 28, "approved": 1, "rejected": 6, "expired": 0, "median_wait_hours": 3.5}],
  "journal_review": {"window_days": 28, "reviewed": 30, "returned_missing_info": 14},
  "campaign_goals": [{"goal_key": "harvest", "days": 10, "missed_days": 4}],
  "improvements": [{"id": "uuid", "kind": "setting", "metric_key": "...", "status": "adopted",
                    "baseline": 0.85, "adopted_at": "ISO", "effect": {}}],
  "metrics": {"<metric_key>": 0.42}
}
```

- `proposal_stats` covers the last 28 days, grouped by agent, kind and template (`payload.template` when present).
- `campaign_goals` covers the last 14 days. A missed day is one whose outcome has `actual < target`.
- `improvements` lists the cooperative's improvements of the last 8 weeks.
- `metrics` holds today's value of every `metric_key` in `improvements`, computed with the C4 formulas.

### C4. Rules of A10 (agent, `platform/agent/dxos_agent/agents/improvement.py`)

| rule | metric_key | fires when | improvement |
|---|---|---|---|
| noise | `reject_rate:<agent>:<template or kind>` = rejected / (approved + rejected) | at least 0.6 with at least 5 decided, for the field-watch templates `sensor_silent`, `dry_soil`, `heat`, `frost`, `rain_after_spray` and for `disease-watch` `disease.inspection` | `setting`: `agent.settings.update` loosening one step: `silent_hours` +2 (max 48), `dry_soil_pct` −3, `heat_c` +1, `frost_c` −1, `heavy_rain_mm` +5, `min_reports` +1 |
| missing info | `journal_missing_info_rate` = returned_missing_info / reviewed | at least 0.4 with at least 10 reviewed | `process`: title `Bắt buộc ghi liều lượng khi ghi nhật ký phun thuốc` |
| slow decisions | `median_wait_hours` over all kinds (decided ones) | at least 24 with at least 10 decided | `process`: title `Đề xuất chờ duyệt quá lâu: nên giao thêm người duyệt` |
| missed goal | `missed_days:<goal_key>` | at least 3 missed days in 14 | `template`: Monday reminder, title `Nhắc đầu tuần: <label_vi of the goal>`, template `{weekday: 1, goal_key, title_vi}` |

- A metric with an improvement that is `proposed`, or `adopted` in the last 28 days, is skipped.
- At most 5 improvements per run, in the table order above.
- `rationale_vi` (at most 600 characters):
  - the LLM gets only the rule, the metric, the numbers and the change, and answers `{"rationale_vi": "..."}`;
  - fallback: `<metric label>: <value> trong <n> ngày gần đây (ngưỡng <limit>). Đề xuất: <change>.`.
- **Measurement.** For each `adopted` improvement 14 days or more after `adopted_at` without `after_2w`, and 28 days or more without `after_4w`, compare `metrics[metric_key]` with `baseline` (lower is better for every metric):
  - `helped` when it is at least 20% lower;
  - `drop` when it is at least 20% higher;
  - `no_effect` otherwise.

  A missing metric value means no measurement.
- Schedule: weekly, Monday at 06:30 Vietnam time, before the 07:00 weekly report. It is due on the first cycle after start when this week's run has not happened.
- Run: agent `improvement`, trigger `schedule`, provider chain from settings agent `improvement`.

### C5. Agent → web routes

`POST /api/internal/agent/improvements` with body:

```json
{
  "week": "...", "kind": "...", "metric_key": "...", "title_vi": "...", "rationale_vi": "...",
  "baseline": 0.85, "evidence": {...},
  "settings_change": {"agent": "...", "thresholds": {...}, "schedule": null},
  "template": {...},
  "run_id": "uuid"
}
```

`settings_change` is for the `setting` kind only, and `template` for the `template` kind only.

The web, in one transaction:
1. inserts the improvement;
2. creates the proposal through `CreateProposalUseCase`, as `agent: 'improvement'`, `origin: 'agent'`:
   - `agent.settings.update` with the change and the settings evidence for a setting;
   - `improvement.adopt` with the new id otherwise;
3. links `proposal_id`.

Answers:
- 201 `{id, proposal_id}`;
- 200 `{deduped: true}` on the `(htx_code, week, metric_key)` conflict;
- 400 on a key or range outside C2.

`POST /api/internal/agent/improvements/{id}/effect` with body `{after: "2w"|"4w", value, verdict: "helped"|"no_effect"|"drop"}`:
- sets the effect;
- `4w` also sets status `measured`;
- answers 404 for another cooperative and 409 when the improvement is not `adopted` or that `after` is already set.

### C6. Weekly report (Monday 07:00, `enqueueReport` weekly)

Append up to 3 lines:
- `Cải tiến tuần này: <n> đề xuất` when any were created this week;
- one line per improvement measured since the last weekly report: `<Đã giúp|Chưa thấy tác dụng|Nên bỏ>: <title_vi>`.

The 8-line limit holds; these lines come after the figures.

### C7. Campaign templates (web, M7 message and panel)

The 06:00 campaign message and the inbox panel add one line `Nhắc theo mẫu: <title_vi>` for each adopted, not yet `measured`-as-`drop`, template improvement whose `weekday` matches the campaign's Vietnam weekday (Monday = 1). Show at most 2 such lines.

### C8. Hasura and the AI tab (`miniapps/htx-dashboard`)

**Hasura** tracks `platform.agent_proposals`, `platform.agent_runs` and `platform.improvements`. Role `manager` selects with filter `htx_code = X-Hasura-Htx-Code`, with these columns only:
- proposals: `id, agent, kind, status, risk, origin, created_at, decided_at`;
- runs: `id, agent, status, provider, model, tokens_in, tokens_out, cost_estimate, started_at, finished_at`;
- improvements: `id, kind, title_vi, status, effect, metric_key, created_at, adopted_at`.

Grant SELECT on those three tables to the database role Hasura uses, in the init SQL.

**New dashboard page `/ai`** (menu label `AI`, manager only), over the last 28 days:
- per agent: proposals, approval rate, rejection rate, median wait (hours), failed runs, cost (USD, two decimals);
- a bar chart of proposals per agent by status, built with the dashboard's existing chart helpers;
- improvements: title, status, and the 2-week and 4-week verdicts.
- With no data: `Chưa có số liệu AI trong 28 ngày qua.`.
- Bump the mini-app version to `0.3.0` and add one store screenshot of the new page.

### C9. Settings

- `CONFIGURABLE_AGENTS` and `KNOWN_AGENTS` gain `'improvement'`.
- Label: `Cải tiến hằng tuần (A10)`.
- Share text: `Số liệu tổng hợp của agent và chiến dịch (tỉ lệ duyệt, thời gian chờ, số ngày trượt mục tiêu). Không có tên hay số điện thoại của nông hộ.`.

---

## Tracks

Four parallel sessions start from the commit of this plan, each in its own worktree and branch, and merge into `feat/55-agentic-m8`.
- Keep to your files.
- Follow C1–C9 exactly.
- If a contract cannot work as written, build the closest version and say exactly what differs in the report.

| Track | Branch | Owns |
|---|---|---|
| W web | `feat/55-agentic-m8-web` | `apps/web/**`, `platform/postgres/init/08-agent.sql`, `docs/api-contract.md`, `docs/database-schema.md` |
| A agent | `feat/55-agentic-m8-agent` | `platform/agent/**` |
| D dashboard | `feat/55-agentic-m8-dashboard` | `miniapps/htx-dashboard/**`, `platform/hasura/metadata/**`, a new init file `platform/postgres/init/11-hasura-agent-metrics.sql` for the grants |
| I smoke and docs | `feat/55-agentic-m8-infra` | `platform/tests/**` except `platform/agent/tests`, `docs/rules-and-limits.md`, `README.md` |

### Track W

**W-1: table and repository.**
- [ ] C1, an `ImprovementRepository` (port and Prisma) with tests, and a throwaway Postgres check (container `dxos-m8-web-pg`, port `127.0.0.1:55451`).
- [ ] Commit.

**W-2: the two actions.**
- [ ] C2 with tests, including the Review Focus 1 and 2 tests and the status-follows-proposal rule.
- [ ] Commit.

**W-3: routes.**
- [ ] C3 inputs and the C5 routes, with tests: figures from seeded rows, LB rows never counted, the dedupe, range refusals, effect 404 and 409.
- [ ] Commit.

**W-4: report, templates, settings and docs.**
- [ ] C6, C7, C9 with tests.
- [ ] Update `api-contract.md` and `database-schema.md`.
- [ ] Run the whole Jest suite, lint, `tsc --noEmit` and `prisma validate`. Commit.

### Track A

**A-1: gateway calls.**
- [ ] `get_improvement_inputs(week)`, `post_improvement(body)`, `post_improvement_effect(id, body)`, with tests.

**A-2: rules.**
- [ ] C4 rules with a replay scenario suite `tests/scenarios/a10_improvement.json`:
  - each rule at its minimum and one below it;
  - the order and the cap of 5;
  - no repeat while open or recently adopted;
  - the loosening step and its bounds;
  - provider error → fallback rationale.

**A-3: measurement.**
- [ ] Scenarios: helped, no effect, drop, missing metric, a declined improvement ignored, `after_4w` only after `after_2w`.

**A-4: schedule and checks.**
- [ ] Weekly Monday 06:30, after the main cycle's agents.
- [ ] Run `PYTHONPATH=platform/agent uvx --python 3.12 pytest platform/agent/tests -W error`. Commit.

### Track D

**D-1: Hasura and grants.**
- [ ] C8 metadata and grants.
- [ ] Throwaway Hasura (`hasura/graphql-engine:v2.51.4.cli-migrations-v3`, container `dxos-m8-dash-hasura`) on a throwaway Postgres (`dxos-m8-dash-pg`, port `127.0.0.1:55452`). Prove that a manager of TC sees TC rows only and none of the hidden columns.
- [ ] Commit.

**D-2: the `/ai` page.**
- [ ] C8 with the dashboard's test pattern (sample data, preview).
- [ ] Headless check at 1280 and 390 px, light and dark, with screenshots in scratch, plus the store screenshot.
- [ ] Commit.

### Track I

**I-1: `platform/tests/smoke-improvement.sh`.**

Sourced by `smoke-agentic.sh` after `smoke-campaign.sh`; adds no PASS line to `make platform-smoke`.
- Setup:
  - stop `dxos-agent`;
  - seed 6 rejected and 1 approved TC `field-watch` `notification.internal` proposals with template `sensor_silent`, decided within the last 28 days (historical rows, inserted directly);
  - remove TC improvements of this week;
  - restart the agent.
- Assertions:
  - one improvement `reject_rate:field-watch:sensor_silent` and an open `agent.settings.update` proposal with `silent_hours` 8;
  - the manager approves it through its Telegram button;
  - TC `field-watch` `thresholds.silent_hours` is 8;
  - the improvement is `adopted`.
- Restore the thresholds and rows on exit.
- [ ] Add `test_smoke_scripts.py` checks.

**I-2: docs.**
- [ ] `rules-and-limits.md`: the improvement rules and limits (C4), the setting keys and ranges (C2).
- [ ] `README.md`: one paragraph.

**I-3: checks.**
- [ ] Run the pytest suites and `bash -n`. Commit.

## Integration (main session)

1. Merge W, A, D and I.
2. Cross-track check on a throwaway Postgres:
   - A10's scenario posts go through the real routes' use cases;
   - the settings proposal is decided through `DecideProposalUseCase`.
3. Add the spec post-release notes and update #55.
4. Open the PR, and merge when CI is green.
