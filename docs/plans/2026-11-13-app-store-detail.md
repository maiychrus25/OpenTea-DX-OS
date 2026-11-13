<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# App Store Detail, Preview, Progress and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manager can read what a mini-app does and what installing it adds, watch the install step by step, open the app when it is ready, filter the store and see who installed or removed what.

**Architecture:** Everything shown comes from an optional `store` block of `app.yaml`, synced by the CLI into `platform.app_catalog` (text as jsonb, screenshots as bytes in their own table). The host worker reports the install phase into `platform.app_requests.phase`. The web app reads these tables through the existing store repository and adds a detail page, filters and a history view.

**Tech Stack:** Python 3.12 CLI (`platform/cli`, psycopg, jsonschema), bash (`./dxos`), PostgreSQL 16, Next.js 14 + Prisma raw SQL + Jest, Playwright.

**Spec:** `docs/specs/2026-11-13-app-store-detail-design.md`

## Global Constraints

- English-only identifiers; English Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>` (`git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`); no Co-Authored-By trailer; no mention of any AI tool; no push.
- SPDX header (`MIT`, `2026 OpenTea Developers`) on every new text file.
- Never read or print `docker/.env.local` or the repo-root `.env.local`. Never delete `docker_*` volumes. Full-stack rounds use `COMPOSE_PROJECT_NAME=dxos-clean`.
- No new dependency in the CLI, the web app or the mini-apps. Image type is detected from magic bytes, not with an image library.
- No regression: every check of `v1.9.0` keeps passing (`make test` 1524, CLI pytest 104, `make apps-smoke` 215 PASS, `make platform-smoke` 124 PASS, the browser stories). An app without a `store` block installs, removes and shows as today.
- `platform/postgres/init/06-app-store.sql` stays idempotent; its `set_config('dxos.store_first_run', …)` statement stays the first after the schema and its `'*'` insert stays the last (ruling S8).
- Text from a manifest is rendered as plain text only. Icons are names from the allowlist. Screenshots are PNG, WebP or JPEG, at most 400 KB (409600 bytes) each, at most 4 per app.
- The web app never talks to Docker. `./dxos install <dir>` typed by hand behaves exactly as before.
- UI follows `DESIGN.md`: tokens only, light and dark, no page-level horizontal overflow at 390 px, empty/loading/error states, keyboard reachable. New components are added to `DESIGN.md` in the same commit.
- Web package version is `1.10.0` from Task 0. Manifests that carry a `store` block declare `requires.core: ">=1.10.0"`; app versions do not change.

## Review Focus

1. A manifest text containing `<script>` or Markdown must show literally on the page — W4 test `renders manifest text as plain text`.
2. A screenshot path that leaves the app directory (`../x.png`, absolute, symlink target outside) must never be read — P1 tests `screenshot path outside the app is refused`.
3. A file named `.png` that is not an image must not reach the database — P1 test `a non-image file is skipped by sync and reported by validate`.
4. A manager of HTX A must not see HTX B's history or progress — W1 repository test `history binds the HTX of the caller` and W2 route test.
5. A failing `worker-progress` call must not fail an install — P2 smoke-style test `progress failure does not stop install` (unit test of the hook's `|| true` path through `bash -c`).

---

### Task 0: Contract — version, manifest schema, SQL

**Files:**
- Modify: `apps/web/package.json`, `apps/web/package-lock.json` (version `1.10.0`), `platform/apps/manifest.schema.json`, `platform/postgres/init/06-app-store.sql`, `CHANGELOG.md` (`[Unreleased]`), `docs/miniapps.md` (manifest reference: the `store` block)
- Test: `platform/cli/tests/test_manifest.py`, `platform/cli/tests/test_store.py`

**Interfaces — Produces:**

Manifest, optional top-level `store` (object, `additionalProperties: false`, every key optional):

| Key | Schema |
|---|---|
| `category` | enum `production`, `sales`, `members`, `tourism`, `sample` |
| `icon` | enum `leaf`, `scale`, `shopping-bag`, `package`, `map-pinned`, `users`, `calendar`, `clipboard-list`, `truck`, `sparkles` |
| `about` | string, 1–2000 |
| `data` | array, 0–8 items, each string 1–160 |
| `personal_data` | string, 1–300 |
| `core_reads` | array, 0–6 items, each string 1–160 |
| `screenshots` | array, 0–4 items `{ file, caption }`, both required, `additionalProperties: false`; `file` matches `^(?!/)(?!.*(^|/)\.\.(/|$))[A-Za-z0-9._/-]{1,120}$`; `caption` string 1–120 |

SQL, appended before the final `'*'` insert of `06-app-store.sql`:

```sql
ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS store jsonb NOT NULL DEFAULT '{}';
ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS requires_core text NOT NULL DEFAULT '';
ALTER TABLE platform.app_catalog ADD COLUMN IF NOT EXISTS has_database boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS platform.app_catalog_screenshots (
  app_id       text     NOT NULL REFERENCES platform.app_catalog(id) ON DELETE CASCADE,
  position     smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
  caption      text     NOT NULL,
  content_type text     NOT NULL CHECK (content_type IN ('image/png', 'image/webp', 'image/jpeg')),
  bytes        bytea    NOT NULL,
  PRIMARY KEY (app_id, position)
);
ALTER TABLE platform.app_requests ADD COLUMN IF NOT EXISTS phase text CHECK (phase IN ('prepare', 'build', 'register'));
ALTER TABLE platform.app_requests ADD COLUMN IF NOT EXISTS requested_by_name text;
```

- [ ] **Step 1: Failing tests.** `test_manifest.py`: `test_store_block_is_optional` (existing valid fixture still valid); `test_store_block_accepts_every_key` (all seven keys, valid); parametrised `test_store_block_refuses` for: unknown key, `category: other`, `icon: rocket`, `about` of 2001 chars, 9 `data` items, 5 screenshots, `file: ../x.png`, `file: /x.png`, screenshot without `caption`. `test_store.py`: `test_store_sql_is_idempotent_and_adds_columns` (apply `06` twice; `information_schema.columns` has `store`, `requires_core`, `has_database`, `phase`, `requested_by_name`; `app_catalog_screenshots` exists; inserting `phase = 'other'` fails).
- [ ] **Step 2:** Run them, expect FAIL.
- [ ] **Step 3:** Implement the schema block and the SQL; bump the web version; add the `store` reference table to `docs/miniapps.md`; start the `[Unreleased]` entry in `CHANGELOG.md`.
- [ ] **Step 4:** `pytest tests -q -W error` in `platform/cli` → all pass (104 + new); `make test`, `make lint`.
- [ ] **Step 5: Commit** `feat(platform): describe an app for the store in its manifest`.

---

### Task P1: Sync the store block and screenshots; validate the files

**Files:**
- Create: `platform/cli/dxos_cli/store_assets.py`
- Modify: `platform/cli/dxos_cli/store.py` (`sync_catalog`), `platform/cli/dxos_cli/__main__.py` (`cmd_validate`)
- Test: `platform/cli/tests/test_store_assets.py`, `platform/cli/tests/test_store.py`; fixtures under `platform/cli/tests/fixtures/` (tiny valid PNG, WebP and JPEG written by the test from byte literals, not committed binaries)

**Interfaces:**
- Consumes: Task 0 schema and tables.
- Produces:
  - `store_assets.MAX_BYTES = 409600`
  - `store_assets.read_screenshot(app_dir: Path, rel: str) -> tuple[str, bytes]` — returns `(content_type, bytes)`; raises `ManifestError` (Vietnamese message naming the file) when the resolved path is outside `app_dir` (after `resolve()`, so a symlink out is refused), is missing, is not a regular file, is larger than `MAX_BYTES`, or does not start with a PNG (`\x89PNG\r\n\x1a\n`), JPEG (`\xff\xd8\xff`) or WebP (`RIFF` … `WEBP` at offset 8) signature.
  - `store_assets.check_store_files(app_dir: Path, manifest: dict) -> list[str]` — one message per bad screenshot; `cmd_validate` adds them to its errors.
  - `sync_catalog` writes `store` (the block without `screenshots`, `{}` when absent), `requires_core` (`manifest["requires"]["core"]`), `has_database` (`"database" in manifest`), and replaces the app's rows of `app_catalog_screenshots` inside one transaction per app; a bad screenshot is skipped with `catalog-sync: bỏ qua ảnh <file> của <id>: <reason>` on stderr and the remaining ones keep their order with positions `0..n-1`.

- [ ] **Step 1: Failing tests.** `test_store_assets.py`: accepts PNG, WebP, JPEG; `screenshot path outside the app is refused` (`../x.png`, a symlink to a file outside); missing file; directory; 409601 bytes; `a non-image file is skipped by sync and reported by validate` (text file named `a.png`). `test_store.py`: sync stores the block, `requires_core`, `has_database`; two screenshots land at positions 0 and 1 with captions; a second sync after removing one screenshot leaves one row; an app without `store` has `store = {}` and no screenshot rows; removing the app directory deletes its screenshots (cascade).
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS), `pytest tests -q -W error`.
- [ ] **Step 5: Commit** `feat(platform): sync the store block and screenshots into the catalogue`.

### Task P2: Install phases

**Files:**
- Modify: `platform/cli/dxos_cli/store.py`, `platform/cli/dxos_cli/__main__.py`, `dxos`
- Test: `platform/cli/tests/test_store.py`, `platform/cli/tests/test_dxos_script.py` (new; drives small bash snippets, no Docker)

**Interfaces:**
- Produces:
  - `store.PHASES = ("prepare", "build", "register")`
  - `store.set_phase(conn, job_id: str, phase: str) -> bool` — `UPDATE … SET phase = %s WHERE id = %s AND status = 'RUNNING'`; `ValueError` for a phase outside `PHASES` or a `job_id` that is not a UUID; returns whether a row changed.
  - CLI `worker-progress <job_id> <phase>` — exit 0 when updated or when no RUNNING row matched (the request may have been closed), exit 1 with a stderr line for a bad argument or a database error.
  - `dxos`: `progress() { [ -z "${DXOS_JOB:-}" ] || cli worker-progress "$DXOS_JOB" "$1" >/dev/null 2>&1 || true; }`; `install()` calls `progress prepare` before `cli prepare`, `progress build` before `app … up -d --build --wait`, `progress register` before `cli commit`; `worker()` runs its install subshell with `DXOS_JOB="$job"`. Nothing else in `install()` or `worker()` changes.
- `finish()` does not touch `phase`: a FAILED request keeps the phase that failed.

- [ ] **Step 1: Failing tests.** `test_store.py`: `set_phase` updates a RUNNING row; leaves PENDING, DONE and FAILED rows alone and returns False; refuses `"other"` and `"not-a-uuid"`; `main(["worker-progress", …])` exit codes; a FAILED request still has its phase after `finish(..., False, …)`. `test_dxos_script.py`: sourcing the `progress` function from `dxos` (extract it with `sed -n '/^progress()/,/^}/p'`) with a stub `cli` that exits 1 — `progress failure does not stop install` (the snippet's exit status is 0 under `set -e`) and no call when `DXOS_JOB` is empty.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); `bash -n dxos`; `shellcheck -S warning dxos` when available.
- [ ] **Step 5: Commit** `feat(platform): report the install phase of a store request`.

---

### Task W1: Domain, use case and repository

**Files:**
- Modify: `apps/web/src/domain/entities/app-store.ts`, `apps/web/src/application/apps/app-store.usecase.ts`, `apps/web/src/infrastructure/db/repositories/prisma-app-store-repository.ts`
- Create: `apps/web/src/application/apps/install-preview.ts`
- Test: `apps/web/src/__tests__/application/apps/app-store.usecase.test.ts`, `…/install-preview.test.ts`, `apps/web/src/__tests__/infrastructure/db/prisma-app-store-repository.test.ts`

**Interfaces — Produces** (in `app-store.ts`):

```ts
export type StoreCategory = 'production' | 'sales' | 'members' | 'tourism' | 'sample'
export type InstallPhase = 'prepare' | 'build' | 'register'
export type RequestStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'
export interface StoreMenuEntry { label: string; path: string; roles: string[] }
export interface StoreApp {            // existing fields stay
  category: StoreCategory | null; icon: string | null
  installedOnServer: boolean
  /** Phase of the open request, or of the last request when it failed. */
  phase: InstallPhase | null
  /** `/manager/apps/<id><path>` of the first menu entry for managers when the HTX can use the app, else null. */
  openHref: string | null
}
export interface StoreHistoryEntry {
  id: string; appId: string; appName: string; action: StoreAction; status: RequestStatus
  requestedByName: string | null; createdAt: string; finishedAt: string | null; error: string | null
}
export interface StoreScreenshot { position: number; caption: string; url: string }
export interface StoreAppDetail extends StoreApp {
  about: string[]; menu: StoreMenuEntry[]; data: string[]; personalData: string | null; coreReads: string[]
  requiresCore: string; hasDatabase: boolean
  /** `/apps/<id>/public/<htxCode>` when the app has public pages and the HTX can use it. */
  publicUrl: string | null
  preview: string[]; screenshots: StoreScreenshot[]; history: StoreHistoryEntry[]
}
```

- `installPreview(app: { id; menu; hasPublic; hasDatabase; coreReads; installedOnServer }, htxCode: string): string[]` in `install-preview.ts`, in the order and wording of spec §6.3; role labels `manager` → `Trưởng HTX`, `officer` → `Cán bộ`, `farmer` → `Nông dân`, joined with `, `.
- `AppStoreUseCase`: `list(htxCode)` (now with the new fields), `detail(htxCode, appId): Promise<StoreAppDetail>` (throws `AppStoreError('APP_NOT_FOUND', …)`), `history(htxCode): Promise<StoreHistoryEntry[]>` (50 newest), `screenshot(appId, position): Promise<{ contentType: string; bytes: Uint8Array } | null>`, `requestChange(tenant: { htxCode; userId; userName: string | null }, appId, action)`.
- `about` is split on blank lines into trimmed, non-empty paragraphs. A `store` value of the wrong shape in the database (not an object, an unknown category or icon) degrades to null/empty, never throws.
- Repository: every statement binds the HTX with a parameter; `history(htxCode, appId | null, limit)`; `createRequest(appId, htxCode, action, requestedBy, requestedByName)` stores at most 120 characters of the name.

- [ ] **Step 1: Failing tests.** `install-preview.test.ts`: full list for an app with two menu entries, public pages, a database, one `core_reads`, not installed; the "đã có trên máy chủ" line when installed; an app with nothing declared gives only the last line. `app-store.usecase.test.ts`: `openHref` is `/manager/apps/tea-shop` for `path: /` and `/manager/apps/leaf-purchase/periods` for the first manager entry, null when not enabled or no manager entry; `phase` comes from the open request, from the last request when failed, null otherwise; `detail` throws `APP_NOT_FOUND`; `about` paragraphs; malformed `store` degrades. Repository: `history binds the HTX of the caller` (SQL text and parameters), limit, optional app filter; `createRequest` binds the name and truncates to 120; screenshot query binds app and position.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(web): read store details, install phase and history`.

