<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Tier 2b — Tea Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the app into a tea-cooperative product: a tea leaf disease model trained on CC BY 4.0 data, multi-round tea harvests, tea demo data and accounts, a working journal photo upload, and a tokenised light/dark design.

**Architecture:** A reproducible training script in `ai-models/tea/` produces a second Keras model that `apps/disease-api` serves next to the existing one, selected by the parcel's crop. Web changes stay inside the existing ports, use cases and routes. Design tokens in `globals.css` drive both themes, and a test blocks hard-coded colours.

**Tech Stack:** Python 3.11 (disease-api image) and 3.12 (training container), `tensorflow==2.21.0`, Keras MobileNetV2, FastAPI, Next.js, Prisma, Playwright, Tailwind v4.

**Spec:** `docs/specs/2026-11-10-tier2b-tea-domain-design.md`

## Global Constraints

- Do not touch existing migrations. No new npm dependencies. New Python dependencies only in `apps/disease-api/requirements*.txt` and `ai-models/tea/requirements.txt`, all pinned exactly.
- New files carry `SPDX-License-Identifier: MIT` and `SPDX-FileCopyrightText: 2026 OpenTea Developers` in the file's comment syntax.
- English identifiers and commit messages; Conventional Commits; author `maiychrus25 <ninhkhuongpl7@gmail.com>`; no `Co-Authored-By`; never push without owner approval.
- User-facing copy is Vietnamese. Product name is exactly `OpenTea DX-OS`.
- Datasets are never committed. Credit every dataset in `ai-models/ATTRIBUTION.md` with authors, title, DOI and `CC BY 4.0`.
- Values from the spec: confidence threshold default `0.6`; stop and report to the owner if overall test accuracy is below `0.80`; upload content types `image/jpeg`, `image/png`, `image/webp`; upload URL lifetime `900` seconds; journal photo key `para/<htxCode>/Areas/Journal/<yyyy>/<uuid>-<safe name>`; season label `Lứa <n>/<year>`; demo HTXs `TC` (Tân Cương) and `LB` (La Bằng).
- Existing web tests may change only where an interface or the demo data changed; never delete or skip one.
- Never delete the owner's Docker volumes (`docker_*`). A clean-database run is: `make platform-down; COMPOSE_PROJECT_NAME=dxos-clean make platform-up && COMPOSE_PROJECT_NAME=dxos-clean make platform-smoke`, then the browser specs under the same project, then `COMPOSE_PROJECT_NAME=dxos-clean docker compose -f docker/docker-compose.yml down -v`, and finally `make platform-up`.
- Never read or print `docker/.env.local`.

## Review Focus

- **Crop names in many spellings** (`Chè Trung du`, `CHÈ`, `Tea`, `Che shan tuyet`): all select the tea model; `Lúa`, `Rau`, empty and null select the general model — test in Task 4.
- **Starting a new round twice, or on a parcel that is not `HARVESTED`**: refused without creating a cycle — test in Task 5.
- **A lot whose parcels were harvested in different rounds, one of them after the lot's harvest date**: export refused — test in Task 5.
- **Seeding a database that already holds other HTXs' data**: seed changes only `TC` and `LB` rows and can run twice — test in Task 7.
- **Theme with `localStorage` unavailable**: the page follows the system setting, never throws, and shows no flash of the wrong theme — test in Task 9.

---

### Task 1: Pin the disease API and keep the existing model working

**Files:**
- Modify: `apps/disease-api/requirements.txt`, `apps/disease-api/Dockerfile`, `.github/workflows/ci.yml` (`lint-backend` job), `DEPENDENCIES.md`
- Create: `apps/disease-api/requirements-dev.txt`, `apps/disease-api/tests/__init__.py`, `apps/disease-api/tests/test_general_model.py`

