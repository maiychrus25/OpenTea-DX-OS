<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M10: staff tasks A8 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every morning, agent A8 proposes work for the cooperative's staff (`staff.task.create`), with a suggested assignee, from what the other agents found.
- A manager approves the proposal on the web or Telegram.
- The staff desktop app pulls approved tasks from the core every minute, creates them in its own database, and reports the new task id. The proposal is then `executed`.
- The staff app also reports its roster (for the suggested assignee) and today's attendance (for A9's people rule).
- Done when a task approved in Telegram shows up in the staff app on a phone. Test 42: a cooperative's pull returns only its own approved tasks.

**Architecture:**
- **D14: the core never calls the staff app.** The staff app's machine may have no reachable address, so the staff app pulls.
- **A new per-cooperative Keycloak client** `dxos-staff-<htx>` (role `staff-sync`, the `htx_code` claim), provisioned by `./dxos staff enable <HTX>` the way `./dxos agent enable` provisions the agent client. Only the client id and secret go into the staff app's settings.
- **Approving a `staff.task.create` proposal does not finish it.** Its `execute` marks it `sent_to_staff_app` (result `{state: 'waiting_for_staff_app'}`), and the proposal stays visible as "đã gửi app nhân sự". The staff app's acknowledgement moves it to `executed` with the task id.