### Task W2: API

**Files:**
- Modify: `apps/web/src/app/api/app-store/route.ts`, `apps/web/src/app/api/app-store/requests/route.ts`, `docs/api-contract.md`
- Create: `apps/web/src/app/api/app-store/apps/[id]/route.ts`, `apps/web/src/app/api/app-store/apps/[id]/screenshots/[position]/route.ts`, `apps/web/src/app/api/app-store/history/route.ts`
- Test: `apps/web/src/__tests__/app/app-store/routes.test.ts`

**Interfaces — Produces:** all `force-dynamic`, manager only (401 without a session, 403 for another role, same bodies as the existing routes), HTX from `requireTenant()`.
- `GET /api/app-store/apps/[id]` → 200 `{ data: StoreAppDetail }`; `id` must match `^[a-z][a-z0-9-]{1,30}$`, otherwise and for an unknown app 404 `{ error: { code: 'APP_NOT_FOUND', message } }`.
- `GET /api/app-store/apps/[id]/screenshots/[position]` → 200 with the stored bytes, `content-type` as stored, `x-content-type-options: nosniff`, `cache-control: private, max-age=300`; `position` must be `0`–`3`; anything else 404.
- `GET /api/app-store/history` → 200 `{ data: StoreHistoryEntry[] }`.
- `POST /api/app-store/requests` passes `session.user.name ?? null` as `userName`.

