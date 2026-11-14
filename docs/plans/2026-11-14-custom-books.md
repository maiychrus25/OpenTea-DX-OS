<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Sổ tự tạo (Custom Books) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cooperative manager builds a record-keeping app ("sổ") on the web without code, from a template or from scratch; it then appears in the menu of the roles allowed to use it and works like any mini-app (entry, list, summary, CSV, print, optional approval).

**Architecture:** One generic mini-app `custom-books` hosts every user-made book of every cooperative (definitions and records as JSONB in its own schema). A new generic manifest key `feed` lets any mini-app publish per-user "sub-apps"; the web app fetches it with the user's token, validates it, and shows the entries in the sidebar and in the App Store. No JavaScript in mini-app pages: the book designer is a set of server-rendered forms.

**Tech Stack:** FastAPI + Jinja2 + psycopg (Python 3.12) on the shared app kit; Next.js 14 server components; Python CLI manifest schema; Playwright.

**Spec:** `docs/specs/2026-11-14-custom-books-design.md`

## Global Constraints

- English-only identifiers; English Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>` (`git -c user.name=maiychrus25 -c user.email=ninhkhuongpl7@gmail.com commit`); no Co-Authored-By trailer; no mention of any AI tool; no push.
- SPDX header (`MIT`, `2026 OpenTea Developers`) on every new text file.
- Never read or print `docker/.env.local` or the repo-root `.env.local`. Never delete `docker_*` volumes. Never run `docker compose up` by hand: only `make …` and `./dxos …`. Full-stack rounds use `COMPOSE_PROJECT_NAME=dxos-clean`.
- No new dependency. No JavaScript, no inline `style` attributes in mini-app pages; the CSP of `/apps/` does not change.
- User-facing text is Vietnamese with full diacritics; money `9.000 ₫`; dates `13/11/2026`.
- Every query filters on `htx_code` from the token. Field labels and option texts never reach SQL; only server-generated field keys (`f<n>`, checked against `^f[0-9]{1,4}$`) and parameters do.
- The feed is untrusted input for the web app: validate, drop bad entries, render as text, never throw into a layout.
- Kit copies (`appkit.py`, `templates/kit.html`) are never edited in an app; `make lint` must stay clean (`appkit-sync.sh --check`).
- No regression: every check of `v1.11.0` keeps passing (`make test` 1644, CLI pytest 147, kit 19, apps 42/62/25/63, `make apps-smoke` 267 PASS, `make platform-smoke` 124 PASS).
- Web package version `1.12.0` from Task F; `custom-books` is `0.1.0` with `requires.core: ">=1.12.0"`.
- UI follows `DESIGN.md` and the app kit: light and dark, no page-level horizontal overflow at 390 px, `:focus-visible`, empty states.

## Review Focus

1. A user at level `own` must not read another user's record by typing its URL, through the CSV, the print page or the summary — B2 test matrix `own level sees only own rows` over list, edit, delete, export, print, summary.
2. A field label such as `x'); DROP TABLE records;--` or `<script>` must be stored and shown as text — B1 test `hostile labels are text`.
3. A feed that is not JSON, is 5 MB, has 500 entries, or has `path: "//evil.example"` must leave the menu intact — F tests `parseFeed drops what it cannot trust`.
4. Changing a field's type after records exist must be refused, and removing a field must keep old data readable — B1 tests `type is locked once the book has records`, `removed field keeps its data`.
5. An approved record must not be editable by its author — B2 test `approved rows are locked for their author`.

---

### Task F: The `feed` contract in the manifest, the web app and the store

**Files:**
- Modify: `platform/apps/manifest.schema.json`, `platform/cli/dxos_cli/manifest.py` (+ `platform/cli/tests/test_manifest.py`), `apps/web/src/domain/entities/installed-app.ts`, `apps/web/src/infrastructure/db/repositories/prisma-installed-app-repository.ts`, `apps/web/src/lib/apps/app-nav.ts`, the three role layouts (`apps/web/src/app/{manager,officer,farmer}/layout.tsx`), the store use case, repository-facing route `apps/web/src/app/api/app-store/route.ts`, `apps/web/src/app/manager/app-store/page.tsx`, `…/_components/AppStoreClient.tsx` (+ tests of each), `apps/web/package.json`, `apps/web/package-lock.json`, `docs/miniapps.md`, `docs/api-contract.md`, `CHANGELOG.md`
- Create: `apps/web/src/application/apps/app-feed.ts`, `apps/web/src/lib/apps/app-icons.tsx` (the allowlisted icon map, moved out of the store components so the sidebar can use it), tests

