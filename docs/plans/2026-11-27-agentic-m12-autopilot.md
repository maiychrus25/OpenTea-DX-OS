<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M12: autonomous mode — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a manager can switch a cooperative to autonomous mode.
- Agent proposals of the allowed kinds then run without a person's approval, after a blocking window in which anyone may block them.
- People supervise: reports, a Block button, and `/dung` to stop at once.
- Five hard limits (H1–H5), daily caps and anomaly brakes keep it safe. The mode stops by itself when its conditions fail.
- In normal mode every proposal records whether it would have run (shadow), so the enable screen shows a match rate per kind.

**Architecture:**
- **The web decides everything.**
  - When a proposal is created, the web computes `shadow_auto`.
  - When the mode is on, it sets `run_at` from the kind's risk.
- **A tick runs due proposals.** `POST /api/internal/autopilot/tick`, called every minute by `dxos-agent`, re-checks every condition at run time and runs the proposal through the existing `DecideProposalUseCase` as the manager who enabled the mode, with channel `autopilot`. No new execution path.
- **Every change is audited.** Turning the mode on or off, blocking, a brake firing and an auto-run each write an audit event and a Telegram message.

**Tech Stack:** Next.js 14 + Prisma (raw SQL for `platform.*`) + zod (`apps/web`), Python 3.12 standard library (`platform/agent`), PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §11 (all), §13.3 (the "Sắp tự chạy" and "Tự vận hành" reports), §13.5 (`/tuvanhanh`, `/dung`), §15 tests 18–25 and 31, milestone row M12.

## Scope

| In M12 | Later |
|---|---|
| The mode for the current catalogue: `auto` kinds run; `unlockable` kinds (`harvest.approve`, `notification.broadcast` when it exists, `journal.approve`) only when opened at enable time | Money actions of mini-apps (M9), member admission (no kind yet), mini-app install and remove (M13), `strategy.adopt` (M11, 48 h window). The table and the windows already list them, so those milestones only add kinds. |
| `agent.settings.update` runs on its own only when every change tightens (M8 `SETTING_KEYS`) | — |
| Blocking windows, Telegram "Sẽ tự chạy" with Chặn and Xem, `/dung`, `/tuvanhanh`, the web stop button | — |
| Caps (50 auto-runs per day; 2 automatic messages per household per day) and the four brakes | Money caps (M9) |
| Shadow `shadow_auto` and the match rate on the enable screen | — |
| Auto-stop: the enabler loses the manager role or is disabled; 7 days without manager interaction; a brake | — |

## Global Constraints

- **Repository rules:** `AGENTS.md`.
  - English Conventional Commits and English identifiers.
  - Vietnamese user-facing text with diacritics.
  - SPDX headers on new files.
  - No secrets, no new dependency.
- **The hard limits hold whatever the settings** (spec §11.1):
  - **H1.** Every auto-run goes through `DecideProposalUseCase`, and so through the same use case and business checks as a person's decision.
  - **H2.** No catalogue action can change the mode, the hard limits, the catalogue, roles, keys, budgets, data policy or the audit. No kind may be added for that. Test 19 checks the catalogue.
  - **H3.** Disease report review never runs on its own. It is not a catalogue kind, and test 18 pins that.
  - **H4.** No delete kind exists or runs.
  - **H5.** Every auto-run writes the audit event and a Telegram message.
- **Who it runs as.** An auto-run acts as the enabling manager, with role `manager`.
  - Kinds a manager may not decide never run on their own. They stay `proposed` for their approvers.
  - The audit actor is `autopilot:<agent>`, with `enabled_by`.
- **Proposals that never run on their own.** Proposals with `origin: 'user'` (chat cards, MCP) never run on their own (M14 test 38).
- **Stopping and resuming.** Stopping returns every pending window to normal approval: `run_at` is cleared and the proposal stays `proposed`. The mode is turned on again only on the web.
- **Turning the mode on.** Only a manager can turn it on, and the session's `auth_time` must be at most 5 minutes old (re-login). The enable screen's content is saved in the audit event.
- **Unchanged behaviour:**
  - In normal mode, approval behaviour stays exactly as in M1–M14.
  - Shadow recording never changes a proposal's path.

## Review Focus

1. **Blocked or stopped during the window.**
   - Block, `/dung`, or a stop just before `run_at` means the tick never runs the proposal.
   - Blocking after it ran answers `Đã chạy` (test 20).
   - Test: W-3 `tick never runs a blocked or stopped proposal`; W-4 `block after run answers already ran`.