- [ ] **Step 1: Failing tests** for each route: 401, 403, 404 cases, the HTX passed to the use case is the session's and a body or query value named `htxCode` is ignored, screenshot headers, `userName` passed on POST.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): serve store details, screenshots and history`.

### Task W3: Store page — search, filters, cards, history tab

**Files:**
- Modify: `apps/web/src/app/manager/app-store/page.tsx`, `apps/web/src/app/manager/app-store/_components/AppStoreClient.tsx`, `AppStoreClient.module.css`
- Create: `apps/web/src/app/manager/app-store/_components/store-labels.ts` (labels and the icon map), `StoreAppIcon.tsx`, `StoreHistory.tsx`, `use-store-polling.ts` (the 3 s poll + `router.refresh()` when work ends, moved out of `AppStoreClient` unchanged in behaviour)
- Test: `apps/web/src/__tests__/app/app-store/AppStoreClient.test.tsx`, `StoreHistory.test.tsx`

**Exact copy:** tabs `Ứng dụng`, `Lịch sử`; search placeholder and label `Tìm ứng dụng`; status filters `Tất cả`, `Đã cài`, `Chưa cài`; category labels `Sản xuất và thu mua`, `Bán hàng`, `Thành viên và vật tư`, `Du lịch`, `Ứng dụng mẫu`; `Không có ứng dụng nào khớp bộ lọc.`; history columns `Thời điểm`, `Ứng dụng`, `Yêu cầu` (`Cài`/`Gỡ`), `Người yêu cầu` (`—` when unknown), `Kết quả` (`Đang chờ`, `Đang xử lý`, `Xong`, `Lỗi`); `Chưa có yêu cầu cài hoặc gỡ nào.`

