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
| B-zalo | Sonnet | B5 (owner's pilot items, 2026-11-28 evening) |

**Contract between B-model and B-core (`model_version`):**
- The registry lives at `ai-models/tea/registry.json`, which disease-api sees as `/models/tea/registry.json`. Its `file` is relative to `/models`, for example `"tea_leaf_model.keras"`. `version` is a string such as `"tea-2026.11.0"`.
- `POST /predict` adds `model_version: string | null` to `PredictResponse`. The value is the registry `version` for `model=tea`, and `null` for `general`.
- `GET /health` adds `versions: { tea: string | null }` and `reasons: { tea: string | null }`. `reasons.tea` says why the tea model is not loaded, in English, for example `"sha256 mismatch"`. `models.tea` stays a boolean.
- The web `DiseaseApiAdapter` maps `model_version` (absent means `null`) and `SubmitDiagnosisUseCase` stores it in `disease_reports.model_version`, which B1's migration creates.

**Contract between B-core and B-fe:**
- `GET /api/disease-labels` returns `{ data: [{ code, name_vi, scientific_name, group, is_target, sort_order }] }`, with targets first, then by `sort_order`.
- The review body gains `confirmed_label_code: string`, which is required when `status` is `CONFIRMED`.
- `PUT /api/htx/disease-training-consent` takes `{ enabled: boolean }` and returns `{ data: { enabled, at, by } }`. `GET` on the same path returns the same `data`.
- Every response is wrapped in `{ data }`. The B-fe brief copies these shapes verbatim, and its tests mock them exactly.

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

- `fetch-field --manifest <url|file> --cookie-env DXOS_WEB_COOKIE` (the route takes a session, as `./dxos para seed` does; ruling during integration) downloads into `.work/field/<label>/`. It strips EXIF by re-saving pixels only, verifies the sha256, and is idempotent.
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

### Task B5: real ZNS error codes and the relay image row (owner, 2026-11-28 evening)

**Files:**
- `platform/zalo/dxos_zalo/zns_api.py` (`ERROR_CODES`), which `stub_zns_api.py` already imports;
- `apps/web/src/domain/zalo/zalo-events.ts` (`errorLabelVi`);
- `platform/zalo/tests/*`, `apps/web/src/__tests__/domain/zalo/zalo-domain.test.ts`, `platform/tests/smoke-zalo.sh` if a code it injects changes meaning;
- `DEPENDENCIES.md` (the `python:3.12.15-slim-bookworm` row);
- `docs/rules-and-limits.md` §3.35, and the "Known limits" line in `CHANGELOG.md` Unreleased.

**The code table** for `business.openapi.zalo.me/message/template`, as given by the owner. Descriptions are in Vietnamese, as the relay passes them to the web:

| Code | Meaning | `permanent` | `token_expired` |
|---|---|---|---|
| -100 | Zalo gặp lỗi hệ thống | False | False |
| -108 | Số điện thoại không hợp lệ | True | False |
| -109 | ID mẫu ZNS không hợp lệ | True | False |
| -111 | Tham số mẫu ZNS không hợp lệ | True | False |
| -112 | Tham số mẫu ZNS không hợp lệ | True | False |
| -115 | Hết số dư hoặc hạn mức gửi ZNS | True | False |
| -117 | OA không có quyền dùng mẫu ZNS này | True | False |
| -118 | Tài khoản Zalo không tồn tại | True | False |
| -124 | Access token không hợp lệ hoặc đã hết hạn | **False** | **True** |
| -126 | Hết số dư hoặc hạn mức gửi ZNS | True | False |
| -131 | Mẫu ZNS chưa được duyệt | True | False |
| -211 | Hết số dư hoặc hạn mức gửi ZNS | True | False |
| -216 | Access token không hợp lệ hoặc đã hết hạn | False | True |

- On -124 the relay refreshes the token and sends once more, exactly as on -216. The access token lives 25 hours. A token error must never mark a message failed on the first try.
- `errorLabelVi` maps the relay's `"<code> <description>"` to one Vietnamese reason per group:
  - -108: "Số điện thoại của hộ không hợp lệ.";
  - -118: "Số điện thoại này không có tài khoản Zalo.";
  - -109, -111, -112, -117, -131: "Mẫu tin ZNS sai hoặc chưa được duyệt.";
  - -115, -126, -211: "Hết số dư hoặc hạn mức gửi tin ZNS.";
  - -124, -216: "Token Zalo hết hạn; hệ thống sẽ tự làm mới.".

  Match on the code at the start of the string, not on loose words: the current `/-124|quota|limit/` rule is wrong.
- Remove the "unverified" comment in `zns_api.py`. Write instead that the table follows the owner's ZNS reference of 2026-11-28.
- Update the docs: §3.35 drops "chưa được đối chiếu", and CHANGELOG "Known limits" drops the ZNS line.
- `DEPENDENCIES.md`: add `dxos-zalo` to the list of services built on `python:3.12.15-slim-bookworm`. Add the relay's stub too, if it uses the same image.

**Tests:**
- Every code in the table maps to its `permanent` and `token_expired` values.
- The relay, given -124 from the stub, refreshes and resends once, and the row ends `sent`.
- Given -115, there is one call and the row ends `failed` with the Vietnamese reason.
- `errorLabelVi('-124 Access token ...')` returns the token line, not the quota line.

Commit: `fix(zalo): follow the real ZNS error codes and refresh the token on -124`.

## Verification (controller)

- **Owner's pilot checks (2026-11-28 evening):**
  - With the B throwaway stack up, run `make up-voice` from the owner's checkout. Point the throwaway web at Piper on `127.0.0.1:5500` (`PIPER_HOST` and `PIPER_PORT`). Press "Nghe" on the farmer dashboard and check that real Piper audio plays (`audio/wav`, non-empty) and that a second press is served from the cache. Then `make stop-extras`.
  - Upload one real text PDF to a cooperative's `Resources/` and ask the technical chatbot a question whose answer is only in that PDF. The answer must cite the file, and the sidecar `<key>.txt` must exist. Use a real local LLM, so the passage reaches the model: a throwaway Ollama with `qwen2.5:0.5b`, or the owner's Ollama through a make target.
- All suites, disease-api pytest, and the `ai-models/tea` tests.
- On a throwaway stack:
  - confirm a report with a label;
  - the manifest is empty before opt-in and has one item after;
  - the presigned URL expires;
  - a tampered model file makes `/health` show `tea: false`;
  - the diagnosis flow stores `model_version`.
- Two UI rounds for the review form and the profile switch.
- The actual v2 training run happens when field data reaches the minimum. It is not part of this plan's completion.