**Interfaces — Produces:**
- Manifest: optional top-level `feed`, a `$defs/route` string. `validate_manifest` adds an error when `feed` is not covered by a protected route prefix (`/` covers everything).
- Feed response (what an app returns to `GET <feed>` with the caller's bearer token), JSON: `{"entries": [{"label": string, "path": string, "icon": string, "description": string}], "create": {"label": string, "path": string}}`; `create` and `description` optional.
- `app-feed.ts`:
  ```ts
  export interface FeedEntry { label: string; path: string; icon: string | null; description: string }
  export interface AppFeed { entries: FeedEntry[]; create: { label: string; path: string } | null }
  export function parseFeed(raw: unknown): AppFeed          // never throws
  export function createFeedLoader(deps: { getToken: () => Promise<string>; fetchImpl: typeof fetch; now: () => number }):
    (app: InstalledApp, role: AppRole, htxCode: string) => Promise<AppFeed>
  ```
  Rules of `parseFeed`: at most 30 entries (the rest dropped); `label` 1–60 chars after trim; `description` at most 200 (longer is cut), default `''`; `path` matches `^/[a-z0-9_-]+(/[a-z0-9_-]+)*$` and has no unsafe segment (`UNSAFE_SEGMENT`); `icon` kept only when in the store's icon allowlist, else `null`; anything else about an entry wrong → the entry is dropped; `create` validated the same way.
  Loader: `GET ${CORE_GATEWAY_URL}/apps/<id><feed>` with `authorization: Bearer <token>` and `accept: application/json`, `AbortSignal.timeout(1500)`, body read only when status 200 and at most 64 KB; result cached 15 s per `(app.id, htxCode, role)`; any failure → `{ entries: [], create: null }`, not cached, one `logger.error`.
- `InstalledApp.feed: string | null` (from the stored manifest).
- `loadAppNavItems(repository, role, htxCode, loadFeed?)`: after an app's static items, one item per feed entry: `href` = `/<role>/apps/<id><path>`, icon from `app-icons`. The three layouts pass a loader built with `getCoreToken`.
- Store: `GET /api/app-store` data gains `created: { appId: string; appName: string; create: { label: string; href: string } | null; entries: { label: string; description: string; icon: string | null; href: string }[] }[]` — one element per app that is enabled for the caller's HTX and declares a feed (manager's feed). The store page shows a section `Ứng dụng do HTX tự tạo` under the app list: per app its name, the entries as cards with a link `Mở`, the `create` link as a button; section absent when no enabled app has a feed; when the feed has no entry: `Chưa có ứng dụng nào. Bấm "<create label>" để bắt đầu.`

- [ ] **Tests first:** schema accepts `feed: /feed`, refuses `feed: feed` and `feed: /a.json`; `validate_manifest` error when no protected prefix covers it; `parseFeed drops what it cannot trust` (not an object, entries not an array, 31 entries, empty label, 61-char label, path `//evil.example`, path with `..`, unknown icon → null, description 300 chars → cut); loader: sends the bearer, caches 15 s, does not cache a failure, times out, ignores non-200 and bodies over 64 KB; nav: static items then feed items, a throwing loader leaves the static items; store route and component: the section, its empty state, absent without a feed app; repository maps `feed`.
- [ ] Implement; `pytest tests -q -W error` in `platform/cli`, `make test`, `make lint`, `npx tsc --noEmit`, `make build`.
- [ ] **Commits** `feat(platform): let a mini-app publish per-user sub-apps through a manifest feed` and `feat(web): show an app's feed entries in the menu and the App Store`.

---

### Task B1: `custom-books` — storage, designer, templates, feed

**Files:** create `miniapps/custom-books/**` (package `custom_books`, same layout, Dockerfile, pinned requirements and helper modules as `miniapps/tea-tour`); modify `scripts/appkit-sync.sh` (add `miniapps/custom-books/custom_books` to the list, run `make appkit-sync`) and `.github/workflows/ci.yml` (the mini-app unit-test loop).

**Manifest:** `id: custom-books`, `name: Sổ tự tạo`, `version: 0.1.0`, `requires: { core: ">=1.12.0" }`, `routes.protected: { "/": [manager, officer, farmer], "/books": [manager] }`, `menu: [{ label: Sổ của HTX, path: /, roles: [manager, officer, farmer] }]`, `feed: /feed`, `database.migrations`, a `store` block (`category: members`, `icon: clipboard-list`, Vietnamese `about`, `data`, `personal_data`, `core_reads`; no screenshots yet).