**Behaviour:** search matches name and description after `normalize('NFD')`, removing combining marks, mapping `đ` to `d`, lower-casing; "Đã cài" = `enabled`, `enabled_all`, `removing`; "Chưa cài" = `available`, `installing`, `failed`; only categories that have an app get a filter button; filter buttons carry `aria-pressed`; the card's name is a link to `/manager/app-store/<id>` and the action buttons stay on the card; the history tab loads `GET /api/app-store/history` when first opened, with loading and error states; icons come from `lucide-react` through a fixed map from the ten allowlisted names, any other value shows the default `LayoutGrid`.

- [ ] **Step 1: Failing tests:** `che` finds "Cửa hàng chè" and `vat tu` finds "Vật tư mua chung"; category and status filters; the empty-filter message; the card links to the detail page; the existing install, remove, retry, worker-warning and refresh tests still pass; history rows, empty and error states.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(web): search, filter and history in the App Store`.

### Task W4: Detail page

**Files:**
- Create: `apps/web/src/app/manager/app-store/[id]/page.tsx`, `apps/web/src/app/manager/app-store/_components/AppStoreDetail.tsx`, `AppStoreDetail.module.css`, `InstallProgress.tsx`
- Modify: `DESIGN.md` (components: screenshot strip, step progress, filter buttons)
- Test: `apps/web/src/__tests__/app/app-store/AppStoreDetail.test.tsx`, `InstallProgress.test.tsx`

**Exact copy:** back link `← Kho ứng dụng`; buttons `Cài`, `Gỡ`, `Thử lại`, `Mở ứng dụng`; `Ứng dụng này dành cho <vai, …>.` when enabled without a manager entry; headings `Ảnh màn hình`, `Giới thiệu`, `Khi cài, ứng dụng sẽ`, `Dữ liệu`, `Thông tin`, `Lịch sử của ứng dụng này`; data sub-labels `Ứng dụng lưu`, `Dữ liệu cá nhân`, `Đọc từ hệ thống`; note `Theo khai báo của nhà phát hành. Gỡ ứng dụng vẫn giữ dữ liệu.`; info labels `Phiên bản`, `Giấy phép`, `Nhà phát hành`, `Yêu cầu phiên bản lõi`, `Trang công khai`; steps `Đã gửi yêu cầu`, `Chuẩn bị`, `Dựng và khởi động`, `Đăng ký`; `Đang chờ trình cài đặt`; `Đang bật cho HTX…`; `Đang gỡ khỏi HTX…`.

Failure guidance by phase: `prepare` → `Ứng dụng không qua được bước kiểm tra hoặc tạo kho dữ liệu. Quản trị máy chủ xem nhật ký của ./dxos worker.`; `build` → `Ứng dụng không dựng hoặc không khởi động được. Quản trị máy chủ kiểm tra Docker và nhật ký của ./dxos worker.`; `register` → `Ứng dụng đã chạy nhưng chưa đăng ký được vào cổng. Bấm Thử lại; nếu vẫn hỏng, báo quản trị máy chủ.`; none → `Bấm Thử lại; nếu vẫn hỏng, báo quản trị máy chủ.`

**Behaviour:** server page loads `detail`, `notFound()` on `APP_NOT_FOUND`; the client polls `GET /api/app-store/apps/<id>` every 3 s while the status is `installing` or `removing` (through `use-store-polling.ts`) and refreshes the menu at the end; `InstallProgress` renders only for `installing`, `removing` or `failed`: for `installing` with a phase the four steps with `aria-current="step"` on the active one, without a phase and `installedOnServer` the single line, without a phase otherwise `Đang chờ trình cài đặt` (the worker warning stays as on the store page); for `failed` the failed step marked and the error plus guidance; screenshots are `<img loading="lazy" alt={caption}>` in a horizontally scrolling strip that scrolls inside itself (no page overflow); the public URL uses the existing copy button component; sections with nothing to show are not rendered.

- [ ] **Step 1: Failing tests:** `renders manifest text as plain text` (an `about` containing `<script>alert(1)</script>` and `**bold**` appears literally and no `script` element exists); preview list items; data sections omitted when empty; `Mở ứng dụng` href; the "dành cho" line; public URL only when enabled; progress in each state with `aria-current`; failure guidance per phase; polling stops when work ends and refreshes once; history table.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); `make test`, `make lint`, `npx tsc --noEmit`, `make build`.
- [ ] **Step 5: Commit** `feat(web): add the App Store detail page with install preview and progress`.

---

### Task C: Store text for the five apps

**Files:** Modify only `miniapps/hello/app.yaml`, `miniapps/tea-tour/app.yaml`, `miniapps/leaf-purchase/app.yaml`, `miniapps/tea-shop/app.yaml`, `miniapps/farm-supply/app.yaml`.

- Each gets `requires: { core: ">=1.10.0" }` and a `store` block without `screenshots` (Task I1 adds them): `leaf-purchase` → `production`, `scale`; `tea-shop` → `sales`, `shopping-bag`; `farm-supply` → `members`, `package`; `tea-tour` → `tourism`, `map-pinned`; `hello` → `sample`, `sparkles`.
- `about`: 2–3 short Vietnamese paragraphs for a cooperative manager: what the app is for, who does what, what the HTX gets. `data`, `personal_data`, `core_reads`: true to the code — read each app's `README.md`, `migrations/` and its Hasura calls before writing; an app that reads nothing from the core has no `core_reads`; an app that stores no personal data has no `personal_data`.
- Vietnamese with full diacritics, plain words, no English jargon, no marketing claims the app does not fulfil.

- [ ] **Step 1:** Write the blocks. **Step 2:** `python -m dxos_cli validate miniapps/*` with the Task 0 schema → `hợp lệ` ×5; each app's own pytest suite still passes. **Step 3: Commit** `feat(miniapps): describe the five apps for the store`.

---

### Task I1: Screenshots

**Files:** Create `miniapps/<id>/store/*.png`; modify the five `app.yaml` (`store.screenshots`); create `apps/web/tests/e2e/tools/store-screenshots.spec.ts` (skipped unless `E2E_STORE_SHOTS=1`).

- Captured from the real apps on a `dxos-clean` stack with realistic Vietnamese sample data, 1280×800, light theme, the app page only (the frame, not the shell), PNG, each at most 400 KB (reduce the capture area or colours if needed; no new tool dependency). Two each for `leaf-purchase`, `tea-shop`, `farm-supply` (the manager's main page, and the page of another role or the public page), one for `tea-tour`, none for `hello`. No personal data of real people; sample names only.
- [ ] Capture, add entries with Vietnamese captions, `./dxos validate miniapps/*`, **Commit** `feat(miniapps): add store screenshots`.

### Task I2: Integration smoke and CI

**Files:** `platform/tests/smoke-apps.sh`, `.github/workflows/ci.yml`

- [ ] `[store queue]`: after `catalog-sync`, `app_catalog.store->>'category'` of `tea-shop` is `sales`, `has_database` is true, and its screenshot count equals the manifest's; during one worker install poll `phase` and assert at least one of `prepare`, `build`, `register` was seen and the request ends `DONE`; the failing install (`broken-health`) ends `FAILED` with `phase = 'build'`; a hand `./dxos install miniapps/hello` creates no request row and changes no `phase`; `./dxos validate` of a copy of `hello` with a text file declared as a screenshot exits 1. Keep `fresh_tokens` and `sed -n 1p` conventions. CI: nothing new unless a step is needed; `actionlint`.
- [ ] Verify on a fresh `dxos-clean`: `make platform-smoke` 124 PASS, `make apps-smoke` passes. **Commit** `test(platform): cover store details and install phases in the app smoke`.

### Task I3: Browser story and screens

**Files:** `apps/web/tests/e2e/story/app-store.spec.ts`, `apps/web/tests/e2e/visual/screens.spec.ts`

- [ ] Story: the manager searches `che`, opens the detail of Cửa hàng chè, sees a screenshot, the preview line about the public page and the data note, presses Cài, sees the steps and then `Đã cài`, presses `Mở ứng dụng` and lands in the app, returns and sees the history row with their name; the existing LB, guest, remove and reinstall parts stay. Screens: store list, history tab and detail page at 1280×800 and 390×844, light and dark, with the existing overflow and overlap assertions. **Commit** `test(web): verify the App Store detail page in the browser`.

### Task I4: Documentation and two verification rounds

**Files:** `README.md`, `CHANGELOG.md`, `docs/miniapps.md`, `docs/api-contract.md`, `DEPENDENCIES.md` (no change expected; say so), the spec (status line and "Ghi chú sau triển khai")

- [ ] Docs: README (what a manager sees in the store; how an app author fills the `store` block and takes screenshots); CHANGELOG `[Unreleased]` complete with upgrade notes (`make platform-up` applies the new columns without recreating `postgres`; rebuild the web image; restart `./dxos worker` so it reports phases) and known limits (declared data is not enforced; no update flow).
- [ ] Two rounds, each: fresh `dxos-clean`, `platform-up`, seed, `platform-smoke`, every browser spec in CI order, `apps-smoke`, remove and purge every app, `down -v --remove-orphans` for `dxos-clean` only; then `make build`, `make test`, `make lint`, `npx tsc --noEmit`, every pytest suite. Afterwards restore the owner's stack and list the `docker_*` volumes.
- [ ] **Commit** `docs: document the App Store detail page and the store block`. Stop: the main session reviews, then asks the owner before merging into `main` and tagging `v1.10.0`.
