<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M13: mini-app factory A12 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a manager writes "cần app theo dõi kho phân bón" on Telegram or the web. Agent A12 takes the cheapest path that does the job:
1. enable an app the store already has;
2. propose a Sổ tự tạo book;
3. or write a new mini-app.

For a new app:
- A12 asks up to 5 questions and writes a short Vietnamese spec, which the manager approves (`app.spec.approve`).
- A coding tool builds the app in a fresh, locked container, starting from `miniapps/hello` and the kit.
- Seven gates check the result; the coding tool fixes failures for up to 3 rounds.
- The manager gets four screenshots on Telegram and approves `miniapp.install`, which enables the app for the requesting cooperative only.

Done when, from one Telegram request, a fertiliser-stock app is built, passes every gate, is approved and runs. Tests 26–30.

**Architecture:**
- **A12 runs in `dxos-agent`.** It decides the path, asks the questions and writes the spec, all through internal web routes.
- **The build runs on the host.** A loop `./dxos builder`, shaped like `./dxos worker`, takes approved requests one at a time. For each round it starts three throwaway containers of the `dxos-builder` image:
  - **`build`:** the coding tool. It sees only `/work`, it reaches the internet only through an allowlist proxy, and its only key is the coding tool's.
  - **`gates`:** no network, `/work` read-only, the gate code taken from the image.
  - **`review`:** a second AI reads the code for security problems.
- **Each app is its own git repository** in `generated-apps/<htx>/<app id>`, with one tag per passed version.
- **Install.** The tag is exported to the runtime folder, and the existing store worker installs it for the owning cooperative only. Each generated app gets a private network that holds only `apisix` and `postgres`.