**Interfaces — Produces** (`custom_books/fields.py`):
```python
FIELD_TYPES = ("text", "long_text", "number", "money", "date", "choice", "yes_no", "household")
ACCESS_LEVELS = ("none", "view", "own", "all")
MAX_FIELDS, MAX_LIST, MAX_BOOKS, MAX_OPTIONS = 20, 6, 50, 20
@dataclass(frozen=True)
class Field: key: str; label: str; type: str; required: bool; in_list: bool; summary: bool; options: tuple[str, ...]; unit: str
def parse_design(form: Mapping[str, str], existing: Sequence[Field], next_key: int, has_records: bool) -> tuple[list[Field], int, dict[str, str]]
def parse_values(fields: Sequence[Field], form: Mapping[str, str], households: Mapping[str, str] | None) -> tuple[dict, dict[str, str]]
def display(field: Field, value, households: Mapping[str, str]) -> str
```
Design form inputs: `name` (1–80), `description` (0–200), `icon` (store allowlist), per row `i`: `key_i` (empty for a new row), `label_i` (1–60), `type_i`, `options_i` (one option per line, 2–20, each 1–60, for `choice`), `unit_i` (0–20, for `number`), `required_i`, `in_list_i`, `summary_i` (only `number`, `money`), `order_i`, `remove_i`; then `officer_access`, `farmer_access` (`ACCESS_LEVELS`), `approval`. The page shows the existing rows plus three blank ones. Errors are keyed by input name.
Stored values: `text`/`long_text` string (≤200 / ≤2000); `number` a decimal string with at most 3 decimals (accepts `12,5`); `money` an integer; `date` ISO string; `choice` one of the options; `yes_no` boolean; `household` a household id that the caller may use.

Tables (migration `0001_init.sql`): `books(id uuid pk, htx_code, name, description, icon, fields jsonb, next_key int, officer_access, farmer_access, approval boolean, status check in (DRAFT, PUBLISHED, ARCHIVED), created_by, created_at, updated_at)`; `records(id uuid pk, htx_code, book_id fk, data jsonb, entry_date date, household_id, status check in (PENDING, APPROVED, REJECTED), reject_reason, decided_by_name, decided_at, created_by, created_by_name, created_at, updated_at)`; index `(htx_code, book_id, entry_date desc)`.

**Routes** (manager unless noted): `GET /` (every role: cards of the published books the caller may use; the manager also gets a link to `/books`); `GET /feed` (every role: JSON per the feed contract — one entry per published book the role's level is not `none` for, `path: /b/<id>`; `create: { label: "Tạo sổ mới", path: "/books/new" }` for the manager only); `GET /books`; `GET /books/new` (the eight templates and `Sổ trắng`); `POST /books` (`template=<key>`) → 303 `/books/<id>/design`, 409 at 50 books; `GET /books/<id>/design`; `POST /books/<id>/design` → 303 `/books/<id>/design?notice=saved` or 400 with the form; `GET /books/<id>/preview`; `POST /books/<id>/publish` (needs at least one field) → 303 `/b/<id>`; `POST /books/<id>/archive` → 303 `/books`; `POST /books/<id>/delete` → 303 `/books`, 409 when the book has records.
Templates in `custom_books/book_templates.py`, keys `picking`, `spraying`, `fertilising`, `cashbook`, `meeting`, `handover`, `pest`, `visitors` — the eight names of spec §4.4, each 4–8 sensible fields with at least one date field, sensible `in_list`/`summary` flags and access levels (for example `picking`: Ngày, Nông hộ, Số ký hái, Loại chè (lựa chọn), Ghi chú; officer `all`, farmer `own`, approval on).

- [ ] **Tests first:** every rule of `parse_design` (limits, per-type rules, stable keys never reused, `type is locked once the book has records`, `removed field keeps its data`, `hostile labels are text`); `parse_values` per type incl. Vietnamese decimals and bad input; each template creates a valid book; the 50-book limit; publish/archive/delete rules; `/feed` per role and level, only published books, never another HTX's; non-manager refused on every `/books` route; design errors return 400 with typed values kept.
- [ ] Implement; pytest in the app; `dxos_cli validate miniapps/custom-books`; `make lint` (kit sync check); render and look at the books list, the template chooser, the design page (with an error) and the preview at 1280 and 390, light, plus the design page in dark (same file-based method the other apps used; PNGs to `<scratchpad>/kit-pages/custom-books/`).
- [ ] **Commit** `feat(custom-books): design, template and publish record books without code`.

### Task B2: `custom-books` — using a book

**Files:** `miniapps/custom-books/**` only.

**Routes** (access checked on every one; a level of `none` → 403; unknown or other-HTX book → 404; `DRAFT`/`ARCHIVED` books are reachable by the manager only):
- `GET /b/<id>`: list — columns: the `in_list` fields, `Người ghi`, `Ngày`, and `Tình trạng` when the book needs approval; filters `q` (any text field), `from`, `to` (on `entry_date`), `c_<key>` per choice field, `household`, `status`; pagination; totals of `summary` fields for the filtered set; tabs `Danh sách`, `Tổng hợp`, and for the manager `Thiết kế`.
- `GET /b/<id>/new`, `POST /b/<id>/records` → 303 `/b/<id>?notice=saved` or 400 with the form; `GET`/`POST /b/<id>/r/<rid>/edit`; `GET /b/<id>/r/<rid>/delete` (confirmation page) and `POST …/delete` → 303 `/b/<id>?notice=deleted`.
- `POST /b/<id>/r/<rid>/approve`, `POST /b/<id>/r/<rid>/reject` (`reason` 1–200 required) — manager, only when the book needs approval.
- `GET /b/<id>/summary`: stats (rows, per `summary` field the total this month and overall; with approval only `APPROVED` rows count and a tile shows the pending count); chart by month for the last six months of the first `summary` field (or row counts when there is none); chart by option for the first choice field.
- `GET /b/<id>/export.csv` (every field, `Người ghi`, `Ngày ghi`, `Tình trạng`) and `GET /b/<id>/print` — same filters and the same visibility as the list.
Rules: level `view` reads all, writes nothing; `own` reads, edits and deletes only rows with `created_by` = caller; `all` reads all, edits and deletes own rows; the manager everything. With approval: an author may edit a `PENDING` or `REJECTED` row (it returns to `PENDING`), never an `APPROVED` one. `entry_date` = the first date field's value, else the creation day. A farmer may only choose their own household in a `household` field (from Hasura with the farmer's token).