2. **Conditions change between scheduling and the tick.** The enabler is demoted or disabled, a cap is reached, or the proposal went stale. The tick re-checks all of them, runs nothing, and the mode stops or the proposal returns to normal (tests 22, 23).
3. **Two ticks at once.** Two ticks never run a proposal twice. The claim is `UPDATE … SET run_claimed_at … WHERE run_at <= now() AND run_claimed_at IS NULL … RETURNING`.
4. **Loosening a setting in autonomous mode.** An `agent.settings.update` with any loosening change, or a change that disables an agent, never gets a `run_at` and always waits for a person (test 31).
5. **Kinds that must wait.** Each `never` kind and each `unlockable` kind that was not opened gets no `run_at` (test 18). An `origin: 'user'` proposal never gets one either.

---

## Contracts

### C1. Tables (`08-agent.sql` and migration `20261127120000_autopilot`)

```sql
CREATE TABLE IF NOT EXISTS platform.autopilot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  enabled_by text NULL, enabled_by_name text NULL, enabled_at timestamptz NULL,
  unlocked_kinds text[] NOT NULL DEFAULT '{}',
  daily_cap integer NOT NULL DEFAULT 50 CHECK (daily_cap BETWEEN 1 AND 50),
  stopped_at timestamptz NULL, stopped_by text NULL,
  stop_reason text NULL CHECK (stop_reason IN ('manual','enabler_lost','inactive','brake_failures','brake_cap','brake_blocks','brake_volume')),
  last_manager_activity_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS shadow_auto boolean NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS run_at timestamptz NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS run_claimed_at timestamptz NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS blocked_by text NULL;
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS blocked_at timestamptz NULL;
-- partial index on (run_at) WHERE run_at IS NOT NULL AND run_claimed_at IS NULL AND status = 'proposed'
```

- `decision_channel` gains `'autopilot'`, in the domain type and in any CHECK.
- `platform.autopilot` gets the audit row trigger.

### C2. Eligibility (`apps/web/src/application/agent/autopilot/eligibility.ts`)

`autoEligibility(proposal, definition, config): { eligible: boolean; reason: string }`. The function is pure. A proposal is **eligible** when all of these hold:
1. `origin === 'agent'`;
2. `definition.autonomy === 'auto'`, or it is `'unlockable'` and the kind is in `unlocked_kinds`;
3. `definition.approverRoles` includes `'manager'`;
4. for `agent.settings.update`, every change in the payload tightens (`SETTING_KEYS` direction), no key is unknown, and schedule-only changes count as tightening;
5. for `journal.approve`, the proposal's evidence has no rule warning (A1 only proposes approval for clean entries; check `payload.warnings` is empty or absent).

`shadow_auto` is the eligibility computed with every `unlockable` kind treated as opened. It is recorded on every proposal at creation, in either mode.

**Window by risk** (`windowFor(definition)`):

| Risk | Window |
|---|---|
| `low` | 0 |
| `medium` | 15 min |
| `high` | 2 h |
| money kinds (none yet) | 2 h |
| `strategy.adopt` | 48 h |

**At creation:** when the mode is on and the proposal is eligible, `run_at = now + window`. A window of 0 means the next tick.

### C3. Tick (`POST /api/internal/autopilot/tick`)

- Guard: an agent token of any cooperative. The tick handles only the token's cooperative.
- Steps:
  1. **Auto-stop checks:**
     - the enabler's live role is not `manager`, or the enabler is disabled → `enabler_lost`;
     - `last_manager_activity_at` is more than 7 days ago → `inactive`.
  2. **Brakes** (stop with their reason):
     - at least 3 auto-run failures (`failed` or `stale` outcome) in the last hour → `brake_failures`;
     - auto-runs today ≥ `daily_cap` → `brake_cap`;
     - blocked / (blocked + auto-run) > 0.3 today, with at least 5 decided → `brake_blocks`;
     - any agent's proposals today greater than 3 × its 14-day daily average (with an average ≥ 1) → `brake_volume`.
  3. **Claim and run.** Claim due proposals with the C1 claim statement (at most 20). Run each through `DecideProposalUseCase` with:
     - `tenant` = the enabler as manager;
     - `userName` = `AI tự thực hiện (bật bởi <enabled_by_name>)`;
     - `channel` = `'autopilot'`.
  4. **Household message cap.** Before running a `notification.households` proposal, check that each target household has fewer than 2 automatic messages today. Otherwise clear `run_at`, so the proposal waits for a person.