**Tech Stack:**
- Next.js 14 + zod (`apps/web`);
- Python 3.12 standard library (`platform/agent`, `platform/cli`, `platform/builder`, `platform/telegram`);
- the `dxos-builder` image: Playwright for Python base, Claude Code and Codex CLI, PostgreSQL 16, and a wheelhouse of the allowed requirements.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md`:
- §12 (12.1 to 12.9);
- §6 (`app.spec.approve`, `miniapp.install`, `miniapp.remove`);
- §8 (`claude-code`, `codex-cli`, `replay`);
- §11.1 (H2);
- §15 tests 26–30 and demo step 7;
- milestone row M13.

## Scope

| In M13 | Later |
|---|---|
| Requests by chat and web, up to 5 questions, the three paths, the spec and `app.spec.approve` | A11 proposing an app from its `miniapp` initiatives (same route, add with M11 follow-up) |
| `dxos-builder`, the proxy, the seven gates, 3 fix rounds, git tags, the `replay` tool for CI | — |
| Screenshots on Telegram; `miniapp.install` / `miniapp.remove` for store and generated apps; the store label; the private network | The interactive preview in the Mini App on sample data (needs M6's HTTPS domain and a preview instance) |
| — | Revisions ("thêm cột số lô") as new versions through `./dxos upgrade`: same path with `version` bumped, separate PR |

**Order:** M13 runs after M9. It relies on:
- M9's `generated: true` rule in `dxos validate` (test 29);
- the dynamic catalogue for `app.custom-books.book.create`.

## Global Constraints

- **Repository rules:** `AGENTS.md`.
- **New dependencies live only in the `dxos-builder` image**, pinned by tags at least two weeks old, and recorded in `DEPENDENCIES.md` with licences:
  - the Playwright for Python base image (Apache-2.0);
  - `@openai/codex` (Apache-2.0);
  - `@anthropic-ai/claude-code` (proprietary, Anthropic terms: installed at image build only when `DXOS_BUILDER_TOOLS` includes `claude-code`, never committed);
  - PostgreSQL 16 from the distribution.
- **Allowed app libraries.** `platform/builder/allowed-requirements.txt` holds the union of the exact pins in the existing mini-apps' `requirements*.txt`, each with its OSI licence in a comment. A generated app may use only these lines.
- **Generated apps:**
  - the ids match `^gen-[a-z0-9-]{3,30}$`;
  - the builder (not the AI) writes `generated: true` into `app.yaml`;
  - `dxos validate` refuses `generated: true` with a non-`gen-` id and the reverse.
- **No path around the gates.** The catalogue lists a generated app only from a `passed` build whose request has an approved spec. The worker re-checks this when it claims the request (test 28).
- **Builder isolation (test 30):**
  - The `build` container gets:
    - only the coding tool's key, base URL and model;
    - `HTTPS_PROXY`;
    - `/work` as its only bind mount.
  - It does not get the Docker socket, the core's env or the compose networks of the core.
  - The run is limited to 30 minutes (`timeout 1800`) and 60 turns per round.
- **One active request per cooperative** (§12.1).
- **Only Ollama configured:** A12 offers only paths 1 and 2, and says that writing code needs a Claude or Codex key.

## Review Focus

1. **A second request while one is active:**
   - the route answers 409;
   - chat replies `HTX đang có một yêu cầu xây app chưa xong.`.

   Test: W-1.
2. **The host stops mid-build.** On start, `./dxos builder` marks `running` builds `failed` with `Máy chủ dừng giữa chừng`, fails the request, and tags nothing. Test: B-3.
3. **The workspace tries to change the gates.**
   - A `/work/gates.py`, a `/work/.dxos/gates.json` or a `conftest.py` that skips tests cannot turn a failing gate green.
   - Gates run from `/opt/dxos-gates`.
   - The route-coverage check counts tests from the pytest JSON report, not from file names.

   Test: B-2.
4. **The provider has no key, or refuses.** The request fails with `Chưa có khoá của công cụ viết mã` or the tool's first error line. Nothing is retried beyond the 3 rounds. Test: B-3.
5. **The app id is taken** (a store app, or another cooperative's generated app). The spec route answers 409 `APP_ID_TAKEN`, and A12 retries once with a `-2` suffix. Test: W-2, A-1.

---

## Contracts

### C1. Tables (`08-agent.sql`, migration `20261127190000_app_builder`)

```sql
CREATE TABLE IF NOT EXISTS platform.app_build_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  htx_code text NOT NULL, requested_by text NOT NULL, requested_by_name text NULL,
  request_text text NOT NULL CHECK (char_length(request_text) BETWEEN 5 AND 500),
  questions jsonb NOT NULL DEFAULT '[]',                 -- ["…"] at most 5, each at most 160 characters
  answer_text text NULL CHECK (char_length(answer_text) <= 1000),
  path text NULL CHECK (path IN ('store','book','build')),
  app_id text NULL, spec jsonb NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN
    ('new','asking','routed','spec_proposed','spec_approved','building','passed','failed','installed','cancelled')),
  error_vi text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- partial unique index: one row per htx_code WHERE status IN ('new','asking','spec_proposed','spec_approved','building')
CREATE TABLE IF NOT EXISTS platform.app_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES platform.app_build_requests(id) ON DELETE CASCADE,
  htx_code text NOT NULL, app_id text NOT NULL, version text NOT NULL,
  provider text NOT NULL, rounds smallint NOT NULL DEFAULT 0 CHECK (rounds BETWEEN 0 AND 3),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','passed','failed')),
  gates jsonb NOT NULL DEFAULT '[]',                     -- [{name, ok, detail_vi}] of the last round
  git_tag text NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz NULL,
  UNIQUE (app_id, version)
);
CREATE TABLE IF NOT EXISTS platform.app_build_files (
  build_id uuid NOT NULL REFERENCES platform.app_builds(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name IN ('desktop-light.png','desktop-dark.png','mobile-light.png','mobile-dark.png','review.md','spec.md')),
  content_type text NOT NULL, bytes bytea NOT NULL, PRIMARY KEY (build_id, name)
);
ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS owner_htx text NULL;
ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS build_id uuid NULL REFERENCES platform.app_builds(id);
```

- The two first tables get the audit row trigger.
- `09-telegram.sql` and the migration add `'app_answer'` to the conversation `kind` CHECK. Whichever of M13 and M15 merges second recreates the CHECK with both kinds.

### C2. Spec shape (zod in the web, same limits in A12)

```
{ app_id: ^gen-[a-z0-9-]{3,30}$, name_vi: 1..60, summary_vi: 1..300,
  roles: [{role: farmer|officer|manager, can_vi: 1..160}] 1..3,
  screens: [{path: ^/[a-z0-9/-]{0,40}$, title_vi: 1..60, purpose_vi: 1..160}] 1..8,
  data: [{table: ^[a-z][a-z_]{1,29}$, fields: [{name: ^[a-z][a-z_]{1,29}$,
          type: text|integer|number|date|boolean|choice, label_vi: 1..60, choices?: [1..40] 2..20}] 1..15}] 0..5,
  agent_reads: [{name: ^[a-z_]{2,30}$, description_vi: 1..160}] 0..5 }
