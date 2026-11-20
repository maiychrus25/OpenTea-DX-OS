<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# HTX Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only mini-app `htx-dashboard` that gives a cooperative manager one overall, monitoring view of the cooperative: scale, production, lots, crop health, sensors with a per-parcel digital twin, data lifecycle, and what needs attention.

**Architecture:** A stateless FastAPI + Jinja2 mini-app without a database. Every figure comes from the core through Hasura with the viewer's token (`core_client`), is computed by pure functions (`metrics`), and is rendered server-side with the shared kit plus SVG line charts. One shared, read-only platform change: the view `telemetry.sensor_daily` tracked by Hasura.

**Tech Stack:** FastAPI, Jinja2, Python 3.12 standard library (HTTP client and thread pool as in the existing apps); PostgreSQL view; Hasura metadata; bash smoke tests; Playwright.

**Spec:** `docs/specs/2026-11-20-htx-dashboard-design.md` (Vietnamese; the authority for every page, figure definition and limit).

## Global Constraints

- English-only identifiers; English Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>`; no trailer; no mention of any AI tool; no push.
- SPDX header (`MIT`, `2026 OpenTea Developers`) on every new text file.
- Never read or print any `.env*` file. Never delete `docker_*` volumes. Never touch the owner's running stack; a full stack runs only in Task I, with `COMPOSE_PROJECT_NAME=dxos-clean`.
- No JavaScript, no inline `style` attributes, no cookies in the app's pages. No new dependency. The app has no database and writes nothing.
- Every GraphQL query is a module constant; user input reaches it only as GraphQL variables, and reaches HTML only through autoescape.
- User-facing text is Vietnamese with full diacritics; Vietnam time for every day and week boundary.
- Kit copies (`appkit.py`, `templates/kit.html`) are never edited in the app.
- Versions: web `1.13.0` (Task V), `htx-dashboard` `0.1.0` with `requires.core: ">=1.13.0"`.
- No regression: every existing suite keeps its count and passes.

## Review Focus

1. A manager of cooperative `TC` must never see a row of `LB` through the new view, and a farmer must not read it at all — Task V checks in `smoke-dataops.sh`.
2. The core answering slowly, with an error, or with an unexpected shape on any one query must leave the page standing with that block marked — Task A tests `one failing query leaves the page up`, `malformed core answer is a block error`.
3. Boundaries of the attention rules (exactly 3 days, exactly 6 hours, a cycle due today, a period with no rows) — Task A tests in `tests/test_metrics.py`.
4. Day and week buckets in Vietnam time across midnight UTC, in the view and in the app — Task V check `a reading at 18:30 UTC lands on the next Vietnam day`, Task A test `week buckets use Vietnam time`.
5. Hostile text in a household name or a note renders as text and is neutralised in CSV; a parcel code that does not match the pattern never reaches a query — Task A.

---

### Task V: Platform — view `telemetry.sensor_daily`, Hasura permission, web 1.13.0

**Files:**
- Create: a new init file in `platform/postgres/init/` (next number after the existing ones) with the view; `platform/hasura/metadata/databases/default/tables/telemetry_sensor_daily.yaml`
- Modify: `platform/hasura/metadata/databases/default/tables/tables.yaml`, `platform/tests/smoke-dataops.sh`, any test that enumerates tracked tables or init files, `apps/web/package.json` and `package-lock.json` (version `1.13.0`) with the places that pin the current core version, `docs/` page that documents the telemetry schema, `CHANGELOG.md` `[Unreleased]`

**Interfaces — Produces:** GraphQL root field `telemetry_sensor_daily` with columns `htx_code`, `parcel_code`, `sensor`, `day` (date, Vietnam time), `reading_count`, `min_value`, `max_value`, `avg_value`, `first_ts`, `last_ts`; select for `manager` and `officer` with the filter of `telemetry_sensor_readings`; nothing for `farmer`.

- [ ] **Step 1:** read how `telemetry_sensor_readings` is created, tracked and checked (init file, metadata, `smoke-dataops.sh`, CI job that runs it); write the new checks first: Review Focus 1 and 4, `count, min, max, avg match the raw readings for one parcel and sensor`.
- [ ] **Step 2:** the view (`CREATE OR REPLACE VIEW`, grouped on `(ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`), the metadata file and include.
- [ ] **Step 3:** version bump, docs, CHANGELOG. Static verification available without a stack: `make lint`, `make test`, `npx tsc --noEmit`, a parse of the SQL against the throwaway Postgres the CLI tests use if practical. The smoke itself runs in Task I. Commit `feat(platform): daily sensor view for dashboards`.

### Task A: The app

**Files:** `miniapps/htx-dashboard/**` (new: `app.yaml`, `Dockerfile`, `requirements*.txt`, `README.md`, package `htx_dashboard` with `main.py`, `claims.py`, `core_client.py`, `metrics.py`, `charts.py`, `routes`, `templates/`, `static/`, `tests/`), `scripts/appkit-sync.sh` (PACKAGES), the CI step that lists mini-app unit tests.

**Interfaces — Consumes:** Task V's root field (shape above); the Hasura tables the `manager` role may select (metadata files); the kit.

- [ ] **Step 1: metrics.** `tests/test_metrics.py` first: every figure and attention rule of spec §5 on fixed sample rows, with Review Focus 3 and 4, then `metrics.py` (pure functions, typed dataclasses in, dataclasses out).
- [ ] **Step 2: core client.** One query constant per page block; parallel execution with a 5 s timeout each; a typed result or a block error; tests with a stub transport (Review Focus 2); role and cooperative from claims, 403 otherwise.
- [ ] **Step 3: charts.** `charts.py`: line chart geometry (points, axis ticks, empty and single-point series) with tests; SVG markup in a Jinja macro without `style`.
- [ ] **Step 4: pages.** The seven tabs of spec §4 with rules 1–6, CSV and print for each tab's main table, empty states; page tests with stubbed core answers: every tab 200 for a manager, 403 for other roles, Review Focus 5, no `<script>` and no `style=` in any page.
- [ ] **Step 5: preview and visual pass.** A preview script that serves the app with stubbed core answers built from a realistic sample (a cooperative with about 40 parcels, 12 households, sensors on 8 parcels, a silent sensor, pending journals, disease reports, lots in every status, lifecycle runs incl. a failed one) and the production CSP; capture every tab and the parcel page at 1280×800 and 390×844, light and dark; look at each image and fix hierarchy, spacing, overflow, contrast and empty states.
- [ ] **Step 6:** manifest and store block, README, `python -m dxos_cli validate` (against a tree that has web 1.13.0, or noted for Task I), `appkit-sync.sh --check`, the whole suite with `-W error`. Commit `feat(miniapps): htx-dashboard, an overall view of a cooperative`.

### Task I: Integration

Runs after V and A are merged into `feat/htx-dashboard`; its brief is written from the merged tree. Scope (spec §9): `smoke-apps.sh` block and preflight, seeded sensor readings for the checks, Playwright story and screens, store screenshots from the real stack, `docs/miniapps.md`, root `README.md`, `DEPENDENCIES.md`, `CHANGELOG.md`, CI steps, load time of each tab on seeded data, two clean rounds on `dxos-clean`, `make build`, `make test`, `make lint`.