**Tech Stack:** Next.js 14 + Prisma + zod (`apps/web`), Python 3.12 standard library (`platform/agent`, `platform/cli`), .NET 10 (`apps/staff-desktop`), Keycloak.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` §9 (A8, staff apps), §5.2 (`dxos-staff`), D14 and issue #57, §6 (`staff.task.create`), §15 test 42, milestone row M10.

## Global Constraints

- **Repository rules:** `AGENTS.md`. No new dependency in the web, agent or CLI. The staff app uses `HttpClient` from .NET only.
- **Pull scope.** Every `/api/internal/staff/*` call is scoped to the token's `htx_code`. Another cooperative's client gets an empty list (test 42).
- **The staff app stays standalone.** With no core settings, the sync service does nothing and the app works as today.
- **Personal data.** The roster holds a staff id, name, department and active flag. Staff phone numbers and pay never leave the staff app.
- **Staff app versions.** The staff app's own version and changelog follow its existing rules (`apps/staff-desktop/CHANGELOG.md`).

## Review Focus

1. **Another cooperative's client** pulls and acknowledges: the list is empty, and acknowledging a foreign proposal answers 404 (test 42).
2. **A repeated acknowledgement** (the staff app restarts after creating the task but before recording the acknowledgement) is idempotent. The staff app keys tasks by `external_ref = proposal id` and never creates a second task.
3. **A task pulled but the proposal expired meanwhile.** The pull lists only `approved` and `sent_to_staff_app` tasks that are not expired. The acknowledgement of an expired one answers 409, and the staff app removes nothing it already created; it marks the task `cancelled` locally.
4. **Roster changes.** A suggested assignee who left (inactive) is never suggested again. A proposal with an inactive assignee is still created, without an assignee.
5. **No attendance report today.** A9's `people_available` stays `null` and its people rule is skipped (M7 C3).

---

## Contracts

### C1. Tables (`08-agent.sql`, migration `20261127170000_staff_sync`)

```sql
CREATE TABLE IF NOT EXISTS platform.staff_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL, staff_ref text NOT NULL,     -- the staff app's employee id
  name text NOT NULL, department text NULL, active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, staff_ref)
);
CREATE TABLE IF NOT EXISTS platform.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL, day date NOT NULL, present integer NOT NULL CHECK (present >= 0),
  reported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (htx_code, day)
);
ALTER TABLE platform.agent_proposals ADD COLUMN IF NOT EXISTS external_ref text NULL;  -- the staff app's task id
```

- Proposal status gains `sent_to_staff_app`, in the CHECK and the domain type. Only `staff.task.create` uses it.
- Both new tables get the audit row trigger.

### C2. `staff.task.create` (catalogue)

- Risk `medium`; approver `manager`; `autonomy: 'auto'`; channels web and telegram; `editableFields` `['assignee_ref','due_date','note_vi']`.
- Payload, strict:

  ```
  {
    title_vi: 1..120,
    note_vi?: ..500 (human only),
    parcel_id?: string,
    due_date: YYYY-MM-DD,
    assignee_ref?: string,
    source: {kind, proposal_id?}
  }
  ```

- `execute` sets the status `sent_to_staff_app` and returns `{state: 'waiting_for_staff_app'}`.
- The inbox and the Telegram message show `Đã gửi app nhân sự` until it is acknowledged.

### C3. Internal staff routes (token `dxos-staff-<htx>`, role `staff-sync`)

| Route | Body / answer |
|---|---|
| `GET /api/internal/staff/tasks` | `{data: {tasks: [{proposal_id, title_vi, note_vi, parcel_code, due_date, assignee_ref, approved_by_name, approved_at}]}}`: proposals of kind `staff.task.create` in status `sent_to_staff_app`, not expired, of the token's cooperative |
| `POST /api/internal/staff/tasks/{proposal_id}/ack` | `{task_id: string}` → 200. The proposal becomes `executed` with `external_ref = task_id`. 404 for another cooperative; 409 when not `sent_to_staff_app`; 200 when already acknowledged with the same `task_id` |
| `PUT /api/internal/staff/roster` | `{staff: [{staff_ref, name, department?, active}]}`, at most 500. It replaces the cooperative's roster (missing rows become inactive) |
| `PUT /api/internal/staff/attendance` | `{day: YYYY-MM-DD, present: n}`, for today (Vietnam) only |

The gateway routes `/api/internal/staff/*` on the internal port with a `claim_schema`: `azp` matches `^dxos-staff-[a-z0-9_-]{1,20}$` and the roles contain `staff-sync`.

### C4. A8 (`platform/agent/dxos_agent/agents/staff_tasks.py`)

- **Schedule:** daily at 05:50 Vietnam time, before A9.
- **Inputs:** `GET /api/internal/agent/staff/inputs`, which answers:
  - the cooperative's proposals approved in the last 24 h of the kinds `harvest.approve`, `disease.inspection` and `notification.households` (template `dry_soil` or `rain_after_spray`);
  - the active roster;
  - today's attendance.
- **Rules:**

  | Source | Task |
  |---|---|
  | `harvest.approve` executed | `Hái chè thửa <code>`, due today |
  | `disease.inspection` executed | `Kiểm tra bệnh quanh thửa <code>`, due today |
  | `dry_soil` | `Tưới thửa <code>`, due today |

  - At most 10 tasks a day.
  - The suggested assignee is the active staff member with the fewest tasks suggested today; the department `Kỹ thuật` is preferred for inspections.
  - The LLM is not used.
- **Proposals** have `agent: 'staff-tasks'` and the subject = the source proposal id. The repeat window is 24 h.

### C5. A9 people rule

- A9's candidates (M7 C3) fill `people_available` from today's `staff_attendance`.
- `people_needed` is 1 for `staff.task.create`, and 2 for a `harvest.approve` with an estimated yield over 500 kg.

### C6. Staff desktop app (`apps/staff-desktop`)

- **Settings:** a new section `Kết nối hệ thống lõi` with the core base URL (`https://` or `http://localhost…`), the client id and the secret. They are stored with the app's existing settings; the secret is protected with DPAPI on Windows and in a 0600 file on other systems.
- **`CoreSyncService`** (a `BackgroundService` in `TeaStaff.Infrastructure`), every 60 s when settings exist:
  1. gets a token by client credentials;
  2. `PUT` roster (from `IEmployeeRepository`);
  3. `PUT` attendance (today's present count);
  4. `GET` tasks: for each, creates a `WorkTask` with `ExternalRef = proposal_id`, unless one already exists, then acks with the task id.

  Errors are logged and retried on the next round. No error ever stops the app.
- **`WorkTask`** gains `ExternalRef` (nullable, unique), with a migration in the app's database scripts. Pulled tasks show `Từ trợ lý AI` in the task list.
- **Tests** in `TeaStaff.Core.Tests` (or a new `TeaStaff.Infrastructure.Tests`) with a fake `HttpMessageHandler`:
  - idempotent create;
  - ack after create;
  - an expired 409 marks the task `Cancelled`;
  - roster and attendance bodies;
  - no settings → no calls.

---

## Tracks

| Track | Owns |
|---|---|
| W web | `apps/web/**`, `08-agent.sql`, docs `api-contract.md` and `database-schema.md` |
| P platform | `platform/cli/**` and `dxos` (`staff enable` and `staff disable`), `docker/keycloak/realm-agrimarket.json` (role `staff-sync`), `platform/gateway/apisix.yaml` |
| A agent | `platform/agent/**` (A8, the A9 inputs) |
| D staff app | `apps/staff-desktop/**` |
| I smoke and docs | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

Tasks per track follow the contracts with test-first steps and the Review Focus tests.

**Track D** runs `dotnet build AppManageStaff.sln -c Release` and `dotnet test AppManageStaff.sln -c Release`. The CI runs the same on Windows.

**The I smoke** acts as the staff app with `curl` and a `dxos-staff-tc` token:
- push a roster and attendance;
- seed an executed `harvest.approve`;
- restart the agent;
- assert a `staff.task.create` proposal with an assignee;
- approve it through Telegram;
- pull it as TC and get it, and pull it as LB and get an empty list (test 42);
- ack it, and assert `executed` with `external_ref`.