- **Stopping**, whatever the reason:
  - set `enabled = false`, `stopped_at`, `stop_reason`;
  - clear `run_at` and `run_claimed_at` of every pending proposal;
  - write the audit event `autopilot.stopped`;
  - send the Telegram message to every linked manager and officer.
- **Answer:** `{ ran, failed, returned, stopped: reason | null }`.
- **Audit:** each auto-run's decision event carries `actor: 'autopilot:<agent>'` and `enabled_by`.

### C4. Enable, stop and status (web)

- **`GET /api/agent/autopilot`** (manager, officer). Answers:
  - the status;
  - for each catalogue kind: `autonomy`, `risk`, window, `shadow` match rate over 30 days, and sample size;
  - today's counts.
- **The match rate** of a kind is the share of decided proposals (not expired) where `shadow_auto` equals "it was approved". Below 90% it shows a warning.
- **`POST /api/agent/autopilot/enable`** (manager only) with body `{ unlocked_kinds, daily_cap, acknowledged: true }`:
  - 401 `REAUTH_REQUIRED` when the session's `auth_time` is older than 5 minutes;
  - 400 when not acknowledged or a kind is not `unlockable`.
  - Writes the audit event `autopilot.enabled` with the full screen snapshot (the kinds, rates and caps shown), notifies all linked managers and officers, and sets `last_manager_activity_at = now`.
- **`POST /api/agent/autopilot/stop`** (manager, officer): stop with reason `manual`.
- **Manager activity:** any manager request to the AI inbox, a decision, or a Telegram press or message by a manager updates `last_manager_activity_at`. This is a cheap update, at most once a minute per cooperative.
- **UI on `manager/ai/settings`:** a new section "Tự vận hành".
  - Mode off:
    - the list of kinds in three groups: auto-runs, can be opened (with checkboxes), always needs a person;
    - each kind's match rate with the warning under 90%;
    - the daily cap;
    - an acknowledgement checkbox `Tôi hiểu các việc trên sẽ tự chạy dưới tên tôi và tôi chịu trách nhiệm như khi tự duyệt`;
    - the button `Bật tự vận hành`. Without a fresh login, the button first says `Đăng nhập lại để bật` and sends the person through sign-in.
  - Mode on: the status, today's counts, and a red `Dừng ngay` button.
  - Officers see the status and `Dừng ngay` only.
  - `DESIGN.md`, light and dark, 390 px.

### C5. Telegram (web)

- **Before the run.** When a proposal gets a non-zero `run_at`, the approvers of its kind get `Sẽ tự chạy lúc <HH:mm>: <titleVi> — <first preview line>` with the buttons:
  - `Chặn` (v1 callback op `b`) blocks it: sets `blocked_by` and `blocked_at`, clears `run_at`, and leaves the proposal `proposed` for normal approval. It counts as a block for the brakes and for quality.
  - `Xem` (op `v`) sends the normal proposal message with Duyệt and Từ chối.
- **After the run.** The message is edited to `AI đã tự thực hiện lúc <HH:mm>.`. A `Chặn` press after the run answers `Đã chạy, không chặn được nữa.` (test 20).
- **`/dung`** (manager or officer, private chat) stops the mode at once: `Đã dừng tự vận hành. Các việc đang chờ chuyển về chờ duyệt.` (test 21). With the mode already off: `Tự vận hành đang tắt.`.
- **`/tuvanhanh`** shows the status and today's counts.
- **The 06:00 campaign message** in autonomous mode starts with `Chiến dịch hôm nay sẽ tự chạy`. Each item that has a `run_at` lists its time.
- **The 18:00 report** adds a section `Tự vận hành: <ran> việc đã tự chạy, <blocked> bị chặn, <brakes> lần phanh, chi phí <usd> USD` when the mode was on during the day.
- **Messages to households** sent by an auto-run end with `(Tin do AI của HTX gửi)`.

### C6. Agent

