<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# GĐ4-B Tea Pest Recognition for Vietnam (DEV-015) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:**
- Officers label confirmed cases from one controlled list.
- Cooperatives that opt in contribute photos to a field dataset.
- A versioned tea model can be retrained and released only when each target class has enough field photos and passes the quality gate.
- The five targets: green leafhopper, tea thrips, red spider mite, blister blight, helopeltis.

**Architecture:**
- A `disease_labels` table becomes the single source of class codes and Vietnamese names. The officer review gets a label select.
- The core holds a per-cooperative training consent, and a platform-admin route serves a manifest of consented, confirmed photos with short-lived URLs.
- `train.py` gains `fetch-field` (download plus EXIF strip with Pillow) and a `field` dataset source with per-class minimums and stricter gates.
- `ai-models/tea/registry.json` pins the model version and its sha256. The disease API refuses a mismatch and reports `model_version`, and the web stores it on each report.

**Spec:** `docs/specs/2026-11-28-phase4-intelligence-pests-zalo-design.md` §4 and §7.6–§7.7.

## Global Constraints

- **Label codes:**
  - the five targets: `green_leafhopper`, `tea_thrips`, `red_spider_mite`, `blister_blight`, `helopeltis`;
  - the existing tea classes: `algal_leaf_spot`, `birds_eye_spot`, `brown_blight`, `gray_blight`, `red_leaf_spot`, `white_spot`;
  - plus `healthy`, `not_tea_leaf` and `other`.
  - Vietnamese names come from the officers' current wording and `ai-models/tea_class_names_vi.json`.
  - The five targets in Vietnamese: Rầy xanh, Bọ cánh tơ, Nhện đỏ, Phồng lá chè, Bọ xít muỗi.
- The AI never recommends a product. Prescriptions keep the S1 flow (catalogue, draft spraying, withdrawal floor).
- Training consent is off by default per cooperative. Only the head turns it on, and the change is audited. Only `platform_admin` reads the manifest.
- Exported photos carry no EXIF or GPS. The manifest has no names or phones.
- Minimum field photos per class: 150.
- Gates:
  - overall accuracy ≥ 0.80;
  - recall ≥ 0.70 for every target class present;
  - accuracy ≥ 0.75 on a field test split grouped by cooperative;
  - otherwise `BLOCKED` and exit 1.
- The model file stays committed. `registry.json` = `{ version, file, sha256, classes, threshold, metrics, trained_on, sources }`.
- Commits: identity maiychrus25 / ninhkhuongpl7@gmail.com, English Conventional Commits, no AI attribution.

## Review Focus

1. An officer can still confirm with a free-text name. The label is required only when the report is CONFIRMED, and an old report is backfilled only on an exact name match.
2. A cooperative that never opted in contributes zero rows to the manifest, even when its reports are confirmed.
3. A model file whose sha256 differs from the registry is not loaded. `/health` shows `tea: false` with the reason, and `general` keeps working.
4. A class with 149 field photos is left out of training and listed as "chưa đủ dữ liệu" in the evaluation report.
5. The manifest URLs expire (≤ 15 minutes) and work for `platform_admin` only.

## Tracks

| Track | Worker | Tasks |
|---|---|---|
| B-core | Sonnet | B1 → B2 → B3 (web part) |
| B-model | Sonnet | B3 (API part) → B4 |
| B-fe | Codex | F1 |

### Task B1: label list and officer labels

**Files:**
- migration `apps/web/prisma/migrations/20261128180000_disease_labels`: table `disease_labels(code PK, name_vi, scientific_name, group: PEST|DISEASE|HEALTHY|OTHER, is_target boolean, sort_order)`, seeded rows, `disease_reports.confirmed_label_code` (FK, nullable), `disease_reports.model_version text NULL`, a backfill by exact `confirmed_diagnosis` = `name_vi`, and the audit trigger;
- `ReviewDiseaseReportUseCase`: `confirmed_label_code` required when CONFIRMED and validated against the table;
- `apps/web/src/application/agent/actions/disease-labels.ts` and `domain/disease/treatment-plan.ts` read names from the table (one repository function);
- `GET /api/disease-labels` (officer, manager);
- tests.