- [ ] **Tests first:** the access matrix role × level × action incl. `own level sees only own rows` over list, edit, delete, export, print and summary; `approved rows are locked for their author`; reject needs a reason; resubmission returns to `PENDING`; filters one by one, `search treats wildcards as text`, paging edges; totals and summary numbers on a fixed set, with and without approval; CSV formula escaping and row visibility; two HTXs isolated; a removed field's old value still shows in the export.
- [ ] Implement; pytest; screenshots of the list (filtered), the entry form with an error, the summary and the print page at 1280 and 390 light, summary in dark; look at them.
- [ ] **Commit** `feat(custom-books): record, approve, summarise, export and print`.

---

### Task I: Integration, screenshots, docs, two verification rounds

**Files:** `platform/tests/smoke-apps.sh`, `apps/web/tests/e2e/**`, `miniapps/custom-books/store/*.png` + `app.yaml` (`store.screenshots`), `README.md`, `CHANGELOG.md`, `docs/miniapps.md`, the spec (status line and "Ghi chú sau triển khai").

- [ ] **Smoke:** install `custom-books`; manager creates a book from the `picking` template over HTTP, publishes it; `/feed` lists it for officer and farmer and nothing for a role at `none`; farmer writes a row, cannot read the officer's row at level `own`; manager approves; CSV at the gateway; purge leaves no schema or role.
- [ ] **Browser story:** the manager opens Kho ứng dụng, installs Sổ tự tạo, presses `Tạo sổ mới`, picks "Chấm công hái chè", renames one field, publishes; the officer and the farmer each see the new menu entry without the manager doing anything else; the farmer adds a row at 390 px; the manager approves it and sees it in the summary; the store shows the book under "Ứng dụng do HTX tự tạo". Screens: books list, template chooser, design, list, summary at 1280 and 390, light and dark. Look at them in the real shell and fix real defects in separate `fix(...)` commits.
- [ ] **Store screenshots** (two: the designer, a book in use) and **docs:** README (how a manager builds a book; the templates), `docs/miniapps.md` (the `feed` contract for app authors), CHANGELOG `[Unreleased]` complete with upgrade notes and known limits (no photos, no formulas, one-step approval, form-based designer).
- [ ] **Two rounds** on a fresh `dxos-clean` as in the previous plans, then restore the owner's stack with `make` targets only (web from this branch; installed apps and enablements unchanged; `custom-books` not installed there) and list the `docker_*` volumes and enablement rows before and after.
- [ ] Stop: the main session reviews, then asks the owner before merging into `main` and tagging `v1.12.0`.
