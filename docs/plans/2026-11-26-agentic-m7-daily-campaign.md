<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M7: daily campaign A9 and outcome tracking — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every morning, agent A9 turns the cooperative's open proposals into one daily campaign.
- The campaign is a list of at most 15 actions, each with a measurable goal, ordered by fixed rules.
- At 06:00 managers get it on Telegram and in the web inbox. They approve the whole campaign, approve items one by one, or drop it.
- The 18:00 daily report says, per goal, what was planned and what was done.

**Architecture:**
- The web owns the data and every decision. It serves A9 the candidates (open proposals with goals and the facts the rules need), and it stores the campaign A9 returns after checking it again.
- Rules decide order and conflicts (spec §10.1: no spraying before rain, no harvesting in the withdrawal period, no more work than people available). The LLM only writes the two-sentence summary.
- Approving the whole campaign runs the existing proposal decision for every item the approver may decide, except `high` items, which still need their own confirmation.

**Tech Stack:** Next.js 14 + Prisma (raw SQL for `platform.*`) + zod (`apps/web`), Python 3.12 standard library (`platform/agent`), PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md`: §10.1, §10.4, §10.5, §13.3 (06:00 and 18:00 reports), §15 tests 14 and 15, milestone row M7 in §17.

## Global Constraints

- **Repository rules:** `AGENTS.md`.
  - English Conventional Commits and English identifiers.
  - Vietnamese user-facing text with diacritics.
  - SPDX headers on new files.
  - No secrets and no `.env*` files. No new dependency.
- **`platform/agent`** stays standard library only.
- **The agent never writes business data.** It reads candidates and posts the campaign through `/api/internal/agent/*` with its cooperative token (trust zones, spec §5.1).
- **Decisions go through `DecideProposalUseCase`.** Every item runs through it, so role, staleness, execution and audit stay as in M1 to M5. No new execution path.
- **One campaign per cooperative per Vietnam day.** If the agent posts a second one for the same day, the web returns the first.
- **Items that may not run:**
  - a `high` item never runs from "approve all";
  - an item whose kind the approver may not decide never runs as that approver.
- **New SQL** goes in `platform/postgres/init/08-agent.sql`, idempotent, plus a Prisma migration added with `git add -f`. Every new repository method is checked once against a throwaway Postgres.
- **UI** follows `DESIGN.md`:
  - light and dark;
  - 390 px width with no page-level horizontal overflow;
  - no text under 11 px;
  - keyboard focus visible.
- **Unchanged behaviour:** A1 to A7, M5 chat, and the M2 buttons, except for the callback ops added in C6.

## Review Focus

1. **Approve all with mixed rights (test 14).**
   - A manager's approve-all runs every item the manager may decide, leaves `high` items `proposed`, and sends items only an officer may decide to the linked officers.
   - Test: W-3 `approve all runs allowed items, keeps high items and forwards the rest`.
2. **A stale or already decided item inside approve-all.**
   - Cases: an item's source data changed (`stale`), or someone already decided it.
   - Expected: approve-all reports it and goes on with the others; one failure never stops the rest.
   - Test: W-3 `approve all continues past a stale and an already decided item`.
3. **A second campaign for the same day.**
   - Case: the agent restarts after 06:00 and posts again.
   - Expected: the web keeps the first and answers `{existing: true}`, and Telegram gets no second message.
   - Test: W-2 `second campaign of the day returns the first`.
4. **Rule conflicts (test 15).**
   - Cases: a harvest on a parcel still in its withdrawal period, a spraying item on a parcel with rain coming, or more people needed than available.
   - Expected: the item is never in the campaign, and it is listed in `dropped` with its rule.
   - Test: A-2 scenarios.
5. **Approving an item outside approve-all.**
   - Approving a campaign item from the inbox or Telegram approves that item and moves a `draft` campaign to `partial`.
   - Once the campaign is `dropped`, its items are ordinary proposals again.
   - Test: W-3 `deciding an item moves a draft campaign to partial`.

---

## Contracts

### C1. Tables (`08-agent.sql` and migration `20261126180000_daily_campaigns`)

```sql
CREATE TABLE IF NOT EXISTS platform.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL,
  day date NOT NULL,                       -- Vietnam calendar day
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','partial','done','dropped')),
  goals jsonb NOT NULL DEFAULT '[]',       -- [{goal_key, label_vi, unit_vi, target}]
  summary_vi text NOT NULL,
  run_id uuid NULL REFERENCES platform.agent_runs(id),
  decided_by text NULL, decided_by_name text NULL, decided_at timestamptz NULL,
  telegram_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, day)
);
CREATE TABLE IF NOT EXISTS platform.campaign_items (
  campaign_id uuid NOT NULL REFERENCES platform.campaigns(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES platform.agent_proposals(id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 15),
  goal_key text NOT NULL,
  target integer NOT NULL CHECK (target >= 0),
  PRIMARY KEY (campaign_id, proposal_id),
  UNIQUE (campaign_id, position)
);
CREATE TABLE IF NOT EXISTS platform.campaign_outcomes (
  campaign_id uuid NOT NULL REFERENCES platform.campaigns(id) ON DELETE CASCADE,
  goal_key text NOT NULL,
  target integer NOT NULL,
  actual integer NOT NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, goal_key)
);
```

The three tables get the audit row trigger, like the other `platform.agent_*` tables.

### C2. Goals per kind (web, `apps/web/src/application/agent/campaign/campaign-goals.ts`)

`campaignGoal(proposal): { goalKey, labelVi, unitVi, target }` is the only place that maps kinds to goals:

| kind | `goal_key` | `label_vi` | `unit_vi` | `target` |
|---|---|---|---|---|
| `harvest.approve` | `harvest` | Duyệt thu hoạch | thửa | 1 |
| `journal.approve` | `journal_backlog` | Duyệt nhật ký tồn | nhật ký | `payload.entry_ids.length` |
| `journal.reject` | `journal_backlog` | Duyệt nhật ký tồn | nhật ký | 1 |
| `disease.inspection` | `inspection` | Kiểm tra vùng bệnh | vùng | 1 |
| `notification.households` | `households_notice` | Báo nông hộ | tin | 1 |
| `notification.internal` | `internal_notice` | Báo cán bộ | tin | 1 |
| `bulletin.publish` | `bulletin` | Đăng bản tin | bản | 1 |
| any other | `other` | Việc khác | việc | 1 |

The campaign's `goals` sums `target` by `goal_key`, in the order of first appearance.

### C3. Candidates (web → agent)

`GET /api/internal/agent/campaigns/candidates?day=YYYY-MM-DD` uses the agent token; the cooperative comes from the token. Answer:

```json
{
  "day": "2026-11-27",
  "proposals": [{
    "id": "uuid", "kind": "harvest.approve", "risk": "high", "title_vi": "Duyệt thu hoạch",
    "created_at": "ISO", "parcel_codes": ["P-TC-002"], "goal_key": "harvest", "target": 1,
    "involves_spraying": false, "people_needed": 0
  }],
  "rain_parcel_codes": ["P-TC-001"],
  "withdrawal_parcel_codes": ["P-TC-003"],
  "people_available": null
}
```

- `proposals` holds every `proposed` proposal of the cooperative that is not expired.
- `parcel_codes` comes from the subjects or payload: the parcel of a harvest, the codes in a household template's `parcel_codes`, the parcel of a journal entry. It is empty when the proposal names none.
- `involves_spraying` is `false` and `people_needed` is `0` for every kind in today's catalogue. A8 and mini-app kinds fill them later.
- `rain_parcel_codes` lists the cooperative's parcels whose weather cache forecasts at least 5 mm of rain in the next 12 hours.
- `withdrawal_parcel_codes` lists parcels with a non-draft spraying activity still inside its withdrawal period on that Vietnam day. This is the A1 and A4 rule; reuse its helper.
- `people_available` stays `null` until the staff app reports attendance (M10).

### C4. Campaign creation (agent → web)

`POST /api/internal/agent/campaigns`, agent token:

```json
{
  "day": "2026-11-27",
  "items": [{"proposal_id": "uuid", "position": 1}],
  "dropped": [{"proposal_id": "uuid", "rule": "withdrawal"}],
  "summary_vi": "...",
  "run_id": "uuid"
}
```

The web:
1. Checks with zod: 1 to 15 items with positions 1..n; `rule` is one of `withdrawal`, `rain`, `people`, `overflow`; `summary_vi` is 1 to 400 characters; `run_id` belongs to the cooperative.
2. Checks each item again: the proposal is `proposed` and belongs to the cooperative. Otherwise it answers 400 `INVALID_CAMPAIGN`.
3. Recomputes `goal_key` and `target` with C2 (it never trusts the agent for them) and builds `goals`.
4. Inserts the campaign. If one exists for the cooperative and day, it answers 200 `{ "existing": true, "id": "..." }` and does nothing else. Otherwise it answers 201 `{ "id": "..." }`.
5. Queues the C6 Telegram message to linked managers and sets `telegram_sent`.

`dropped` is stored only in the run's audit event `agent.campaign.created` (`{day, items, dropped}`). Dropped proposals stay `proposed`.

### C5. Rules of A9 (agent, `platform/agent/dxos_agent/agents/daily_campaign.py`)

Applied in this order to `proposals`:
1. **`withdrawal`:** `harvest.approve` whose `parcel_codes` meet `withdrawal_parcel_codes`.
2. **`rain`:** `involves_spraying` and `parcel_codes` meet `rain_parcel_codes`.
3. **Sort:**
   - by kind weight: `harvest.approve` 1, `disease.inspection` 2, `notification.households` 3, `journal.reject` 4, `journal.approve` 5, `notification.internal` 6, `bulletin.publish` 7, other 9;
   - then `created_at` ascending, then `id`.
4. **`people`:** when `people_available` is a number, keep items while the running sum of `people_needed` stays at or below it. The others are dropped.
5. **`overflow`:** keep the first 15. The rest are dropped with this rule and stay open for tomorrow.

Then:
- No item left → no campaign is posted. The run finishes `ok` with no LLM call.
- `summary_vi`:
  - the LLM gets only the kept items' `title_vi`, their goals and the day, and answers `{"summary_vi": "..."}` (at most 400 characters, two sentences);
  - with no provider or on any provider error, the text is `Hôm nay có <n> việc: <count> <label_vi>, …` (goals in order; trimmed to 400).
- Schedule: `DailySchedule(time(6, 0))` (Vietnam time), run after A2, A4 and A3 in the cycle. A4 moves to `time(5, 30)` and A3 to `time(5, 40)`, so the morning's warnings are ready before 06:00.
- Run: `agent='daily-campaign'`, `trigger='schedule'`, provider chain from settings agent `daily-campaign`, usage and cost like A1.

### C6. Telegram (web)

The campaign message goes to linked managers. It has at most 8 lines:

```
Chiến dịch ngày <dd/MM>: <n> việc
<summary_vi>
1. <title_vi> · <goal line>
… up to 4 items, then "… và <n-4> việc khác"
```

The goal line is `<target> <unit_vi>`, for example `1 thửa`.

**Buttons** use v1 callback data on the campaign id. `CallbackOp` gains:
- `A`: approve all → `Duyệt cả chiến dịch`;
- `L`: list items → `Xem từng mục`;
- `D`: drop → `Bỏ chiến dịch`.

`signCallbackData` and `verifyCallbackData` accept them. The id is a campaign id for these ops and a proposal id for `a` and `r`.

**Behaviour:**
- **`A`:** runs C7 approve-all as the presser, then edits the message to `Đã duyệt chiến dịch: <x> việc đã chạy, <y> việc chờ xác nhận riêng, <z> việc chuyển người đủ quyền.`, with no buttons. A failed item adds ` <f> việc lỗi.`.
- **`L`:** sends each undecided item's existing proposal message (with its Duyệt and Từ chối buttons) to this chat.
- **`D`:** sets `dropped` and edits the message to `Đã bỏ chiến dịch hôm nay.`.
- Presses re-check the live role. Only managers and officers may press. A press on a campaign that is no longer `draft` or `partial` answers `Chiến dịch đã được xử lý.`.
- `/chiendich` in a private chat sends today's campaign message to the user, or `Hôm nay chưa có chiến dịch.`. This replaces the M5 `notYet` for that command.

### C7. Decisions (web, `apps/web/src/application/agent/campaign/`)

**`ApproveCampaignUseCase.execute(campaignId, tenant, userName, channel)`** returns `{ executed, waitingHigh, forwarded, failed, alreadyDecided }`:
- Items are taken in position order.
  - A `high` item counts as `waitingHigh` and is not run.
  - An item whose kind's `approverRoles` exclude the tenant's role counts as `forwarded`. `TelegramNotifier.enqueueProposal` sends it to the linked users who may decide it.
  - Every other item goes through `DecideProposalUseCase` (`approve`):
    - `executed` counts;
    - `already_decided` counts as `alreadyDecided`;
    - `stale`, `expired` and `failed` count as `failed`.
  - One item's outcome never stops the others.
- The campaign becomes `approved` when nothing is waiting or forwarded, and `partial` otherwise. `decided_by`, `decided_by_name` and `decided_at` are set.
- The audit event `agent.campaign.approved` carries the counts.

**`DropCampaignUseCase`:**
- Only from `draft` or `partial`.
- Sets `dropped` and the deciders, and writes the audit event `agent.campaign.dropped`.

**Item decided elsewhere:** after `DecideProposalUseCase` decides a proposal that is an item of a `draft` campaign, that campaign becomes `partial`. Do this in the use case, after the decision, without changing its outcome.

### C8. Web inbox (manager and officer AI pages)

**Routes:**
- `GET /api/agent/campaigns/today` (manager, officer) answers `{ campaign: null }`, or the campaign with its items: position, proposal id, kind title, status, risk, goal line.
- `POST /api/agent/campaigns/[id]/decision` with body `{ "decision": "approve_all" | "drop" }`:
  - manager or officer;
  - 409 when the campaign is not `draft` or `partial`;
  - answers the C7 counts.

Both routes go in the `miniApp` group of `coverage.ts` (test 17).

**`CampaignPanel` component above `ProposalInbox` on both AI pages:**
- header `Chiến dịch hôm nay`, the day and a status badge (`Chờ duyệt`, `Đã duyệt`, `Duyệt một phần`, `Đã xong`, `Đã bỏ`);
- the summary;
- the items, each with position, title, goal line and status, a `Rủi ro cao` tag on `high` items, and a link to the proposal in the inbox list below;
- buttons `Duyệt cả chiến dịch` (primary) and `Bỏ chiến dịch` (secondary, with a confirm dialog);
- after approve-all, a result line with the C7 counts;
- with no campaign, the panel is not shown.

In the inbox list, proposals that are items of today's campaign carry the tag `Trong chiến dịch hôm nay`.

### C9. 18:00 report (web, `TelegramNotifier.enqueueReport`, daily only)

When the cooperative has a campaign for the report's day that is not `dropped`:
1. Write `campaign_outcomes`. Per `goal_key`:
   - `target` is the goal's target;
   - `actual` is the sum of `target` over items whose proposal is `executed`.
2. Append to the report:
   - `Chiến dịch hôm nay: <executed items>/<items> việc xong`;
   - up to 3 lines `• <label_vi>: <actual>/<target> <unit_vi>`;
   - `Chưa xong: <k> việc` when `k > 0`.
3. A campaign with every item decided becomes `done`.

The report keeps its 8-line limit. The campaign lines replace the lowest-priority figure lines when needed.

### C10. Settings

- `CONFIGURABLE_AGENTS` and `KNOWN_AGENTS` gain `'daily-campaign'`.
- Label: `Chiến dịch ngày (A9)`.
- Share text: `Tên các việc đề xuất hôm nay và mục tiêu của chúng (số thửa, số nhật ký). Không có tên hay số điện thoại của nông hộ.`.

---

## Tracks

Three parallel sessions start from the commit of this plan, each in its own worktree and branch, and merge into `feat/55-agentic-m7`.
- Keep to your files.
- Follow C1–C10 exactly.
- If a contract cannot work as written, build the closest version and say exactly what differs in the report.

| Track | Branch | Owns |
|---|---|---|
| W web | `feat/55-agentic-m7-web` | `apps/web/**`, `platform/postgres/init/08-agent.sql`, `docs/api-contract.md`, `docs/database-schema.md` |
| A agent | `feat/55-agentic-m7-agent` | `platform/agent/**` |
| I smoke and docs | `feat/55-agentic-m7-infra` | `platform/tests/**` except `platform/agent/tests`, `docs/rules-and-limits.md`, `README.md` |

### Track W — web

**W-1: tables and repository**
- Add C1 to `08-agent.sql` and the migration.
- Add `CampaignRepository` (port and Prisma): `create`, `findForDay`, `findById`, `items`, `setStatus`, `itemOfDraftCampaign(proposalId)`, `writeOutcomes`.
- [ ] Repository tests.
- [ ] Throwaway Postgres check of every method (container `dxos-m7-web-pg`, port `127.0.0.1:55441`).
- [ ] Commit.

**W-2: goals, candidates and creation routes**
- C2, C3, C4.
- [ ] Tests:
  - the goal table;
  - candidates: parcel codes per kind, withdrawal parcels with a spraying entry inside its period, rain parcels from a cache row with 6 mm, and no LB rows;
  - creation: zod refusals, a foreign proposal → 400, `second campaign of the day returns the first`, goals recomputed, the Telegram message queued once.
- [ ] Commit.

**W-3: decisions and Telegram**
- C6, C7, `/chiendich`, and the callback ops.
- [ ] Tests:
  - `approve all runs allowed items, keeps high items and forwards the rest` (test 14);
  - `approve all continues past a stale and an already decided item`;
  - `deciding an item moves a draft campaign to partial`;
  - drop only from draft or partial;
  - callback `A`, `L` and `D` as a manager, refused for a farmer, and on a dropped campaign;
  - a v1 `a` with a campaign id is refused (the proposal lookup fails);
  - `/chiendich` with and without a campaign;
  - existing M2 and M5 tests stay green.
- [ ] Commit.

**W-4: inbox panel and routes**
- C8.
- [ ] Route tests, plus component tests for the empty state (no panel), a draft with a high item, the approve result line and the drop confirm.
- [ ] Headless browser check at 1280 and 390 px, light and dark, with screenshots in the scratch folder: no horizontal overflow, no text under 11 px.
- [ ] Commit.

**W-5: report and settings**
- C9, C10, and docs (`api-contract.md`, `database-schema.md`).
- [ ] Tests: report lines for a campaign with 3 goals and 2 unfinished items, the outcomes written, `done` when everything is decided, and no campaign lines for a dropped campaign.
- [ ] Run the whole Jest suite, lint, `tsc --noEmit` and `prisma validate`. Report the counts. Commit.

### Track A — agent A9

**A-1: gateway calls.** `get_campaign_candidates(day)` and `post_campaign(body)` in `client.py`, with tests.

**A-2: rules and scenarios**
- `daily_campaign.py` per C5, with a `tests/scenarios/a9_daily_campaign.json` replay suite. At least:
  - withdrawal drops a harvest (test 15);
  - rain drops a spraying item (test 15);
  - people limit (test 15);
  - order by weight and age;
  - overflow keeps 15;
  - no candidates → nothing posted;
  - provider error → fallback summary;
  - summary over 400 characters → trimmed.
- The scenario format follows the A1 and M4 files.

**A-3: schedule**
- A9 at 06:00 after A2, A4 and A3; A4 at 05:30, A3 at 05:40.
- [ ] Tests that the cycle order holds and that A1 to A7 are unchanged.

**A-4: checks.** `PYTHONPATH=platform/agent uvx --python 3.12 pytest platform/agent/tests -W error`. Report counts. Commit.

### Track I — smoke and docs

**I-1: `platform/tests/smoke-campaign.sh`**

Sourced by `smoke-agentic.sh` after `smoke-assistant.sh`; adds no PASS line to `make platform-smoke`.

- Setup:
  - stop `dxos-agent` before seeding;
  - create TC proposals through `POST /api/internal/agent/proposals` with the TC agent token, the way the M1 smoke calls internal routes. Create one `notification.internal` (manager, low) and one `harvest.approve` on a parcel that passes A4's rules (high). Use the payload and evidence shapes the M4 smoke and agent use.
  - remove any TC campaign of today, then restart the agent so A9 runs on its first cycle.
- Assertions:
  - a TC campaign row for today exists with both items;
  - the stub got a message to the linked manager (`TG_OWNER`) containing `Chiến dịch ngày` with a `Duyệt cả chiến dịch` button;
  - pressing it executes the internal notice and leaves the harvest proposal `proposed`, and the message is edited to the C6 result line (test 14);
  - the campaign is `partial`.
- [ ] `test_smoke_scripts.py` checks: ordering, the agent stopped before seeding, cleanup.

**I-2: docs**
- `docs/rules-and-limits.md`:
  - the campaign rules (C5, max 15, one per day);
  - approve-all limits (C7);
  - the 06:00 and 18:00 times;
  - the new A4 and A3 times.
- `README.md`: one paragraph on the daily campaign.

**I-3: checks.** Run `pytest platform/cli/tests platform/tests platform/telegram/tests -W error` (with `PYTHONPATH=platform/telegram`) and `bash -n`. Report counts. Commit.

## Integration (main session)

1. Merge W, A and I into `feat/55-agentic-m7`.
2. Cross-track check on a throwaway Postgres:
   - A9's scenario candidates go through the real candidates and creation routes' use cases;
   - approve-all runs through the real `DecideProposalUseCase`.
3. Add the spec post-release notes (§21) and update the M7 row in #55.
4. Open the PR. Merge when CI is green on the exact head and there are no AI trailers.