- `dxos-agent` posts `POST /api/internal/autopilot/tick` once every main-loop cycle (30 s) for each cooperative with credentials.
- The tick is cheap when the mode is off. A failed tick is logged, and the loop goes on.
- No other agent change. Every M4 agent finds its problems by rules (A1's decision is rule-based too), so the spec's "only rule-detected actions run when the LLM fails" holds already. The plan records this in the spec notes.

---

## Tracks

| Track | Branch | Owns |
|---|---|---|
| W1 engine | `feat/55-agentic-m12-engine` | `apps/web/src/application/agent/autopilot/**`; `DecideProposalUseCase` (channel and actor only); `CreateProposalUseCase` (shadow and `run_at`); the proposals repository; the tick route; the C1 SQL and migration; `docs/database-schema.md`; `docs/api-contract.md` |
| W2 surfaces | `feat/55-agentic-m12-surfaces` | the C4 routes and UI; the C5 Telegram parts (`TelegramUpdateHandler` commands and buttons, the notifier messages, the campaign message and the report section, the household suffix); `coverage.ts` rows |
| A agent | `feat/55-agentic-m12-agent` | `platform/agent/**` (the tick call) |
| I smoke and docs | `feat/55-agentic-m12-infra` | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

W1 and W2 share `apps/web/src/application/agent/autopilot/types.ts`, committed with the plan. It exports `AutopilotConfig`, `AutopilotStatus`, `StopReason`, `autoEligibility`'s signature, `windowFor`'s signature, and the repository port `AutopilotRepository`.

### Track W1 tasks

- **W1-1.**
  - [ ] C1 SQL, the repository, and a throwaway Postgres check, including the concurrent claim (two connections claim the same due row, and only one gets it).
- **W1-2.**
  - [ ] C2 eligibility and windows, with tests:
    - every catalogue kind's result in normal config;
    - every kind with each unlock;
    - user origin;
    - loosening, tightening and mixed settings changes;
    - `journal.approve` with warnings;
    - test 18 (every `never` kind and every unopened `unlockable` kind is not eligible);
    - test 19 (no catalogue kind targets the mode, the catalogue, roles, keys, budgets, data policy or the audit: assert the catalogue kinds are exactly the known list, and none of their `execute` touches `platform.autopilot`).
- **W1-3.**
  - [ ] Hook into creation (shadow and `run_at`), and the C3 tick with the stop logic and brakes. Tests:
    - each brake;
    - each auto-stop;
    - `tick never runs a blocked or stopped proposal`;
    - the stale outcome counts as a failure;
    - the actor and `enabled_by` in the audit (test 24);
    - test 23: a harvest proposal for a parcel in its withdrawal period is refused by the use case and not executed;
    - the household cap;
    - the claim is exclusive.
- **W1-4.**
  - [ ] Docs. The whole Jest suite, lint, `tsc`.

### Track W2 tasks

- **W2-1.**
  - [ ] C4 routes and the match rate (test 25: rates computed on seeded decided proposals).
- **W2-2.**
  - [ ] The UI section. Component tests. A headless check at 1280 and 390 px, light and dark.
- **W2-3.**
  - [ ] C5 Telegram. Tests:
    - `Chặn` before and after the run (test 20);
    - `/dung` by an officer stops it and returns windows (test 21);
    - `/tuvanhanh`;
    - the campaign header;
    - the report section;
    - the household suffix;
    - `block after run answers already ran`.
- **W2-4.**
  - [ ] Coverage rows (test 17). The whole Jest suite, lint, `tsc`.

### Track A tasks

- **A-1.**
  - [ ] `post_autopilot_tick()` in `client.py`, and the call in the main loop after the M4 agents. Tests:
    - one call per cooperative per cycle;
    - a failure is logged and the loop goes on;
    - no other behaviour changes.

### Track I tasks

- **I-1: `smoke-autopilot.sh`.**
  - Seed and turn on the mode for TC directly in SQL. This is a smoke shortcut: the enable route needs a fresh browser login. Set the enabler to `smoke_manager_tc`.
  - Assertions:
    - an `auto` `notification.internal` proposal created through the internal route runs on the next tick (it is low risk) and is `executed` with channel `autopilot`;
    - a medium proposal gets `run_at` about 15 minutes ahead, and the `Chặn` button from the stub blocks it;
    - `/dung` from the linked manager stops the mode, and every pending `run_at` is cleared;
    - a loosening `agent.settings.update` never gets `run_at` (test 31).
  - Restore on exit.
- **I-2: docs.**
  - [ ] `rules-and-limits.md` (§11 limits, windows, caps, brakes) and `README.md`.

## Integration (main session)

1. Merge the tracks.
2. Cross-track check on a throwaway Postgres:
   - create, then tick, then the real `DecideProposalUseCase`;
   - each brake and each stop on seeded rows.
3. Spec notes. PR. Merge when CI is green.
