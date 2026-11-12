<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cooperative's manager installs and removes mini-apps for their own HTX from an App Store page; the plan also ships three business mini-apps: `leaf-purchase`, `tea-shop` and `farm-supply`.

**Architecture:**
- The web app only writes a request row. A host process, `./dxos worker`, takes requests one at a time and runs the existing install and remove flows.
- An app is usable by an HTX when it is installed and enabled for that HTX (or for `*`). The menu, the proxy and the shell pages check this.
- Each new mini-app is self-contained under `miniapps/<id>/` and copies the `miniapps/tea-tour` patterns.

**Tech Stack:** Python 3.12 (CLI: PyYAML, jsonschema, psycopg 3; apps: FastAPI, Jinja2, psycopg 3), bash (`./dxos`), Next.js 14 + Prisma `$queryRaw`, PostgreSQL 16, APISIX 3.19.

**Spec:** `docs/specs/2026-11-12-miniapp-store-design.md`

## Execution model

The main session designs and reviews. Implementation runs in other sessions on Sonnet 5.5.

| Job | Tasks | Where | When |
| --- | --- | --- | --- |
| 0 | Task 0 | main checkout, branch `feat/miniapp-store` | first |
| A | Tasks A1–A4 | main checkout, branch `feat/miniapp-store` | after Job 0 |
| B, C, D | Tasks B, C, D | one git worktree each, branches `store/leaf-purchase`, `store/tea-shop`, `store/farm-supply`, cut from the Task 0 commit | in parallel with Job A |
| E | Tasks E1–E3 | main checkout, after B–D are merged into `feat/miniapp-store` | last |

Jobs B, C and D change files only under their own `miniapps/<id>/`. Shared files (`.github/workflows/ci.yml`, `Makefile`, `dxos`, `platform/tests/*`, `CHANGELOG.md`, `DEPENDENCIES.md`, `README.md`, `docs/*`) belong to Jobs 0, A and E.

## Global Constraints