Commit: `feat(disease): one label list for confirmed cases`.

### Task B2: training consent and the field manifest

**Files:**
- migration `apps/web/prisma/migrations/20261128180100_disease_training_consent`: `htx_profiles.disease_training_consent boolean NOT NULL DEFAULT false`, plus `disease_training_consent_at` and `_by`;
- `PUT /api/htx/disease-training-consent` (manager), audited through `dxos.actor`;
- `GET /api/platform/disease-dataset?since=&htx=` (`platform_admin`) returning `{ items: [{ report_id, label_code, htx_code, confirmed_on, sha256, url }] }`, where `url` is a presigned GET valid for 15 minutes; only CONFIRMED reports with a label and a photo, from consenting cooperatives;
- fix `ReviewDiseaseReportUseCase`'s silent P.A.R.A copy: log a warning and retry once;
- tests.

Commit: `feat(disease): cooperatives opt in to share confirmed photos for training`.

### Task B3: model registry and version everywhere

**Files:**
- `ai-models/tea/registry.json`, written for the current model with its real sha256, classes and metrics from `MODEL_CARD.md`;
- `apps/disease-api/app/main.py`: verify the sha256 against the registry before loading; `/health` adds `versions: { tea }` and `reasons: { tea }`; every tea response adds `model_version`;
- `apps/disease-api/tests`;
- `.github/workflows/ci.yml`: a step that checks the registry sha256 matches the committed file;
- web: `DiseaseApiAdapter` keeps `model_version`, and `SubmitDiagnosisUseCase` stores it on the report;
- tests.

Commit: `feat(disease): version the tea model and refuse a file that does not match its registry`.

### Task B4: field data in training

**Files:** `ai-models/tea/{train.py,datasets.json,README.md,MODEL_CARD.md,requirements.txt}`, tests under `ai-models/tea/tests/` (new, pytest with tiny synthetic images).

- `fetch-field --manifest <url|file> --token-env DXOS_PLATFORM_TOKEN` downloads into `.work/field/<label>/`. It strips EXIF by re-saving pixels only, verifies the sha256, and is idempotent.
- `prepare` merges the `field` source, maps labels through `disease_labels` codes, and drops classes under 150 field photos with a report line. It splits the field test set by `htx_code` (group).
- `evaluate` adds the per-class recall and field-accuracy gates, and writes `registry.json` only on pass.
- A `not_tea_leaf` class is built from noise and non-leaf images at a fixed count.
- No training runs in CI. The tests use the stage functions on tiny fixtures.

Commit: `feat(model): train the tea model on consented field photos with stricter gates`.

### Task F1 (Codex): label select and consent switch

**Files:** `apps/web/src/app/officer/diseases/[id]/*`, `apps/web/src/app/manager/profile/*`, tests.

- **Review form:** a required select "Nhãn bệnh/sâu" from `/api/disease-labels`, with the five targets first. The free-text name stays.
- **Profile:** a switch "Cho phép dùng ảnh đã xác nhận để huấn luyện mô hình nhận diện sâu bệnh", off by default. Its explanation says GPS and EXIF are removed, the photos are used only for the tea model, and the switch can be turned off at any time.
- Run `next build` before reporting.

## Verification (controller)

- All suites, disease-api pytest, and the `ai-models/tea` tests.
- On a throwaway stack:
  - confirm a report with a label;
  - the manifest is empty before opt-in and has one item after;
  - the presigned URL expires;
  - a tampered model file makes `/health` show `tea: false`;
  - the diagnosis flow stores `model_version`.
- Two UI rounds for the review form and the profile switch.
- The actual v2 training run happens when field data reaches the minimum. It is not part of this plan's completion.