```

`agent_reads` are read-only figures. The spec has no place for actions (H2).

### C3. Catalogue

| Kind | Risk / autonomy | Payload | `execute` |
|---|---|---|---|
| `app.spec.approve` | medium, manager, `auto` | `{request_id}` | request `spec_proposed` → `spec_approved` |
| `miniapp.install` | high, manager, `unlockable` | `{app_id}` | inserts the store's `ENABLE` request for the proposal's cooperative through the existing store use case; result `{request_id}` |
| `miniapp.remove` | high, manager, `unlockable` | `{app_id}` | the store's `DISABLE` request |

- **`app.spec.approve`:**
  - preview: the name, the summary, the screens, the data fields and `Xây mất khoảng 10–30 phút.`;
  - `isStale` when the spec changed or the status is no longer `spec_proposed`.
- **`miniapp.install`:**
  - for a generated app, creation and `execute` both refuse unless `owner_htx` = the proposal's cooperative and the build is `passed` (test 28);
  - the preview adds `App do AI xây` and the gate summary.

### C4. Intake and A12 routes

**Chat.** The M5 router gains the intent `app.request` for managers (keywords `cần app`, `làm app`, `xây app`, `cần phần mềm`). It creates the request and replies `Đã nhận yêu cầu. Trợ lý sẽ hỏi lại vài câu nếu cần.`.

**Web.** `/manager/ai/apps` holds:
- the request form;
- the list with status;
- the questions with an answer box;
- the spec;
- the gate table, the review and the four screenshots of the last build.

`POST /api/agent/app-requests` (manager session) creates a request.

**A12 internal routes** (agent token, scoped to its `htx_code`):

| Route | Body / answer |
|---|---|
| `GET /api/internal/agent/app-builder/requests` | requests in `new`, or in `asking` with an answer: `{id, request_text, questions, answer_text, store_apps: [{id, name_vi, description_vi, enabled}], book_templates: [ids of custom-books templates], custom_books_enabled, code_providers: ['claude-code'|'codex-cli']}` |
| `POST …/requests/{id}/questions` | `{questions}` → `asking`. It sends them as one Telegram message and opens an `app_answer` conversation for 24 h; the manager's next text is the answer |
| `POST …/requests/{id}/route` | `{path: 'store'\|'book', target, reason_vi}` → `routed`, with a `miniapp.install` proposal for `target` (store) or an `app.custom-books.book.create` proposal (book). When `custom-books` is not enabled, the book path proposes `miniapp.install` of `custom-books` with the template named in the reason |
| `POST …/requests/{id}/spec` | the C2 spec → `spec_proposed` plus the `app.spec.approve` proposal. 409 `APP_ID_TAKEN` when the id exists in the catalogue or in `app_builds` |

### C5. A12 (`platform/agent/dxos_agent/agents/app_builder.py`)

- **Schedule:** every cycle.
- **Steps:**
  1. **Path choice by rules first:** a store app whose name or description shares at least two non-stopword words with the request → store. When code providers are empty, only the store and book paths are possible.
  2. **Otherwise the LLM** answers one of `{"path": "store"|"book", "target", "reason_vi"}`, `{"questions": [...]}` (only when no answer yet), or `{"spec": C2}`.
- Agent `app-builder`; it joins `CONFIGURABLE_AGENTS` and `KNOWN_AGENTS` as `Xưởng mini-app (A12)`.

### C6. Builder (`platform/builder/`, new)

**The image `dxos-builder`** has:
- `/opt/dxos-gates` (the gate code);
- `/wheels` (`pip download` of the allowed requirements at image build);
- `/opt/hello` (a copy of `miniapps/hello` and `platform/appkit`).

The image runs as user `10001`. The compose service sits under profile `builder` and is never left running.

**The proxy `dxos-builder-proxy`:**
- a Python standard-library `CONNECT` proxy;
- it allows only hosts in `DXOS_BUILDER_ALLOW_HOSTS` (default: the hosts of the configured provider base URLs);
- other hosts get 403, and the refusal is logged.

**Networks.** The `build` container is on `dxos-builder-net` (`internal: true`). The proxy is on that network and on the default one.

**Host loop `./dxos builder [--once]`:**
- one per project, with a lock directory like the worker;
- at start it fails the `running` builds (Review Focus 2).

For each claimed `spec_approved` request, rounds 1..3:
1. The first round creates `generated-apps/<htx>/<app id>` (`git init`), copies `/opt/hello`, writes `SPEC.md`, and writes `app.yaml` with the id, `name`, `version: 0.1.0` and `generated: true`.
2. **`build`:** the tool from `DXOS_BUILDER_TOOL`, run with `platform/builder/prompt.md` and the previous round's `.dxos/feedback.md`:
   - `claude-code` (`claude -p --max-turns 60 --output-format json`);
   - `codex-cli` (`codex exec`);
   - `replay:<fixture>`, which copies `platform/builder/replay/<fixture>/` and writes `.dxos/env-probe.json` (the env names and the mounts it sees).
3. **`gates`** (`--network none`, `/work:ro`, a copy to `/tmp` for pytest) writes `[{name, ok, detail_vi}]`.
4. **`review`:** the provider other than the writer's when both are configured, else the same one. It returns `{findings: [{severity: high|medium|low, file, line, issue_vi}]}`. Any `high` finding fails the gate `review`.
5. All pass → `git commit`, tag `v<version>`, `git archive` to `docker/runtime/<project>/generated/<app id>/<version>/`, and `cli builder-finish <build> passed` (uploads the gates, the review and the screenshots, and writes the catalogue row with `owner_htx`).
6. Any failure → `feedback.md` and the next round. After round 3, `failed` with the first failing gate's `detail_vi`.

**Gates** (`/opt/dxos-gates/gates.py`):

| Name | Check |
|---|---|
| `manifest` | `dxos validate`, plus the id equals the request's, plus `generated: true` (test 29 through M9's rule) |
| `markup` | no `<script`, `on…=` attribute, `javascript:`, `<style` or `style=` in templates and Python strings (test 26) |
| `kit` | kit files identical to `platform/appkit` (the `appkit-sync.sh --check` comparison for one directory) |
| `tests` | pytest green, offline from `/wheels`. Every FastAPI route path is requested by at least one passing test (from the pytest JSON report) |
| `deps` | every `requirements*.txt` line is in `allowed-requirements.txt` (test 26) |
| `files` | an SPDX header in every source and template; no `.env*`; no key-shaped strings (`sk-`, `AKIA`, `-----BEGIN`, `xox`); no file over 1 MB |
| `run` | a local PostgreSQL in `/tmp`; the app's migrations and its required `sample_data.sql`; each spec screen opened by Playwright with a manager token for `TC` at 1280×800 and 390×844, light and dark. Any 5xx or horizontal overflow fails. It saves the four screenshots of the first screen |

### C7. Platform (`platform/cli`, `dxos`)

- **`cli builder-claim` and `builder-finish`.**
- **`store.sync_catalog` leaves rows with `owner_htx` alone.**
- **The store list** shows `owner_htx` rows only to that cooperative.
- **The worker,** for an app with `owner_htx`:
  - installs from the runtime export;
  - refuses (`FAILED`, `Bản này chưa qua kiểm tra hoặc không thuộc HTX này`) when the cooperative differs, the build is not `passed`, or the request has no approved spec (test 28).
- **Network for `gen-*` apps.** The compose fragment puts the app on its own network `dxos-gen-<id>` (`internal: true`), not on `dxos-apps-net`. The same fragment adds that network to `apisix` and `postgres`, and the install step connects the running containers, so the app reaches only those two (test 27). `docs/miniapps.md` §7 gains the rule.

### C8. Telegram and store

- **When a build passes,** the web queues:
  - `App "<name>" đã xây xong, qua 7 cổng kiểm tra.` with the four screenshots;
  - A12's `miniapp.install` proposal (agent `app-builder`).

  The outbox item gains `photos: [{build_id, name}]`, at most 4. The relay fetches each from `GET /api/internal/telegram/media?build=<id>&name=<n>` (relay token) and sends `sendMediaGroup`; the stub Bot API accepts it.
- **When a build fails:** `Chưa xây được app "<name>": <error_vi>. Yêu cầu đã đóng.`.
- **The store card and detail page** of a generated app show `App do AI xây`, with links to the spec and the gate report on `/manager/ai/apps/<request id>`.

### C9. custom-books `book.create` (M9 `agent` block)

- Payload `{template: picking|spraying|fertilising|cashbook|meeting|handover|pest|visitors|blank, name_vi: 1..80, description_vi?: ..200}`, `risk: low`, `money: false`.
- It creates a draft book from the template with that name, and answers `{book_id, design_path}`. The manager finishes it in the designer.
- Version bump and store text.

---

## Tracks

| Track | Owns |
|---|---|
| W web | `apps/web/**`, `08-agent.sql`, `09-telegram.sql`, docs `api-contract.md` and `database-schema.md` |
| A agent | `platform/agent/**` (A12, its replay recordings) |
| B builder | `platform/builder/**`, `docker/docker-compose.yml` (builder, proxy, network), `dxos` (`builder`), `Makefile` (`builder-image`), `DEPENDENCIES.md`, `.github/workflows/ci.yml` (the `Builder Smoke` job) |
| P platform | `platform/cli/**`, `dxos` (worker and network parts), `platform/telegram/**` (`sendMediaGroup`), `docs/miniapps.md` |
| S custom-books | `miniapps/custom-books/**` |
| I smoke and docs | `platform/tests/**`, `docs/rules-and-limits.md`, `README.md` |

Tasks per track follow the contracts with test-first steps and the Review Focus tests. Track B's unit tests cover:
- the env and mount list of the `build` run (test 30);
- the proxy allowlist;
- each gate against the fixtures;
- the start-up recovery.

**The `Builder Smoke`** (a separate CI job, because the image is large) uses `DXOS_BUILDER_TOOL=replay:fertiliser-stock` and the agent's `replay` provider.

Main path:
1. The TC manager sends the request through the stub. A12 posts the spec, which is approved through Telegram.
2. `./dxos builder --once` runs. Assert:
   - a `passed` build with 7 green gates;
   - four photos at the stub.
3. Approve `miniapp.install` and run the worker. Assert:
   - `/apps/gen-fertiliser-stock/` answers 200 for the TC manager;
   - the LB manager does not see it in the store and gets 404.

Tests 26–30:
- **26:** fixture `with-script` and fixture `extra-dependency` end `failed` with no catalogue row.
- **27:** from inside `app-gen-fertiliser-stock`, `app-tea-shop:8080` is unreachable and `apisix:9081` answers.
- **28:** an `ENABLE` row inserted by hand for a failed build ends `FAILED`.
- **29:** fixture `with-agent-actions` fails the `manifest` gate.
- **30:** `env-probe.json` has no `DXOS_`, `POSTGRES`, `KEYCLOAK`, `TELEGRAM`, `AUTH_SECRET` or `HASURA` names and no `docker.sock`. From the `build` container, `postgres:5432` is unreachable and `example.com` through the proxy gets 403.

**Cleanup:** `./dxos remove gen-fertiliser-stock --purge`, then delete the generated folder.