- [ ] **Step 1: Prove the existing model loads under `tensorflow==2.21.0`.** In a `python:3.11-slim` container, install the pinned set and load `ai-models/leaf_disease_model.keras`. Record one prediction on a fixed sample image (generate a deterministic image, for example a solid-colour 224×224 PNG) under the old unpinned image and the new one; the top class and its confidence to 4 decimals must match. If loading fails, stop and report BLOCKED with the error.
- [ ] **Step 2: Pin.** `requirements.txt` lists exact versions of `fastapi`, `uvicorn[standard]`, `python-multipart`, `Pillow`, `numpy`, `tensorflow==2.21.0` and the `keras` version it pulls. `requirements-dev.txt` adds `pytest==9.1.1` and `httpx` pinned.
- [ ] **Step 3: Tests.** `test_health_reports_general_model_loaded`, `test_predict_returns_existing_response_shape` (fields `disease_name_vi`, `disease_name_en`, `confidence`, `top3`) using FastAPI `TestClient` and the real model.
- [ ] **Step 4: CI.** The `lint-backend` job installs `requirements-dev.txt` and runs `python -m pytest tests -q -W error` from `apps/disease-api`.
- [ ] **Step 5: Verify.** `docker compose -f docker/docker-compose.yml build disease-api` succeeds on this arm64 host; `make build` succeeds. Expected: "Build succeeded" or exit 0.
- [ ] **Step 6: Commit** `build(disease-api): pin tensorflow 2.21 and test the existing model`.

---

### Task 2: Train the tea model

**Files:**
- Create: `ai-models/tea/{datasets.json,train.py,requirements.txt,README.md,MODEL_CARD.md}`, `ai-models/tea_leaf_model.keras`, `ai-models/tea_class_names.txt`, `ai-models/tea_class_names_vi.json`
- Modify: `ai-models/ATTRIBUTION.md`, `.gitignore` (the download and work folders)

**Interfaces:**
- Produces: `tea_leaf_model.keras` taking a float32 batch `(n, 224, 224, 3)` in the same preprocessing as the existing model; `tea_class_names.txt` one English class id per line in output order; `tea_class_names_vi.json` mapping each class id to `{ "vi": string, "needs_officer_review": true }`.