- English-only identifiers; English Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>` (`git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`); no Co-Authored-By trailer; no push.
- SPDX header (`MIT`, `2026 OpenTea Developers`) on every new text file.
- Never read or print `docker/.env.local` or the repo-root `.env.local`. Never delete `docker_*` volumes. Full-stack rounds use `COMPOSE_PROJECT_NAME=dxos-clean`.
- Pin every dependency exactly. Mini-apps reuse the `miniapps/tea-tour` pins and add no new package.
- No regression: `./dxos install`, `./dxos remove [--purge]`, `./dxos list`, `./dxos validate`, the A3 story, the tea-tour story, `make platform-smoke` (124 PASS) and `make apps-smoke` keep passing.
- App ids match `^[a-z][a-z0-9-]{1,30}$`. HTX codes in URLs match `^[A-Za-z0-9_-]{1,20}$`.
- Enablement: an HTX can use an app when the app is in `platform.installed_apps` and `platform.app_enablements` has a row for that HTX or for `*`. `./dxos install` writes `*`.
- The web app never talks to Docker. The worker accepts only an app id, an HTX code and an action.
- A removed or disabled app keeps its data. Only `./dxos remove <id> --purge` deletes it.
- Mini-app pages: no JavaScript; `/dxos-app.css`; `?theme=light|dark` on `<html data-theme>`; stacked tables with `data-label` and ARIA roles; every query filters on `htx_code` from the token; writes are POST and answer 303; Vietnamese messages; money is integer VND; at most 8 database connections (`threading.BoundedSemaphore(8)`, busy → 503).
- Public mini-app pages live under `/public/<htxCode>/...`.
- New manifests declare `requires.core: ">=1.9.0"`; the web package version is `1.9.0` from Task 0.
- UI in the web app follows `DESIGN.md`: tokens only, light and dark, no page-level horizontal overflow at 390 px, empty/loading/error states.

## Review Focus

- **Two managers of one HTX press Cài at the same moment:** one request is created, the other gets 409, and the app is installed once. Test in A4.
- **The worker dies in the middle of an install:** on its next start the request is `FAILED`, nothing of the half install is left, and Thử lại works. Test in A2.
- **An HTX that has not enabled an app opens its public or protected pages, or tries to remove another HTX's enablement:** 404 for pages, 409 for the request. Tests in A3 and A4.
- **The last HTX disables an app while another HTX's enable request is queued:** the worker handles them in order, the app is removed and installed again, and the data is kept. Test in A1.
- **Twenty guests order the last five packs at the same moment, or two guests order the same two products in opposite order:** no overselling and no deadlock. Test in C.

---

### Task 0: Manifest description, version 1.9.0 and the public path rule

**Files:**
- Modify: `platform/apps/manifest.schema.json`, `platform/cli/tests/test_manifest.py`, `miniapps/hello/app.yaml`, `miniapps/tea-tour/app.yaml`, `apps/web/package.json`, `apps/web/package-lock.json` (two top-level `version` fields), `docs/miniapps.md`, `CHANGELOG.md` (`[Unreleased]`)

**Interfaces:**
- Produces: optional manifest field `description` (string, 1–200 characters); web package version `1.9.0`; the documented rule "public pages live under `/public/<htxCode>/...`".

- [ ] **Step 1: Tests.** `test_accepts_description`, `test_rejects_empty_description`, `test_rejects_description_over_200_chars`.
- [ ] **Step 2: Run** `cd platform/cli && python -m pytest tests -q -W error`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `hello`: `description: Ứng dụng mẫu cho người viết mini-app.` `tea-tour`: `description: Mở tour tham quan đồi chè, nhận đặt chỗ và phân công người dẫn.` Both keep `requires.core: ">=1.8.0"`.
- [ ] **Step 4: Verify** CLI pytest passes, `python -m dxos_cli validate miniapps/hello miniapps/tea-tour` is valid, `make lint` passes.
- [ ] **Step 5: Commit** `feat(platform): add a description to the mini-app manifest`.

---

### Task A1: Store tables and CLI data layer

**Files:**
- Create: `platform/postgres/init/06-app-store.sql`, `platform/cli/dxos_cli/store.py`, `platform/cli/tests/test_store.py`
- Modify: `docker/docker-compose.yml` (mount `06-app-store.sql` exactly as `05-apps.sql` is mounted), `platform/cli/dxos_cli/commands.py`, `platform/cli/dxos_cli/registry.py`, `platform/cli/dxos_cli/__main__.py`, `platform/cli/tests/conftest.py` (apply the new init file)

**Interfaces:**
- Produces, in schema `platform` (idempotent DDL, owner `agrimarket`):
  - `app_catalog(id text PK, name text NOT NULL, version text NOT NULL, description text NOT NULL DEFAULT '', license text NOT NULL, publisher text NOT NULL, menu jsonb NOT NULL, roles text[] NOT NULL, has_public boolean NOT NULL, synced_at timestamptz NOT NULL DEFAULT now())`
  - `app_enablements(id uuid PK DEFAULT gen_random_uuid(), app_id text NOT NULL, htx_code text NOT NULL, enabled_by text NOT NULL, enabled_at timestamptz NOT NULL DEFAULT now(), UNIQUE (app_id, htx_code))`
  - `app_requests(id uuid PK DEFAULT gen_random_uuid(), app_id text NOT NULL, htx_code text NOT NULL, action text NOT NULL CHECK (action IN ('ENABLE','DISABLE')), requested_by text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','DONE','FAILED')), error text, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz)` with a unique index on `(app_id, htx_code) WHERE status IN ('PENDING','RUNNING')`
  - `app_worker(id boolean PK DEFAULT true CHECK (id), seen_at timestamptz NOT NULL)`
  - Triggers `dxos_audit_row` calling `audit.capture_row()` on `app_enablements` and `app_requests`.
- Produces, in `store.py`:
  - `Job` (frozen dataclass: `id: str, action: str, app_id: str, htx_code: str, installed: bool`)
  - `sync_catalog(conn, miniapps_dir: Path, core_version: str) -> list[str]`: upserts every valid manifest, writes a warning to stderr for an invalid one, deletes rows whose directory is gone unless the app is installed; returns the synced ids.
  - `claim_next(conn) -> Job | None`: oldest `PENDING` with `FOR UPDATE SKIP LOCKED`, set to `RUNNING` with `started_at`.
  - `finish(conn, job_id: str, ok: bool, error: str | None = None) -> int`: one transaction. `ok` and `ENABLE` → upsert the enablement (`enabled_by` = the request's `requested_by`); `ok` and `DISABLE` → delete it; sets `DONE` or `FAILED` (error cut to 300 characters) and `finished_at`. Returns the number of enablement rows left for the app.
  - `fail_stale(conn) -> list[Job]`: every `RUNNING` request becomes `FAILED` with error `Trình cài đặt khởi động lại giữa chừng.`; returns them.
  - `heartbeat(conn) -> None`
- Changes:
  - `commands.commit(root, app_id, enable_all: bool = True)`: when `enable_all`, also inserts `(app_id, '*', 'dxos-cli')` in the same transaction as the registry row.
  - `commands.remove`: deletes the app's enablement rows in the same transaction as `registry.unregister`.
- CLI subcommands (stdout is machine-readable, one line, tab-separated):
  - `catalog-sync`
  - `commit <id> [--no-enable-all]`
  - `worker-start`: `sync_catalog`, then `fail_stale`; prints one app id per line for stale `ENABLE` jobs.
  - `worker-claim [--wait SECONDS]` (default 30): polls once a second, calls `heartbeat` on every poll; prints `<job_id>\t<action>\t<app_id>\t<htx_code>\t<0|1 installed>` or nothing; exit 0 either way.
  - `worker-finish <job_id> ok|fail [message]`: prints `remaining=<n>`.
  - A job whose `app_id` fails the id pattern or is not in `app_catalog` is finished as `FAILED` (`Ứng dụng không có trong kho.`) inside `worker-claim`, which then looks for the next one.

- [ ] **Step 1: Tests** (throwaway Postgres fixture, as the existing CLI tests):
  `test_sync_catalog_upserts_and_skips_invalid`, `test_sync_keeps_installed_app_whose_dir_is_gone`, `test_claim_takes_oldest_one_at_a_time` (two connections: the second claim gets the next job, never the same), `test_finish_enable_adds_enablement`, `test_finish_disable_returns_remaining`, `test_finish_fail_records_error_and_changes_nothing`, `test_one_open_request_per_app_and_htx` (second insert raises a unique violation), `test_fail_stale_marks_running_failed`, `test_claim_fails_unknown_app` (`../x`, `ghost`), `test_commit_enables_for_all_by_default`, `test_commit_no_enable_all`, `test_remove_deletes_enablements`, `test_requests_and_enablements_are_audited` (a row appears in `audit.events`), `test_queued_enable_after_last_disable` (Review Focus 4: DISABLE for TC then ENABLE for LB are claimed in that order; after both, LB is enabled and TC is not).
- [ ] **Step 2: Run.** Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** SQL only through psycopg parameters; no string-built SQL.
- [ ] **Step 4: Verify** CLI pytest passes, including the existing tests.
- [ ] **Step 5: Commit** `feat(platform): add the app catalogue, per-HTX enablement and the request queue`.

---

### Task A2: `./dxos worker`

**Files:**
- Modify: `dxos`, `Makefile` (`platform-up` runs `catalog-sync` after `platform-init`), `platform/tests/smoke-apps.sh`

**Interfaces:**
- Consumes: the Task A1 subcommands.
- Produces:
  - `./dxos install <dir>` behaves as today (commit enables for `*`). Internally `install` takes a second argument `all|htx`; `htx` calls `cli commit "$id" --no-enable-all`.
  - `./dxos worker`: takes the lock `docker/runtime/<project>/worker.lock/` (a directory holding a `pid` file; a stale lock whose pid is not running is replaced; a live one makes the command exit 1 with `Một worker khác đang chạy (pid <n>).`), runs `cli worker-start` and for each printed id runs `remove_container <id>` and `cli abort <id>` (errors ignored), then loops on `cli worker-claim --wait 30`:
    - `ENABLE`, not installed: run `install "miniapps/<app_id>" htx` in a subshell. Exit 0 → `cli worker-finish <job> ok`. Otherwise → `cli worker-finish <job> fail "Cài đặt hỏng (mã <rc>). Quản trị máy chủ xem nhật ký của ./dxos worker."`
    - `ENABLE`, installed: `cli worker-finish <job> ok`.
    - `DISABLE`: `cli worker-finish <job> ok`; when it prints `remaining=0`, run `remove <app_id>` (no `--purge`).
    - It logs one line per job to stdout with a timestamp, the job id, the action, the app, the HTX and the result.
    - INT or TERM between jobs exits 0 and removes the lock; during a job, the install's own traps undo the install and the worker exits.

- [ ] **Step 1: Extend `smoke-apps.sh`** with a section `[store queue]` that starts `./dxos worker` in the background and stops it at the end (also in the EXIT trap):
  1. Insert an `ENABLE` request for `hello` and HTX `TC` with `psql`; within 120 s the request is `DONE`, `hello` is installed, and enablements hold `(hello, TC)` and no `*`.
  2. Insert `ENABLE` for `hello` and `LB`; it becomes `DONE` without a second install (the container id is unchanged).
  3. `DISABLE` for `TC`: `DONE`, the container still runs. `DISABLE` for `LB`: `DONE`, and the container and the route are gone.
  4. Review Focus 2: copy the `broken-health` fixture to `miniapps/broken-health` for this step only (removed afterwards), run `catalog-sync`, and insert `ENABLE` for it; the request becomes `FAILED` with the Vietnamese message, nothing is installed, and the gateway sha256 is unchanged. Then kill a worker with `kill -9` while it installs `hello`, start a new worker, and check that the request is `FAILED`, no `app-hello` container or route is left, and a new `ENABLE` request succeeds.
  5. A second `./dxos worker` while one runs exits 1.
- [ ] **Step 2: Run** on a fresh `dxos-clean` stack. Expected: FAIL (`./dxos worker` unknown).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** `make apps-smoke` passes on a fresh `dxos-clean`; shellcheck is clean for `dxos` and `smoke-apps.sh`.
- [ ] **Step 5: Commit** `feat(platform): run store requests with ./dxos worker`.

---

### Task A3: Enablement in the menu, the proxy and the shell pages

**Files:**
- Modify: `apps/web/src/infrastructure/db/repositories/prisma-installed-app-repository.ts`, `apps/web/src/application/apps/forward-to-app.ts`, `apps/web/src/app/apps/[id]/[[...path]]/route.ts`, `apps/web/src/lib/apps/app-nav.ts`, `apps/web/src/app/{manager,officer,farmer}/layout.tsx`, `apps/web/src/app/{manager,officer,farmer}/apps/[id]/[[...path]]/page.tsx`, and their tests

**Interfaces:**
- Produces:
  - `PrismaInstalledAppRepository.list(htxCode: string | null): Promise<InstalledApp[]>`: installed apps enabled for `htxCode` or `*`; with `null`, only `*`.
  - `PrismaInstalledAppRepository.isEnabledFor(appId: string, htxCode: string): Promise<boolean>`
  - `appTenant(app: InstalledApp, path: string[]): { kind: 'protected' } | { kind: 'public'; htxCode: string | null }` in `forward-to-app.ts`: `public` when the joined path starts with a public prefix; `htxCode` is the segment right after that prefix when it matches `^[A-Za-z0-9_-]{1,20}$`, otherwise `null`.
  - Proxy rule: `public` with `htxCode === null` or not enabled → 404. `protected`: no session → 401 as today; session HTX missing or not enabled → 404. Every response keeps the CSP and `nosniff` headers.
  - `loadAppNavItems(repository, role, htxCode)`; the shell pages call `notFound()` when the app is not enabled for the session's HTX.

- [ ] **Step 1: Tests.** Repository SQL: `list('TC')` returns an app enabled for `TC` and one enabled for `*`, not one enabled only for `LB`; `list(null)` returns only `*`. `appTenant`: `/public/TC/x` → `TC`; `/public` and `/public/` → `null`; `/public/..%2Fx` → rejected by the unsafe-segment rule first; `/` → protected. Proxy: enabled HTX → forwarded; other HTX → 404 and `fetch` not called (public and protected); `*` → forwarded for any HTX. Layouts pass the session HTX. Shell page → `notFound()` for a disabled HTX (Review Focus 3).
- [ ] **Step 2: Run** `make test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** One `$queryRaw` tagged template per query; no caching.
- [ ] **Step 4: Verify** `make test`, `make lint`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(web): show and serve a mini-app only to cooperatives that enabled it`.

---

### Task A4: App Store API and page

**Files:**
- Create: `apps/web/src/domain/entities/app-store.ts`, `apps/web/src/infrastructure/db/repositories/prisma-app-store-repository.ts`, `apps/web/src/application/apps/app-store.usecase.ts`, `apps/web/src/app/api/app-store/route.ts`, `apps/web/src/app/api/app-store/requests/route.ts`, `apps/web/src/app/manager/app-store/page.tsx`, `apps/web/src/app/manager/app-store/_components/AppStoreClient.tsx` (+ CSS module), tests
- Modify: `apps/web/src/app/manager/layout.tsx` (nav item `Kho ứng dụng` → `/manager/app-store`), `apps/web/src/__tests__/api/tenant-isolation.test.ts`, `docs/api-contract.md`, `CHANGELOG.md`

**Interfaces:**
- Produces:
  - `type AppStoreStatus = 'available' | 'installing' | 'enabled' | 'enabled_all' | 'removing' | 'failed'`
  - `interface StoreApp { id; name; version; description; license; publisher; roles: string[]; hasPublic: boolean; status: AppStoreStatus; error: string | null }`
  - Status for an HTX, first match wins: open `ENABLE` request → `installing`; open `DISABLE` → `removing`; enablement `*` → `enabled_all`; enablement for the HTX → `enabled`; the newest request for (app, HTX) is `FAILED` → `failed` with its error; otherwise `available`.
  - `GET /api/app-store` → 200 `{ data: { workerAlive: boolean, apps: StoreApp[] } }`; `workerAlive` is true when `app_worker.seen_at` is at most 30 s old.
  - `POST /api/app-store/requests` with `{ appId: string, action: 'ENABLE' | 'DISABLE' }` → 202 `{ data: { status: 'installing' | 'removing' } }`.
  - Errors, in the existing `{ error: { code, message } }` shape: 401 `UNAUTHORIZED`; 403 `FORBIDDEN` (not a manager); 403 `NO_HTX`; 400 `VALIDATION_ERROR`; 404 `APP_NOT_FOUND`; 409 `REQUEST_OPEN`, `ALREADY_ENABLED`, `NOT_ENABLED`, `ENABLED_FOR_ALL`.
  - The HTX and the requester come from `requireTenant()` and the session, never from the body. A unique violation on the open-request index maps to 409 `REQUEST_OPEN`.
- Page copy (Vietnamese): title `Kho ứng dụng`; buttons `Cài`, `Gỡ`, `Thử lại`; states `Chưa cài`, `Đang cài…`, `Đã cài`, `Đang gỡ…`, `Đã cài cho mọi HTX (quản trị máy chủ)`, `Lỗi`; remove confirmation `Gỡ ứng dụng này khỏi HTX? Dữ liệu được giữ lại.`; worker warning `Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật ./dxos worker.`; empty state `Kho chưa có ứng dụng nào.`
- The client component polls `GET /api/app-store` every 3 s while any app is `installing` or `removing`, and stops otherwise.

- [ ] **Step 1: Tests.** Use case: every status rule above; `requestChange` returns each 409 case; a `DISABLE` for an app enabled only by another HTX → `NOT_ENABLED` (Review Focus 3). Routes: role and tenant checks; body HTX ignored; two concurrent `ENABLE` posts → one 202 and one 409 (Review Focus 1, with the repository's unique violation simulated). UI: buttons per status, confirmation before `Gỡ`, worker warning, error text with `role="alert"`, polling starts and stops. Colour guard and theme tests stay green.
- [ ] **Step 2: Run** `make test`. Expected: FAIL.
- [ ] **Step 3: Implement** with existing UI components (`Button`, `Pill`, cards) and tokens only.
- [ ] **Step 4: Verify** `make test`, `make lint`, `npx tsc --noEmit`, `next build`. On a fresh `dxos-clean` with `./dxos worker` running, in a real browser as `smoke_manager_tc`: Cài `hello` → `Đang cài…` → `Đã cài`, the menu shows `Xin chào`; `smoke_manager_lb` does not see it and gets 404 on `/apps/hello/`; Gỡ → gone. Screenshots at 1280 and 390, light and dark, with `scrollWidth <= innerWidth`.
- [ ] **Step 5: Commit** `feat(web): add the App Store page with install and remove per cooperative`.

---

### Task B: `leaf-purchase` (Thu mua búp tươi)

**Files:** Create everything under `miniapps/leaf-purchase/` (same layout as `miniapps/tea-tour/`: `app.yaml`, `Dockerfile`, `.dockerignore`, `requirements.txt`, `requirements-dev.txt`, `README.md`, `leaf_purchase/`, `migrations/001_init.sql`, `tests/`).

**Interfaces:**
- Manifest: `id: leaf-purchase`, `name: Thu mua búp tươi`, `description: Ghi phiếu cân chè búp tươi của từng hộ, chốt kỳ và theo dõi chi trả.`, `license: MIT`, `requires.core: ">=1.9.0"`, `routes.protected: {"/": [officer, manager], "/prices": [manager], "/periods": [manager], "/mine": [farmer]}`, `menu`: `Thu mua búp tươi` → `/` for `officer` and `manager`; `Kỳ thanh toán` → `/periods` for `manager`; `Phiếu cân của tôi` → `/mine` for `farmer`.
- Tables in `app_leaf_purchase`, all with `htx_code text NOT NULL`:
  - `grades(id uuid PK, htx_code, name text 1–60, price_vnd int >= 0, active boolean, UNIQUE (htx_code, name), UNIQUE (id, htx_code))`
  - `periods(id uuid PK, htx_code, date_from date, date_to date CHECK (date_from <= date_to), closed_at timestamptz, closed_by text, UNIQUE (id, htx_code))`
  - `tickets(id uuid PK, htx_code, household_id text, household_name text, weighed_on date, grade_id uuid, grade_name text, kg numeric(7,1) CHECK (kg > 0 AND kg <= 5000), price_vnd int, amount_vnd bigint, voided boolean DEFAULT false, period_id uuid NULL, created_by text, created_at timestamptz, FOREIGN KEY (grade_id, htx_code) REFERENCES grades (id, htx_code), FOREIGN KEY (period_id, htx_code) REFERENCES periods (id, htx_code))`
  - `payouts(id uuid PK, htx_code, period_id uuid, household_id text, household_name text, total_kg numeric(9,1), total_vnd bigint, paid_at timestamptz NULL, paid_by text NULL, UNIQUE (period_id, household_id), FOREIGN KEY (period_id, htx_code) REFERENCES periods (id, htx_code))`
- Rules:
  - `amount_vnd = round(kg * price_vnd)`; the price is copied from the grade when the ticket is written.
  - A ticket can be edited or voided only while `period_id IS NULL`.
  - Closing a period runs in one transaction under `pg_advisory_xact_lock(hashtext(htx_code))`: refuse when the dates overlap an existing period of the HTX (`Kỳ này trùng ngày với một kỳ đã chốt.`) or when no ticket falls in the range (`Không có phiếu cân nào trong khoảng này.`); otherwise create the period, attach every non-voided ticket in the range, and insert one `payouts` row per household.
  - The household of a ticket must be one of the households Hasura returns for the caller (`x-hasura-role` = the caller's role); a forged id answers 400.
  - `/mine`: the farmer's household is `households[0]` returned by Hasura with `x-hasura-role: farmer`; no household → a Vietnamese notice.
  - `kg` accepts a comma as the decimal separator (`12,5` → 12.5).
- Pages: `/` (tickets of a day, form, daily total), `/tickets/{id}/edit`, `/tickets/{id}/void`, `/prices` (grades), `/periods` (list, close form), `/periods/{id}` (payouts, mark paid), `/mine`, `/healthz`.

- [ ] **Step 1: Tests** (`python -m pytest tests -q -W error`, throwaway Postgres as in `miniapps/tea-tour/tests`): `test_amount_is_kg_times_price` (12.5 kg × 8 000 = 100 000), `test_kg_accepts_comma`, `test_ticket_in_closed_period_cannot_be_edited_or_voided`, `test_overlapping_period_is_refused`, `test_two_concurrent_closes_create_one_period`, `test_close_needs_a_ticket`, `test_close_writes_one_payout_per_household`, `test_voided_ticket_is_not_paid`, `test_forged_household_is_rejected`, `test_other_htx_sees_nothing_and_gets_404`, `test_officer_cannot_open_prices_or_periods`, `test_farmer_sees_only_own_household`, `test_farmer_without_household_gets_notice`, `test_pages_escape_html`, `test_busy_database_answers_503`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** pytest passes; `python -m dxos_cli validate miniapps/leaf-purchase` is valid; `docker build miniapps/leaf-purchase` succeeds.
- [ ] **Step 5: Commit** `feat(miniapps): add the fresh leaf purchase app`.

---

### Task C: `tea-shop` (Cửa hàng chè)

**Files:** Create everything under `miniapps/tea-shop/` (same layout as `miniapps/tea-tour/`).

**Interfaces:**
- Manifest: `id: tea-shop`, `name: Cửa hàng chè`, `description: Giới thiệu sản phẩm chè, nhận đơn đặt hàng và theo dõi đơn.`, `license: MIT`, `requires.core: ">=1.9.0"`, `routes.public: [/public/]`, `routes.protected: {"/": [manager]}`, `menu`: `Cửa hàng chè` → `/` for `manager`.
- Tables in `app_tea_shop`, all with `htx_code text NOT NULL`:
  - `products(id uuid PK, htx_code, name text 1–120, pack text 1–60, price_vnd int >= 0, stock int >= 0, lot_code text NULL CHECK (lot_code ~ '^[A-Za-z0-9-]{1,40}$'), active boolean, UNIQUE (id, htx_code))`
  - `orders(id uuid PK, htx_code, code text UNIQUE CHECK (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'), customer_name text 1–80, phone text CHECK (phone ~ '^0[0-9]{9}$'), address text 1–200, note text <= 500, status text CHECK (status IN ('NEW','CONFIRMED','SHIPPING','DONE','CANCELLED')), total_vnd bigint, created_at timestamptz, UNIQUE (id, htx_code))`
  - `order_items(id uuid PK, htx_code, order_id uuid, product_id uuid, product_name text, pack text, price_vnd int, quantity int CHECK (quantity BETWEEN 1 AND 99), FOREIGN KEY (order_id, htx_code) REFERENCES orders (id, htx_code), FOREIGN KEY (product_id, htx_code) REFERENCES products (id, htx_code))`
- Rules:
  - `place_order` runs in one transaction: lock the ordered products `FOR UPDATE` in ascending `id` order, refuse when a product is missing, inactive or short (`Sản phẩm <tên> chỉ còn <n>.`), or when no quantity is above 0 (`Chọn ít nhất một sản phẩm.`); otherwise decrement the stock and store the order with name, pack and price copied onto each item.
  - Status moves: `NEW → CONFIRMED → SHIPPING → DONE`; cancel from `NEW`, `CONFIRMED` or `SHIPPING` restores the stock; nothing moves from `DONE` or `CANCELLED`.
  - Order lookup needs both the code and the phone, and gives the same message when either is wrong.
  - Public pages never show another customer's name, phone or address.
  - A product with a `lot_code` links `Xem nguồn gốc` to `/lot/<lot_code>`.
- Pages: manager `/` (products and orders), `/products` (POST create), `/products/{id}/edit`, `/orders/{id}`, `/orders/{id}/advance`, `/orders/{id}/cancel`; public `/public/{htx}` (products with a quantity field each, order form), `POST /public/{htx}/order` → 303 `/public/{htx}/order?code=…`, `GET /public/{htx}/order?code=&phone=`; `/healthz`.

- [ ] **Step 1: Tests:** `test_twenty_concurrent_orders_take_five_packs_exactly`, `test_opposite_order_two_products_does_not_deadlock` (Review Focus 5: 10 threads ordering A then B and 10 ordering B then A, all finish within 10 s), `test_order_copies_name_pack_and_price`, `test_cancel_restores_stock`, `test_status_moves_only_forward`, `test_done_and_cancelled_orders_do_not_move`, `test_inactive_or_other_htx_product_is_refused`, `test_empty_order_is_refused`, `test_lookup_needs_code_and_phone`, `test_public_pages_hide_other_customers`, `test_manager_of_other_htx_gets_404`, `test_phone_is_normalised`, `test_lot_link_only_with_lot_code`, `test_pages_escape_html`, `test_busy_database_answers_503`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** pytest passes; `python -m dxos_cli validate miniapps/tea-shop` is valid; `docker build miniapps/tea-shop` succeeds.
- [ ] **Step 5: Commit** `feat(miniapps): add the tea shop app`.

---

### Task D: `farm-supply` (Vật tư mua chung)

**Files:** Create everything under `miniapps/farm-supply/` (same layout as `miniapps/tea-tour/`).

**Interfaces:**
- Manifest: `id: farm-supply`, `name: Vật tư mua chung`, `description: Mở đợt đăng ký mua chung phân bón và thuốc bảo vệ thực vật, tổng hợp theo hộ.`, `license: MIT`, `requires.core: ">=1.9.0"`, `routes.protected: {"/": [manager], "/mine": [farmer]}`, `menu`: `Vật tư mua chung` → `/` for `manager`; `Đăng ký vật tư` → `/mine` for `farmer`.
- Tables in `app_farm_supply`, all with `htx_code text NOT NULL`:
  - `rounds(id uuid PK, htx_code, title text 1–120, deadline timestamptz, status text CHECK (status IN ('OPEN','CLOSED')), created_at timestamptz, UNIQUE (id, htx_code))`
  - `items(id uuid PK, htx_code, round_id uuid, name text 1–120, unit text 1–20, price_vnd int >= 0, UNIQUE (id, htx_code), FOREIGN KEY (round_id, htx_code) REFERENCES rounds (id, htx_code))`
  - `requests(id uuid PK, htx_code, round_id uuid, item_id uuid, household_id text, household_name text, quantity numeric(8,1) CHECK (quantity > 0 AND quantity <= 10000), UNIQUE (item_id, household_id), FOREIGN KEY (item_id, htx_code) REFERENCES items (id, htx_code))`
  - `settlements(id uuid PK, htx_code, round_id uuid, household_id text, delivered_at timestamptz NULL, paid_at timestamptz NULL, UNIQUE (round_id, household_id), FOREIGN KEY (round_id, htx_code) REFERENCES rounds (id, htx_code))`
- Rules:
  - A farmer registers, changes or removes a quantity only while the round is `OPEN` and `now() < deadline`; otherwise `Đợt đăng ký đã đóng.` The check and the write share one transaction with `FOR SHARE` on the round.
  - The farmer's household comes only from Hasura with `x-hasura-role: farmer` (`households[0]`), never from the form.
  - An item can be added while the round is `OPEN`; its name, unit and price can change only while it has no request.
  - Closing a round is one-way. Delivered and paid marks exist only for a `CLOSED` round and only for households that registered.
  - Amount owed by a household = sum of `round(quantity * price_vnd)` over its requests.
- Pages: manager `/` (rounds, create), `/rounds/{id}` (items, summary by item and by household, close, mark delivered or paid); farmer `/mine` (open rounds with a quantity field per item, past rounds with amount and status); `/healthz`.

- [ ] **Step 1: Tests:** `test_register_and_change_quantity_before_deadline`, `test_register_after_deadline_is_refused`, `test_register_on_closed_round_is_refused`, `test_close_while_registering_is_consistent` (a concurrent close and register leave no request written after the close), `test_household_comes_from_token_not_form`, `test_item_with_requests_cannot_change`, `test_summary_by_item_and_household` (quantities and amounts), `test_marks_only_on_closed_round`, `test_quantity_accepts_comma`, `test_other_htx_gets_404`, `test_farmer_cannot_open_manager_pages`, `test_farmer_without_household_gets_notice`, `test_pages_escape_html`, `test_busy_database_answers_503`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** pytest passes; `python -m dxos_cli validate miniapps/farm-supply` is valid; `docker build miniapps/farm-supply` succeeds.
- [ ] **Step 5: Commit** `feat(miniapps): add the group farm supply app`.

---

### Task E1: Integration smoke and CI

**Files:**
- Modify: `platform/tests/smoke-apps.sh`, `.github/workflows/ci.yml`, `DEPENDENCIES.md`

- [ ] **Step 1: Extend `smoke-apps.sh`.** For each of the three apps: `./dxos install`, a manager request through `apisix:9081` answers 200, the published port answers 404, a wrong-role token is refused by the gateway, one write per app succeeds (a ticket, a public order, a registration), `./dxos remove --purge` leaves no schema or role. Through the queue: enable `tea-shop` for `TC`, check that `/apps/tea-shop/public/LB` answers 404 through the web proxy when the web container runs, disable, enable again, and check the product created before is still there.
- [ ] **Step 2: CI.** Run pytest for the three apps next to the tea-tour tests; `python -m dxos_cli validate miniapps/*`; start `./dxos worker` in the background before the store story and stop it after; keep the job inside its 45-minute timeout or raise it with the measured reason. Run `actionlint`.
- [ ] **Step 3: Verify** on a fresh `dxos-clean`: `make platform-smoke` 124 PASS, `make apps-smoke` passes.
- [ ] **Step 4: Commit** `test(platform): cover the store queue and the three business apps in the app smoke`.

### Task E2: Browser stories and screens

**Files:**
- Create: `apps/web/tests/e2e/story/app-store.spec.ts`, `apps/web/tests/e2e/story/business-apps.spec.ts`
- Modify: `apps/web/tests/e2e/visual/screens.spec.ts`, `.github/workflows/ci.yml`

- [ ] **Step 1: Store story** (real Keycloak login, `smoke_` users, worker running): `smoke_manager_tc` opens Kho ứng dụng, presses Cài on Cửa hàng chè, sees `Đang cài…` then `Đã cài`, and the menu shows the app; `smoke_manager_lb` does not see it and `/apps/tea-shop/public/LB` answers 404; a guest at 390 px orders on `/apps/tea-shop/public/TC`; the manager advances the order; the manager presses Gỡ and confirms, the menu item goes; Cài again shows the earlier order.
- [ ] **Step 2: Business story.** `leaf-purchase`: the officer writes two tickets, the manager closes a period, the farmer sees the payout. `farm-supply`: the manager opens a round with two items, the farmer registers, the manager closes the round and marks it delivered.
- [ ] **Step 3: Screens.** Add the store page and one screen per app and role at 1280×800 and 390×844, light and dark, with the existing overflow and overlap assertions.
- [ ] **Step 4: Verify** all specs pass on a fresh `dxos-clean`, together with core-tenant, the A3 story and the tea-tour story.
- [ ] **Step 5: Commit** `test(web): verify the App Store and the business apps in the browser`.

### Task E3: Documentation and two verification rounds

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `docs/miniapps.md`, `docs/api-contract.md`, `DEPENDENCIES.md`, the spec (status line and a "Ghi chú sau triển khai" section in Vietnamese with the rulings and measured numbers)

- [ ] **Step 1: Docs.** README: the App Store, `./dxos worker` (how to run it, including under systemd), the three apps, demo preparation (build the app images ahead; start the worker), personal data held by `tea-shop`. CHANGELOG `[Unreleased]`: complete, with upgrade notes (`make platform-up` recreates postgres once for the new init mount; start `./dxos worker`) and known limits (apps still trust each other; the worker is a host process).
- [ ] **Step 2: Two rounds.** Each: fresh `dxos-clean`, `platform-up`, seed, `platform-smoke`, `apps-smoke`, every browser spec, remove and purge every app, `down -v --remove-orphans` for `dxos-clean` only; then `make build`, `make test`, `make lint`, `npx tsc --noEmit`, every pytest suite, the realm test and `seed-test.sh`. Afterwards restore the owner's stack and list the `docker_*` volumes.
- [ ] **Step 3: Commit** `docs: document the App Store and the business mini-apps`.
- [ ] **Step 4:** Stop. The main session reviews, then asks the owner before merging into `main` and tagging `v1.9.0`.
