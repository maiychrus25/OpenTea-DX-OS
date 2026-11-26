<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M11: season strategy A11 and `strategy.adopt` — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** at the start of each quarter, agent A11 drafts the cooperative's season plan:
- measurable goals set from last year's same quarter;
- priorities and development initiatives in Vietnamese.

A manager adopts it with the catalogue action `strategy.adopt`. While adopted:
- the daily campaign (A9) puts items that serve the plan's goals first;
- the weekly improvements (A10) flag goals that fall behind;
- the Monday report shows progress against last year, never against A11's own targets.

A plan with any goal below last year's same quarter carries a warning and can never be adopted automatically (test 37).

**Architecture:**
- **The web computes the figures** (yield, on-time journal rate, diseased-parcel rate, the shop's revenue when `tea-shop` is installed) for any quarter, and stores plans.
- **Rules set the targets** as last year's value plus a fixed growth step. The LLM only writes priorities and initiatives (each at most 5), with a rule fallback.
- **Outside-system work** (loans, contracts, member assembly decisions) appears only as text initiatives of kind `outside`; nothing executes them.

**Tech Stack:** Next.js 14 + Prisma + zod (`apps/web`), Python 3.12 standard library (`platform/agent`), PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §10.6, §10.5, §11.1 (`strategy.adopt`: unlockable, 48-hour window), §11.7, §15 test 37, milestone row M11.

## Global Constraints

- **Repository rules:** `AGENTS.md`. No new dependency.
- **A11 never scores itself.** Reports compare actual figures with last year's same quarter.
- **`strategy.adopt`:**
  - risk `medium`, approver `manager`, `autonomy: 'unlockable'`;
  - in M12 its window is 48 h;
  - a plan with warnings is never eligible to run on its own (the M12 eligibility gains this check).
- **One adopted plan per cooperative and quarter.** Adopting supersedes the previous adopted plan of that quarter.
- **Missing data is not a target.** A goal whose figure is missing for last year is left out, never invented.

## Review Focus

1. **No data for last year** (a new cooperative). The plan has no goals of that kind and no warning for it; priorities and initiatives still come. Test: A-2 scenario.
2. **A target below last year** (a manual edit by the approver). The `warnings` list it, the preview shows `Cảnh báo: mục tiêu thấp hơn cùng kỳ năm trước`, and it is not eligible for autonomy (test 37). Test: W-2.
3. **Two drafts for one quarter.** The second post for the same quarter answers `{existing: true}`. Test: W-3.
4. **Adoption mid-quarter.** A9 and A10 use the adopted plan from the next cycle. Reports show progress from the quarter's start. Test: W-4 report.
5. **The shop's revenue when `tea-shop` is not installed.** The figure is absent, and there is no goal for it. Test: W-3 inputs.

---

## Contracts

### C1. Table (`08-agent.sql`, migration `20261127150000_strategy_plans`)

```sql
CREATE TABLE IF NOT EXISTS platform.strategy_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  season text NOT NULL CHECK (season ~ '^[0-9]{4}-Q[1-4]$'),
  goals jsonb NOT NULL,          -- [{key, label_vi, unit_vi, baseline, target, direction: 'up'|'down'}]
  priorities jsonb NOT NULL,     -- ["…"] at most 5, each at most 160 characters
  initiatives jsonb NOT NULL,    -- [{kind: 'miniapp'|'training'|'partner'|'expand'|'outside', title_vi}] at most 5
  warnings jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','adopted','superseded')),
  proposal_id uuid NULL UNIQUE REFERENCES platform.agent_proposals(id) ON DELETE SET NULL,
  adopted_by text NULL, adopted_at timestamptz NULL, run_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, season, created_at)
);
-- partial unique index: one draft per (htx_code, season) WHERE status = 'draft'
```

The table gets the audit row trigger.

### C2. Figures (web, `apps/web/src/application/agent/strategy/season-figures.ts`)

`seasonFigures(htxCode, season): Record<GoalKey, number | null>`:

| key | label_vi | unit_vi | direction | figure |
|---|---|---|---|---|
| `yield_kg` | Sản lượng | kg | up | sum of the cooperative's lots' actual (else estimated) weight with `harvest_date` in the quarter |
| `journal_on_time_rate` | Nhật ký đúng hạn | % | up | entries whose `created_at` is at most 2 days after `entry_date`, over all entries of the quarter |
| `diseased_parcel_rate` | Thửa có bệnh | % | down | parcels with a confirmed disease report in the quarter, over the cooperative's parcels |
| `shop_revenue_vnd` | Doanh thu cửa hàng | đồng | up | the sum of tea-shop orders not cancelled in the quarter; null when tea-shop is not installed or not enabled |

A figure with no rows is `null`.

### C3. Routes (agent ↔ web)

**`GET /api/internal/agent/strategy/inputs?season=YYYY-Qn`** answers:
- `{season, current: figures(season so far), last_year: figures(same quarter last year), previous: figures(previous quarter), adopted: {id, season} | null, draft_exists: boolean}`;
- wrapped as `{data: …}`.

**`POST /api/internal/agent/strategy/plans`** with body `{season, goals, priorities, initiatives, run_id}`:
1. checks the shapes (zod) and the limits;
2. recomputes `warnings`: every goal whose target is worse than `last_year` in its direction (`Mục tiêu <label> thấp hơn cùng kỳ năm trước`);
3. inserts the draft;
4. creates the `strategy.adopt` proposal (`agent: 'strategy'`) with payload `{plan_id}` and evidence = the plan row;
5. answers 201 `{id, proposal_id}`, or 200 `{existing: true}` when a draft exists for the season.

### C4. `strategy.adopt` (catalogue)

- `titleVi` `Áp dụng kế hoạch mùa vụ`.
- `preview`: the season, the goals (`<label>: <target> <unit> (cùng kỳ: <baseline>)`), up to 3 priorities, and the warning line when there are warnings.
- `execute`: sets the plan `adopted`, sets the previous adopted plan of the same season `superseded`, and writes the audit event `strategy.adopted`.
- `isStale` when the plan row changed.
- M12 eligibility gains: `strategy.adopt` is not eligible when the plan has warnings (test 37).

### C5. Agent A11 (`platform/agent/dxos_agent/agents/strategy.py`)

- **Schedule:** on the first day of each quarter at 06:15 Vietnam time, and on the first cycle when the current quarter has neither an adopted plan nor a draft.
- **Targets** (rules), with `b` = last year's figure:
  - `up` goals: `round(b × 1.05)`;
  - `down` goals: `round(b × 0.9, 1)`;
  - a goal is omitted when `b` is null.
- **Priorities and initiatives:**
  - the LLM gets only the goal figures, and answers `{"priorities": [...], "initiatives": [{"kind": ..., "title_vi": ...}]}` within the C1 limits;
  - fallback: one priority per goal (`Tăng <label>` or `Giảm <label>`) and no initiatives;
  - initiative kinds outside the list are dropped.
- **Run:** agent `strategy`, trigger `schedule`, provider chain from settings agent `strategy`.
- `CONFIGURABLE_AGENTS` and `KNOWN_AGENTS` gain `strategy`, labelled `Kế hoạch mùa vụ (A11)`.

### C6. A9, A10 and reports

- **A9 candidates** gain `season_goal_keys`, from the adopted plan: the goal keys the plan raises. They are mapped to campaign `goal_key` values:
  - `yield_kg` → `harvest`;
  - `diseased_parcel_rate` → `inspection`;
  - `journal_on_time_rate` → `journal_backlog`.

  A9 sorts items whose `goal_key` is in that set before the others, keeping the C5 kind weights inside each group.
- **A10 inputs** gain `season_progress`: for each goal, `{key, target, baseline, current, pro_rated_target}`. A new rule, `season_goal_behind`, fires when `current` is behind `pro_rated_target` by at least 20% and at least 4 weeks of the quarter have passed. It proposes a `process` improvement `Mục tiêu vụ "<label>" đang chậm so với kế hoạch`.
- **Monday report:** adds up to 3 lines `<label>: <current> (cùng kỳ năm trước: <baseline>)`, without reference to the target.

---

## Tracks

| Track | Owns |
|---|---|
| W web | `apps/web/**`, `08-agent.sql`, the docs `api-contract.md` and `database-schema.md` |
| A agent | `platform/agent/**` (A11, the A9 sort, the A10 rule, the scenarios) |
| I smoke and docs | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

Tasks per track follow the contracts with test-first steps and the Review Focus tests.

**The I smoke:**
- seed last year's Q4 lots for TC;
- restart the agent;
- assert a draft plan with a `yield_kg` goal at 105% and an open `strategy.adopt` proposal;
- approve it through Telegram;
- assert it is `adopted`;
- the next campaign puts a harvest item first;
- a manual plan post with a lower target carries the warning (test 37).