- [ ] **Step 1: `datasets.json`.** The three datasets of spec §4.1 with DOI, download URL, SHA-256 (computed from the first download), licence, and a mapping from each source label to the unified class ids `algal_leaf_spot`, `brown_blight`, `gray_blight`, `red_leaf_spot`, `helopeltis`, `birds_eye_spot`, `white_spot`, `healthy`. Labels that match no id are dropped and listed.
- [ ] **Step 2: `train.py`** with subcommands `download`, `prepare`, `train`, `evaluate`, each idempotent, writing to `ai-models/tea/.work/` (git-ignored). `prepare` crops boxes for the annotated dataset and drops classes with fewer than 100 images. Split 70/15/15 stratified, seed `20261110`. `train`: MobileNetV2 ImageNet weights, frozen base then a short fine-tune, early stopping on validation loss. `evaluate`: accuracy and per-class precision, recall and F1 on the test split, plus the leave-one-source-out check, written to `.work/metrics.json`.
- [ ] **Step 3: Run it** in `python:3.12.15-slim-bookworm` with `ai-models/tea/requirements.txt` pinned (`tensorflow==2.21.0`, matching Task 1's `keras`). Use the shell's background option and write logs to the scratchpad; wait for completion.
- [ ] **Step 4: Gate.** If test accuracy is below `0.80`, stop and report the metrics as BLOCKED. Otherwise pick the confidence threshold: the lowest value at or above `0.6` that keeps precision of accepted predictions at or above `0.90` on the validation split; record it.
- [ ] **Step 5: Artifacts.** Export the model and class files. `MODEL_CARD.md` (Vietnamese) records data, counts per class, metrics, the cross-source result, the threshold, how to retrain, and limits (Kenya and Bangladesh only; no blister blight; Vietnamese names need officer confirmation, with brown blight and anthracnose easily confused). `ATTRIBUTION.md` credits the three datasets. Model file under 20 MB.
- [ ] **Step 6: Commit** `feat(ai-models): train a tea leaf disease model on CC BY 4.0 data`.

---

### Task 3: Serve the tea model

**Files:**
- Modify: `apps/disease-api/app/main.py`, `docker/docker-compose.yml` (`disease-api` environment), `apps/disease-api/tests/*`

**Interfaces:**
- Produces: `POST /predict?model=tea|general` (default `general`); response gains `model: "tea"|"general"` and `uncertain: bool`; when `uncertain` is true, `disease_name_vi` and `disease_name_en` are null and `top3` is kept. `GET /health` reports both models. Env `TEA_CONFIDENCE_THRESHOLD`, default from the model card.

- [ ] **Step 1: Tests** with a tiny stand-in model built in the test fixture (no file in the repo): `test_default_model_is_general`, `test_tea_model_selected`, `test_unknown_model_is_400`, `test_below_threshold_is_uncertain`, `test_existing_callers_unchanged`.
- [ ] **Step 2: Run** `python -m pytest tests -q -W error` in `apps/disease-api`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Load both models at startup; the Vietnamese name for tea classes comes from `tea_class_names_vi.json`.
- [ ] **Step 4: Verify** tests PASS and `make build` succeeds.
- [ ] **Step 5: Commit** `feat(disease-api): serve the tea model next to the general one`.

---

### Task 4: Disease flow in the web app

**Files:**
- Create: `apps/web/src/domain/disease/select-disease-model.ts`, `apps/web/src/domain/disease/display-disease-name.ts`, tests
- Modify: `apps/web/src/domain/disease/ports/disease-detection.port.ts`, `apps/web/src/infrastructure/disease-api/disease-api.adapter.ts`, `apps/web/src/application/disease/submit-diagnosis.usecase.ts`, `apps/web/src/application/disease/review-disease-report.usecase.ts`, the review route and officer review screen, the farmer diagnosis screen, readers or pages that show a disease name

**Interfaces:**
- Produces: `selectDiseaseModel(cropType: string | null | undefined): 'tea' | 'general'`; `DiseaseDetectionPort.predict(image: Blob, model: 'tea' | 'general')` returning the existing result plus `uncertain: boolean`; `displayDiseaseName(r: { confirmed_diagnosis: string | null; ai_disease_name: string }): string`; review command gains `confirmed_diagnosis: string`, required and non-empty when status is `CONFIRMED`.

- [ ] **Step 1: Tests.** `selectDiseaseModel` per Review Focus line 1. Submit: an uncertain result still stores the report with `ai_disease_name` `Không xác định` and notifies officers; the farmer sees `Đã gửi cán bộ kỹ thuật xem`. Review: `CONFIRMED` without `confirmed_diagnosis` is a validation error; it is stored. `displayDiseaseName` prefers the confirmed name.
- [ ] **Step 2: Run** `make test`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** The officer form pre-fills the confirmed name with the AI name. Every screen that shows a report's disease name uses `displayDiseaseName`.
- [ ] **Step 4: Verify** `make test`, `make lint`.
- [ ] **Step 5: Commit** `feat(web): choose the tea model and record the officer's confirmed diagnosis`.

---

### Task 5: Harvest rounds and withdrawal display

**Files:**
- Create: `apps/web/src/application/farm/start-harvest-round.usecase.ts`, `apps/web/src/app/api/parcels/[id]/start-round/route.ts`, tests
- Modify: `apps/web/src/application/lot/ExportQrUseCase.ts`, the lot trace repository it reads, the officer parcel screen with the action, the farmer dashboard, `apps/web/src/__tests__/api/tenant-isolation.test.ts`

**Interfaces:**
- Produces: `StartHarvestRoundUseCase.execute(parcelId: string, officerId: string): Promise<{ cycleId: string; season: string }>`; `POST /api/parcels/[id]/start-round` for officers, guarded by `TenantGuard.parcel`; export rule: every parcel of the lot has a crop cycle with `harvested_at` not null and `harvested_at <= lot.harvest_date`.

- [ ] **Step 1: Tests.** Start on `HARVESTED` creates `Lứa <n>/<year>` with `n` = cycles of that parcel created in the same year + 1, and sets `TENDING`; start on any other status, or twice, is refused with no cycle (Review Focus 2); a farmer gets 403; another HTX gets 404. Export: passes when every parcel has a qualifying cycle; refused when one parcel's only harvest is after the lot date (Review Focus 3); the withdrawal block still applies. Approve-harvest and create-lot withdrawal blocks each have a test. Farmer dashboard shows `Thửa <mã> còn <N> ngày cách ly` from the latest future `safe_harvest_date`, and nothing when none is in the future.
- [ ] **Step 2: Run** `make test`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify** `make test`, `make lint`.
- [ ] **Step 5: Commit** `feat(web): support tea harvest rounds and show active withdrawal periods`.

---

### Task 6: Journal photo upload

**Files:**
- Create: `apps/web/src/app/api/journal/upload/route.ts`, test
- Modify: `apps/web/src/app/farmer/journal/_components/FarmerJournalForm.tsx` only if its request shape must change

**Interfaces:**
- Produces: `POST /api/journal/upload` for `farmer` and `officer`, body `{ filename: string, contentType: string }`, response `{ data: { uploadUrl: string, key: string } }`.

- [ ] **Step 1: Tests.** Farmer and officer get a URL and a key matching `^para/<htxCode>/Areas/Journal/\d{4}/[0-9a-f-]{36}-[^/]+$`; manager gets 403; anonymous 401; `NO_HTX` 403; `image/gif` and `application/pdf` give 400; a name with `../` or a slash is sanitised; the returned key is accepted by `POST /api/journal`.
- [ ] **Step 2: Run** `make test`. Expected: FAIL.
- [ ] **Step 3: Implement** using `MinioDocumentAdapter.generateUploadUrl(key, 900)`.
- [ ] **Step 4: Verify** `make test`, `make lint`.
- [ ] **Step 5: Commit** `feat(web): add the journal photo upload route`.

---

### Task 7: Tea demo data and accounts

**Files:**
- Modify: `apps/web/prisma/seed.ts`, `docker/keycloak/realm-agrimarket.json`, `platform/tests/test_realm_policy.py`, `platform/tests/smoke-platform.sh`, `platform/tests/tokens.sh` users, `apps/web/tests/e2e/tenant/core-tenant.spec.ts`, `apps/web/tests/e2e/story-8-11-member-household.spec.ts`, README

- [ ] **Step 1: Tests.** A seed test against a throwaway database (start `opentea-dx-os/postgres:local` on an unused port, migrate, seed twice): second run succeeds; counts for `TC` and `LB` are as expected; parcel `A3` of `TC` has an active withdrawal, a harvested previous round with an exported lot, and one pending disease report; a pre-inserted row of another HTX is untouched (Review Focus 4). Realm test: users `manager_tc`, `officer_tc`, `farmer_tc`, `manager_lb`, `officer_lb`, `farmer_lb` exist with matching `htx_code`; manager and officer have `CONFIGURE_TOTP`; `manager1`, `officer1`, `farmer1` are gone.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Dates relative to the seed run. Smoke and browser tests switch to users prefixed `smoke_` (for example `smoke_manager_tc`) so they never change the demo users' passwords or required actions. Fix `8.11-E2E-001: Officer sees household details and links` to the new data.
- [ ] **Step 4: Verify** the seed test, realm test, `make test`, one clean-database round with the browser specs.
- [ ] **Step 5: Commit** `feat(web): seed the Tan Cuong and La Bang tea cooperatives`.

---

### Task 8: Tea vocabulary and market data

**Files:**
- Modify: every file in the vocabulary list of the spec §2 and the exploration report (UI copy, defaults, maps, mock data, tests), `workflows/comtrade_export_sync.json`, `workflows/vietnam_market_sync.json`, `workflows/bulletin-synthesis.json`, layouts' "Lịch vụ mùa"

- [ ] **Step 1: Test.** `apps/web/src/__tests__/content/no-rice-copy.test.ts` fails when `src/**/*.{ts,tsx}` (excluding tests) or `prisma/seed.ts` contain, case-insensitively, `lúa`, `gạo`, `ST25`, `Hè Thu`, `Đông Xuân`, `đạo ôn`, `xoài`. Run it: FAIL.
- [ ] **Step 2: Replace** with tea content; "Lịch vụ mùa" becomes "Lịch thu hái"; commodity defaults become `Chè`/`Tea`; Comtrade adds HS `0902`; `vietnam_market_sync` adds a tea item; every simulated price shows `giá mô phỏng` in the UI. Run the command of the CI job `Lint n8n Workflows` locally.
- [ ] **Step 3: Verify** the test passes, `make test`, `make lint`, the n8n lint job command.
- [ ] **Step 4: Commit** `feat(web): speak the tea cooperative's language`.

---

### Task 9: Design system, themes, brand and home page

**Files:**
- Create: `DESIGN.md`, `apps/web/src/lib/brand.ts`, `apps/web/src/components/ui/ThemeToggle/*`, `apps/web/src/__tests__/design/no-hardcoded-colors.test.ts`, real `public/icon-192x192.png` and `icon-512x512.png`
- Modify: `apps/web/src/styles/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `public/manifest.json`, Sidebar, TopBar, login page, `docker/keycloak/themes/agrimarket/login/*`

**Interfaces:**
- Produces: tokens on `:root` with dark values under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`; `BRAND_NAME = 'OpenTea DX-OS'`; `ThemeToggle` storing `light|dark|system` in `localStorage` key `opentea-theme`; an inline script in `layout.tsx` that sets `data-theme` before first paint inside try/catch.

- [ ] **Step 1: Tests.** Theme script: with stored `dark` sets `data-theme="dark"`; with `localStorage` throwing it leaves the attribute unset and does not throw (Review Focus 5). Toggle cycles and persists. Every token in the light set has a dark value. Text and background token pairs meet 4.5:1 in both themes (compute the ratio in the test). The colour guard scans `src/**/*.module.css` and non-test `src/**/*.tsx` for hex, `rgb(`, `hsl(` and fixed Tailwind colour classes, failing on any file not in its `baseline` list; this task starts the baseline with every current offender and Task 10 empties it.
- [ ] **Step 2: Run** `make test`. Expected: FAIL.
- [ ] **Step 3: Implement.** `DESIGN.md` follows google-labs-code/design.md with YAML tokens and rationale, matching `globals.css` exactly. Fix the `--font-family-sans` Inter reference. Brand name everywhere through `brand.ts`. Home page: short intro, sign-in button, lot code field that opens `/q/<code>`.
- [ ] **Step 4: Verify** `make test`, `make lint`, `next build`.
- [ ] **Step 5: Commit** `feat(web): add the design system with light and dark themes`.

---

### Task 10: Move every hard-coded colour to tokens

**Files:**
- Modify: the files in the colour guard's baseline, priority screens first (spec §6.4), then shared components, then the rest; the baseline list itself

- [ ] **Step 1:** Remove a batch of files from the baseline; the guard FAILS.
- [ ] **Step 2:** Replace their colours with tokens; add a token to `globals.css` and `DESIGN.md` only when no existing one fits. Map-specific colours that must stay fixed move to a documented `exceptions` list in the guard with a reason each.
- [ ] **Step 3:** The guard passes; `make test` passes. Commit the batch: `refactor(web): use design tokens in <area>`.
- [ ] **Step 4:** Repeat until the baseline is empty.

---

### Task 11: The A3 story, screenshots, CI and docs

**Files:**
- Create: `apps/web/tests/e2e/story/tea-a3.spec.ts`, `apps/web/tests/e2e/visual/screens.spec.ts`
- Modify: `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, the spec's "Ghi chú sau triển khai 2b"

- [ ] **Step 1: A3 story spec**, real Keycloak login with the smoke users on seeded data: the farmer adds a journal entry with a photo; harvest approval is refused while the withdrawal is active; a tea photo diagnosis reaches the officer queue and the officer confirms it with a name; the officer exports a lot; the public `/q/<code>` page shows the lot and its withdrawal status.
- [ ] **Step 2: Screens spec.** For each priority screen of spec §6.4, at 1280×800 and 390×844, in light and dark: save a screenshot under `test-results/screens/`, assert `document.documentElement.scrollWidth <= window.innerWidth`, and assert no visible text element overlaps another.
- [ ] **Step 3: CI** runs both specs in the `platform-smoke` job after the existing browser spec. Run `actionlint`.
- [ ] **Step 4: Docs.** README: tea demo accounts and TOTP set-up before a demo, the disease model and its limits, how to retrain. CHANGELOG `[Unreleased]` with upgrade notes (re-import or update the realm for the new users; run `npm run seed` only on a demo database). Spec notes with differences and measured numbers.
- [ ] **Step 5: Verify, two rounds.** The clean-database sequence twice with all browser specs; `make build`, `make test`, `make lint`, disease-api, dataops and scanner tests, realm test. Then list the screenshot paths in the report for the controller to inspect.
- [ ] **Step 6: Commit** `docs(web): document Tier 2b and verify the A3 story in the browser`.
- [ ] **Step 7: Ask the owner** before opening a PR, merging or tagging `v1.7.0`.
