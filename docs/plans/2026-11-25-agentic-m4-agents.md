<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Agentic layer M4: field, disease, harvest and bulletin agents — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** four new agents per cooperative — A2 `field-watch`, A3 `disease-watch`, A4 `harvest-ready`, A5 `bulletin` — propose the catalogue actions `notification.internal`, `notification.households`, `disease.inspection`, `harvest.approve` and `bulletin.publish`. A person approves every proposal on the web or in Telegram, as for A1. Milestone M4 of issue #55.

**Architecture:** rules decide whether there is a problem (thresholds, distances, dates); the LLM only writes the bulletin text. Messages to households are never free text: the agent sends a template id and typed slots, and the web renders the Vietnamese copy (spec §6, test 32). The web catalogue learns actions whose subject is not a journal entry, evidence rows from five more tables, and a repeat window so a decided warning is not proposed again the same day.

**Tech Stack:** Python 3.12 standard library (`platform/agent`), Next.js 14 + Prisma + zod (`apps/web`), Hasura metadata, PostgreSQL 16.

**Spec:** `docs/specs/2026-11-23-agentic-layer-design.md` (Vietnamese, the authority): §6 (catalogue), §9 (agents, bulletin status), §14 (failures), §15 (scenarios, test 32), milestone row M4 in §17.

## Global Constraints

- Repository rules: `AGENTS.md`, English Conventional Commits, English identifiers, Vietnamese user-facing text with diacritics, SPDX headers on new files, no secrets, no `.env*` files.
- `platform/agent` stays standard library only.
- The agent never writes business data: it reads through Hasura with its `agent` role and only creates proposals through `POST /api/internal/agent/proposals` (trust zones, spec §5.1).
- Evidence follows contract version 2 (`platform/agent/tests/fixtures/evidence-vectors.json`) plus the M4 rules and cases in `platform/agent/tests/fixtures/evidence-vectors-m4.json` (committed with this plan). Both languages must reproduce every case.
- Every threshold is a per-cooperative setting with the default listed in C6. The default lives in code and in `docs/rules-and-limits.md`.
- A1 behaviour, its schedule and its scenarios do not change.

## Review Focus

1. A warning that was approved or rejected is not proposed again on the next 30-minute cycle (repeat window, C1). Test: `field_watch` scenario "second cycle after a decision proposes nothing" and web test `repeat window dedupes a proposal decided an hour ago`.
2. A household message can carry no agent-written text: unknown keys, a `note_vi` from the agent, or a slot that is not its type are refused (test 32). Test: web `test 32` cases in Task W3.
3. Cooperative isolation: evidence rows of another cooperative make the proposal fail (`EVIDENCE_NOT_IN_HTX`); a template's `parcel_codes` that are not all the approver's cooperative's make `execute` refuse and send nothing. Tests: W2 loader tests with an LB row, W3 recipients test.
4. Missing data is not a problem report: a parcel without a sensor, a weather row without `forecast_json`, a disease report with an unknown or `healthy` name, no market data in 48 hours. Each gives no proposal and no crash. Tests: one scenario case per agent (Tasks A3–A6).
5. A harvest is never proposed while any non-draft spraying activity of the parcel is inside its withdrawal period (Vietnam calendar day, the A1 rule). Approving still goes through `ApproveHarvestUseCase`, which checks again (H1). Test: `harvest_ready` scenario "sprayed yesterday, safe tomorrow".

---

## Contracts

### C1. Catalogue generalisation (web)

`ActionDefinition` (`apps/web/src/application/agent/action-catalog.ts`) gains:

- `subjectTable: string | null`
  - With a table, every subject must be the id of an evidence row of that table; otherwise `SUBJECT_NOT_IN_EVIDENCE`. The journal actions use `'journal_entries'`.
  - With `null`, subjects are only the dedupe key.
- `humanOnlyFields: readonly string[]`
  - A proposal with `origin: 'agent'` whose payload has any of these keys is refused with `INVALID_PAYLOAD`.
  - These fields must also be in `editableFields`, so a human can add them when deciding.
- `repeatAfterHours: number | null`
  - If a proposal with the same `dedupe_key` was created within this many hours, in any status, `CreateProposalUseCase` returns `null` (the route answers `{deduped: true}`).
  - New repository method: `createdSince(htxCode: string, dedupeKey: string, since: Date): Promise<boolean>`.
  - The journal actions use `null`.

Other changes:

- `KNOWN_AGENTS` becomes `['journal-review', 'field-watch', 'disease-watch', 'harvest-ready', 'bulletin']`.
- `CONFIGURABLE_AGENTS` (the M3 settings tab) gains `'bulletin'`, so A5's provider can be chosen.
- The dedupe key stays `` `${kind}:${canonicalJson(subjects)}` ``. Agents send subjects already sorted by code point.

### C2. Evidence tables

Rows and their `values` are exactly as in `evidence-vectors-m4.json`. Its `rules` are part of this contract.

| `table` | evidence `id` | `values` keys | loader filter |
|---|---|---|---|
| `parcels` | `parcels.id` | `id, parcel_code, status, harvest_approved_at, updated_at` | parcel → household → cooperative |
| `disease_reports` | `disease_reports.id` | `id, parcel_id, status, detection_date, ai_disease_name, confirmed_diagnosis, updated_at` | household → cooperative |
| `sensor_readings` | `<parcel_code>\|<sensor>\|<ts>` | `id, parcel_code, sensor, ts, value_milli` | `htx_code` column |
| `weather_cache` | `weather_cache.id` | `id, parcel_id, recorded_at, precipitation_milli, forecast_days, forecast_precipitation_milli` | parcel → household → cooperative |
| `market_data` | `market_data.id` | `id, source, commodity, metric, value_milli, unit, period, fetched_at` | none (shared reference data) |

`<field>_milli` is `floor(value * 1000)` in IEEE double arithmetic.

### C3. Message templates (web renders, agent fills slots)

Slot types:

- `parcel_code`: `^[A-Z0-9][A-Z0-9-]{0,31}$`.
- `parcel_codes`: 1–20 of those, sorted, rendered joined with `", "`.
- `date`: `YYYY-MM-DD`, rendered `dd/MM/yyyy`.
- `int`: an integer in the given range.
- `sensor`: one of five values, rendered in Vietnamese:
  - `soil_moisture` → "độ ẩm đất"
  - `soil_temperature` → "nhiệt độ đất"
  - `air_temperature` → "nhiệt độ không khí"
  - `air_humidity` → "độ ẩm không khí"
  - `rainfall` → "lượng mưa"
- `disease`: one of `algal_leaf_spot, birds_eye_spot, brown_blight, gray_blight, helopeltis, red_leaf_spot, white_spot`, rendered with the `vi` label of `ai-models/tea_class_names_vi.json`.

| template | audience | slots | title | body |
|---|---|---|---|---|
| `sensor_silent` | internal | `parcel_code`, `sensor`, `hours` int 6–720 | Cảm biến không gửi số đo | Cảm biến {sensor} ở thửa {parcel_code} không gửi số đo {hours} giờ. Cần kiểm tra pin hoặc kết nối. |
| `dry_soil` | households | `parcel_codes`, `value_pct` int 0–100, `threshold_pct` int 0–100 | Đất khô | Đất ở thửa {parcel_codes} đang khô: độ ẩm {value_pct}% dưới ngưỡng {threshold_pct}%. Nên tưới giữ ẩm cho chè. |
| `heat` | households | `parcel_codes`, `value_c` int −10–60 | Nắng nóng | Nhiệt độ ở thửa {parcel_codes} lên {value_c}°C. Nên hái chè sớm trước 9 giờ và che nắng cho búp non. |
| `frost` | households | `parcel_codes`, `value_c` int −10–60 | Nguy cơ sương muối | Nhiệt độ ở thửa {parcel_codes} xuống {value_c}°C, có nguy cơ sương muối. Nên phủ gốc và tưới phun giữ ấm cho chè. |
| `rain_after_spray` | households | `parcel_codes`, `date`, `rain_mm` int 1–500 | Mưa sau khi phun thuốc | Dự báo mưa khoảng {rain_mm} mm ngày {date} ở thửa {parcel_codes}, ngay sau lần phun thuốc gần đây. Thuốc có thể bị rửa trôi: hỏi cán bộ trước khi phun lại. |
| `disease_nearby` | households | `disease`, `parcel_codes`, `count` int 2–500, `days` int 1–30 | Cảnh báo dịch bệnh | Có {count} báo cáo {disease} trong {days} ngày qua ở các thửa {parcel_codes}. Kiểm tra lá chè và báo cán bộ nếu thấy dấu hiệu bệnh. |

If a human adds `note_vi` when deciding, it is appended to the body as a new paragraph.

### C4. Actions

Every payload schema is strict (`z.object(...).strict()`).

| `kind` | payload | `subjects` / `subjectTable` | risk, approvers, autonomy, expiry, repeat | `execute` |
|---|---|---|---|---|
| `notification.internal` | `{template: 'sensor_silent', slots, subjects: string[1..20], note_vi?: string ≤500}` | `payload.subjects` / `null` | low, `['manager']`, auto, 24 h, 24 h | `BroadcastAnnouncementUseCase` to the cooperative's officers and managers (`KeycloakAdminAdapter.listUsersByRole`) |
| `notification.households` | `{template: one of the five households templates, slots, subjects: string[1..20], note_vi?}` | `payload.subjects` / `null` | medium, `['manager']`, auto, 24 h, 24 h | to the `keycloak_user_id` of the households owning `slots.parcel_codes`; every code must be a parcel of the approver's cooperative or nothing is sent; households without an account are skipped and counted |
| `disease.inspection` | `{disease, report_ids: string[2..50] sorted, parcel_codes: string[1..50], radius_m: int 100..20000, days: int 1..30}` | `report_ids` / `'disease_reports'` | medium, `['officer','manager']`, auto, 72 h, 72 h | to officers and managers. Title "Đề nghị kiểm tra dịch bệnh". Body "Có {n} báo cáo {disease} trong {days} ngày, trong bán kính {radius_m} m: thửa {parcel_codes}. Đề nghị cán bộ đi kiểm tra." `deep_link_url` `/officer/diseases` |
| `harvest.approve` | `{parcel_id: string}` | `[parcel_id]` / `'parcels'` | high, `['manager']`, unlockable, 24 h, 24 h | `TenantGuard.parcel` then `ApproveHarvestUseCase.execute(parcel_id, approver.userId, approver.role)` |
| `bulletin.publish` | `{commodity: /^[A-Za-z][A-Za-z ]{0,63}$/, period_day: date, bulletin_vi: string 50..4000, sources: {source, metric, value: number, unit, period}[1..30]}` | `` [`${commodity}:${period_day}`] `` / `null` | medium, `['manager']`, auto, 24 h, 20 h | `PublishBulletinUseCase` (C5) |

- `editableFields`:
  - `note_vi` for both notification kinds (also listed in `humanOnlyFields`);
  - `bulletin_vi` for `bulletin.publish`;
  - none for the other kinds.
- `isStale`: the evidence check of A1 (`isEvidenceStale`) for every kind.
- `preview`: one or two Vietnamese lines, with no internal ids:
  - the rendered title and body of a notification;
  - "Duyệt thu hoạch thửa {parcel_code}";
  - "Đăng bản tin {commodity} ngày {dd/MM}" followed by the first 160 characters of the text.

### C5. Bulletins table

The Prisma model `Bulletin` gains two columns:

- `status String @default("published")`, checked to `draft | published | rejected`;
- `htx_code String?`, where `null` means a shared bulletin written by the n8n workflow.

The Prisma migration is force-added (the `*.sql` ignore rule).

Readers (`GetLatestBulletinUseCase`, `GetAllLatestBulletinsUseCase`, the TTS route, Hasura `public_bulletins.yaml` for farmer, manager and officer):

- show only `status = 'published'`;
- prefer the latest row with `htx_code` = the viewer's cooperative;
- otherwise show the latest shared row.

`PublishBulletinUseCase.execute(htxCode, {commodity, bulletinVi, sources, modelUsed: 'agent:bulletin'})`:

- sets `is_latest = false` on the cooperative's earlier rows of that commodity;
- inserts the new row with `status 'published'`, `is_latest true`, the cooperative's `htx_code`;
- writes `sources_json` from `sources`.

Ruling: drafts are not stored. The agent may not write business tables, so the draft text lives in the proposal until a manager approves it. `draft` and `rejected` stay valid values for later milestones. The n8n workflow `bulletin-synthesis` keeps running; the owner turns it off once A5 runs well (spec §9).

### C6. Agents (Python)

| agent | settings name | runs (Vietnam time) | thresholds (settings key = default) |
|---|---|---|---|
| A2 | `field-watch` | every 30 min, all day | `silent_hours`=6, `dry_soil_pct`=35, `heat_c`=35, `frost_c`=4, `heavy_rain_mm`=15, `spray_lookback_days`=2, `forecast_days`=2, `fresh_reading_hours`=2 |
| A3 | `disease-watch` | daily at 07:00, and on any cycle where the set of reports in the window changed | `radius_m`=2000, `window_days`=7, `min_reports`=3 |
| A4 | `harvest-ready` | daily at 06:30 | `harvest_window_days`=3 |
| A5 | `bulletin` | daily at 05:00 | `commodity`='Tea', `market_hours`=48 |

The defaults reuse the Tea IoT Station rules (`apps/tea-iot/src/TeaIot.Core/Alerts.cs`: heat > 35 °C, frost < 4 °C, heavy rain ≥ 15 mm, dry soil < 35 %). The silent time reuses the HTX dashboard's (`SENSOR_SILENT_HOURS = 6`).

**A2 rules**

1. **Silent sensor.** For each `(parcel_code, sensor)` with a reading in the last 30 days: if `now − last ts > silent_hours`, propose one `notification.internal sensor_silent`.
   - `hours` = floor of the gap in hours.
   - `subjects` = `["sensor_silent:<reading id>"]`.
   - Evidence: that reading.
2. **Thresholds.** Use the latest reading per `(parcel_code, sensor)` younger than `fresh_reading_hours`:
   - `soil_moisture < dry_soil_pct` → `dry_soil`, with `value_pct` = floor of the lowest value;
   - `air_temperature > heat_c` → `heat`, with `value_c` = floor of the highest;
   - `air_temperature < frost_c` → `frost`, with `value_c` = floor of the lowest.

   Each template gives one `notification.households` proposal for all its parcels (sorted, at most 20; beyond 20, the most extreme 20). `subjects` = `["<template>:<Vietnam date>"]`. Evidence: those readings.
3. **Rain after spraying.**
   - Parcels: those with a `SPRAYING` journal entry whose status is not `DRAFT` or `REJECTED`, entered within the last `spray_lookback_days` days.
   - For each, take the latest `weather_cache` row and its first forecast day after today, within `forecast_days`, where `precipitation_sum ≥ heavy_rain_mm`.
   - Group the parcels by that day: one `rain_after_spray` proposal per day.
   - `rain_mm` = floor of the largest sum; `subjects` = `["rain_after_spray:<date>"]`.
   - Evidence: the weather rows and the journal entries.

No sensor data, or a `null` forecast, gives no proposal.

**A3 rules**

- Reports considered: `PENDING` or `CONFIRMED`, with `detection_date` in the last `window_days`.
- Disease key: from `confirmed_diagnosis` if set, otherwise `ai_disease_name`. A value matches when it equals a key or its `vi` label (trimmed, case-insensitive). Anything else, including `healthy`, is ignored.
- Location: the centroid of the report's parcel. A parcel without a centroid is ignored.
- Clustering, per disease: single-linkage groups of reports whose parcel centroids are within `radius_m` of each other (haversine).
- A group with at least `min_reports` reports gives two proposals:
  1. `disease.inspection`, with `report_ids` and `parcel_codes` of the group.
  2. `notification.households disease_nearby`:
     - parcels: the group's parcels plus any parcel of the cooperative whose centroid is within `radius_m` of one of them (sorted, at most 20, nearest first);
     - `count` = number of reports; `days` = `window_days`;
     - `subjects` = `["disease_nearby:<disease>:<smallest report id>"]`.
  - Evidence for both: the reports and their parcels.

**A4 rules**

A parcel gets one `harvest.approve` proposal when all of these hold:

- its status is `TENDING`;
- its newest crop cycle without `harvested_at` has `estimated_harvest_date` on or before today + `harvest_window_days` (Vietnam days);
- every activity of its non-draft `SPRAYING` entries has `safe_harvest_date` on or before today (Vietnam day, the A1 comparison).

Evidence: the parcel, that crop cycle, and its spraying entries (at most 48; a parcel with more is skipped and logged).

**A5 rules**

- Read the `market_data` rows of `commodity` fetched in the last `market_hours`. None gives no run.
- Ask the provider chosen for `bulletin` (M3 settings) for `{"bulletin_vi": string}`. The prompt gives only the rows, and the system message forbids numbers that are not in them.
- Malformed output after one repair try, or every provider failing, gives a skipped run and no proposal (§14: no rule-based fallback).
- Propose `bulletin.publish` with `period_day` = today (Vietnam) and `sources` from the rows. Evidence: the rows (at most 50, newest first).

`reason_vi` of every proposal is written by code, in Vietnamese, with the figures that triggered it (for example "Độ ẩm đất thửa P-TC-003 còn 28%, dưới ngưỡng 35%."). No LLM writes it.

### C7. Hasura reads for role `agent`

All are filtered by the caller's cooperative, like the existing agent permissions; `market_data` has no filter.

| table | columns |
|---|---|
| `telemetry.sensor_readings` | `parcel_code, sensor, ts, value` |
| `telemetry.sensor_daily` | all columns |
| `weather_cache` | `id, parcel_id, recorded_at, precipitation_mm, forecast_json` |
| `disease_reports` | the current columns, plus `ai_disease_name, confirmed_diagnosis` |
| `market_data` | `id, source, commodity, metric, value, unit, period, fetched_at` |

No photo, GPS, treatment note, phone or name column is added.

### C8. Scenario files

`platform/agent/tests/scenarios/a2_field_watch.json`, `a3_disease_watch.json`, `a4_harvest_ready.json` and `a5_bulletin.json` each hold a list of cases:

```
{"name", "now", "thresholds"?, "graphql": {<operation name>: <data>}, "replay_response"?,
 "expected": {"proposals": [{"kind", "subjects", "payload"}]}}
```

The test feeds `graphql` through a fake gateway, keyed by the GraphQL operation name each agent declares. It asserts that the submitted proposals equal `expected.proposals`, in order of `(kind, subjects)`.

## Tracks

The three tracks start from the commit that adds this plan and `evidence-vectors-m4.json`. Each keeps to its own files and follows C1–C8 exactly. Anything impossible as written is implemented as closely as possible and reported precisely.

### Track W — web (`apps/web/**`, `platform/hasura/metadata/databases/default/tables/public_bulletins.yaml`, `docs/api-contract.md`, `docs/database-schema.md`)

#### Task W1: catalogue generalisation (C1)

Files:
- `action-catalog.ts`
- `CreateProposalUseCase.ts`
- `domain/agent/proposal.ts`
- `domain/agent/ports/ProposalRepository.ts`
- `PrismaProposalRepository.ts`
- `domain/agent/settings.ts`
- the two journal actions
- tests in `src/__tests__/application/agent/`

- [ ] Tests first:
  - `subject check uses the action's subjectTable`: a fake action with `subjectTable 'parcels'` is refused without a `parcels` row.
  - `null subjectTable skips the subject check`.
  - `agent payload with a human-only field is refused`: `INVALID_PAYLOAD`.
  - `repeat window dedupes a proposal decided an hour ago`: `createdSince` true → `null`, and the repository's `create` is not called.
  - `journal actions keep their behaviour`: the existing suite stays green.
- [ ] Implement; the whole Jest suite passes. Commit: `feat(web): catalogue actions with other subjects, human-only fields and a repeat window`.

#### Task W2: evidence loaders for the five tables (C2)

Files:
- `actions/journal-evidence.ts` (split the new builders into `actions/field-evidence.ts`)
- `infrastructure/db/agent/PrismaEvidenceReader.ts`
- tests

- [ ] Test `evidence-vectors-m4.test.ts`: every case of `evidence-vectors-m4.json` gives the same `values`, `canonical` and `sha256`.
- [ ] Test: each loader returns `null` for a row of another cooperative (fake Prisma rows). `market_data` returns the row for any cooperative.
- [ ] Run the real loaders against a throwaway Postgres (scratch check, not committed). Report the commands and output.
- [ ] Commit: `feat(web): evidence rows for parcels, disease reports, sensor readings, weather and market data`.

#### Task W3: templates and the two notification actions (C3, C4)

Files:
- `actions/message-templates.ts`
- `actions/notification-internal.action.ts`
- `actions/notification-households.action.ts`
- tests

- [ ] Test `test 32: a household message with agent text is refused`, with four cases:
  - payload with `body`;
  - payload with `note_vi`;
  - `parcel_codes` holding a sentence;
  - unknown `template`.

  Each gives `ValidationError('INVALID_PAYLOAD')`.
- [ ] Test `renders each template exactly`, with fixed slots. The expected strings are the bodies in C3 with the slots filled in, dates `dd/MM/yyyy`.
- [ ] Test `a human note is appended on decision`, through `DecideProposalUseCase` with an edited `note_vi`.
- [ ] Test `recipients are the cooperative's households of the parcels`: two TC parcels → their households' users; a TC and an LB parcel code → `execute` throws `ValidationError` and nothing is sent.
- [ ] Commit: `feat(web): templated notifications for officers and households`.

#### Task W4: `disease.inspection` and `harvest.approve` (C4)

- [ ] Tests:
  - `harvest.approve executes ApproveHarvestUseCase as the approver` (mocked use case);
  - `a harvest refused by the use case leaves the proposal failed` (H1);
  - `disease.inspection notifies officers and managers with the deep link`;
  - the preview strings.
- [ ] Commit: `feat(web): disease inspection and harvest approval actions`.

#### Task W5: bulletins (C5) and `bulletin.publish`

- [ ] Prisma migration `<timestamp>_bulletin_status_and_cooperative`, force-added. Update `public_bulletins.yaml`: filter `status = published`; cooperative rows visible only to that cooperative.
- [ ] Tests:
  - `a cooperative bulletin is preferred over the shared one`;
  - `a draft or rejected bulletin is never read`;
  - `publish marks earlier rows of the cooperative not latest`;
  - `bulletin.publish refuses a text under 50 characters`.
- [ ] Commit: `feat(web): bulletins per cooperative with a status, published by approval`.

#### Task W6: inbox and settings

- [ ] Evidence labels in the inbox for the five tables, following the existing journal rendering (no raw ids or ISO timestamps; `*_milli` shown divided by 1000 with the unit).
- [ ] `bulletin` row in the settings tab.
- [ ] Screenshots: desktop and 390 px phone, light and dark.
- [ ] Update `docs/api-contract.md` (kinds, payloads, the repeat window) and `docs/database-schema.md` (bulletins).
- [ ] Commit: `feat(web): the inbox reads field, disease, harvest and bulletin proposals`.

Done when the whole Jest suite, lint, `tsc --noEmit` and `prisma validate` are clean.

### Track A — agent (`platform/agent/**`)

#### Task A1: evidence builders (C2)

- [ ] `test_evidence_m4.py`: every case of `evidence-vectors-m4.json` reproduces `values`, `canonical`, `sha256`.
- [ ] Builders in `dxos_agent/evidence.py`, one per table, named like the existing ones:
  - `parcel_evidence_row`
  - `disease_report_evidence_row`
  - `sensor_reading_evidence_row`
  - `weather_evidence_row`
  - `market_evidence_row`
- [ ] Commit.

#### Task A2: schedules and thresholds

- [ ] Add `IntervalSchedule(interval)` and `DailySchedule(at: time)` to `schedule.py`. Tests:
  - due on the first cycle;
  - not due again within the interval;
  - a daily run happens once per Vietnam day, at or after `at`.
- [ ] Add `AgentSettings.thresholds_for(agent) -> Mapping[str, Any]` (C1 of M3 already returns `thresholds`), with the C6 defaults filled in for missing or wrongly typed keys. Test.
- [ ] Commit.

#### Task A3: A2 `field-watch` (C6) and scenario `a2_field_watch.json`

Cases:
- silent sensor;
- dry soil on two parcels;
- heat;
- frost at night;
- rain the day after spraying;
- no forecast;
- no sensors;
- second cycle after a decision proposes the same subjects (the web dedupes; the agent stays stateless).

- [ ] Commit.

#### Task A4: A3 `disease-watch` and scenario `a3_disease_watch.json`

Cases:
- three reports within 2 km;
- three reports of different diseases;
- two reports only;
- a report labelled `healthy`;
- a report matched by its Vietnamese label;
- a parcel without a centroid;
- reports older than 7 days.

- [ ] Commit.

#### Task A5: A4 `harvest-ready` and scenario `a4_harvest_ready.json`

Cases:
- ready parcel;
- sprayed yesterday, safe tomorrow;
- harvest date 5 days away;
- already `HARVEST_APPROVED`;
- a draft spraying entry is ignored.

- [ ] Commit.

#### Task A6: A5 `bulletin` and scenario `a5_bulletin.json`

Use the replay provider. Cases:
- bulletin from four rows;
- no rows in 48 hours;
- malformed output twice gives a skipped run;
- a provider error falls back to Ollama, as in M3.

- [ ] Commit.

#### Task A7: wiring

- [ ] `__main__.py` runs A2–A5 for each cooperative when their schedule is due.
- [ ] One agent failing does not stop the others or A1. Each run reports provider fields like A1.
- [ ] Test in `test_main.py`.
- [ ] Commit.

Done when `PYTHONPATH=platform/agent pytest platform/agent/tests -W error` passes and every scenario has the cases above.

### Track I — permissions, smoke, docs

Files:
- `platform/hasura/metadata/**` (except `public_bulletins.yaml`)
- `platform/tests/**` (except `platform/agent/tests`)
- `docs/rules-and-limits.md`
- `README.md`

#### Task I1: Hasura agent permissions (C7)

- [ ] Add the C7 permissions.
- [ ] Extend the existing metadata tests: no agent permission exposes `photo_url`, `photo_minio_key`, `gps_lat`, `gps_lng`, `treatment_notes`, `detected_by_id`, phone or name columns.
- [ ] Commit.

#### Task I2: smoke (agentic smoke step, web up)

Seed for TC:
- a sensor reading 8 hours old;
- three reports of `helopeltis` on parcels within 2 km;
- a ready parcel;
- market rows.

Then:
- [ ] Restart `dxos-agent` and check one open proposal of each kind:
  - `notification.internal`;
  - `notification.households`;
  - `disease.inspection`;
  - `harvest.approve`;
  - `bulletin.publish`.

  For `bulletin.publish`, set TC's `bulletin` provider to the M3 LLM stub, extended to answer `{"bulletin_vi": …}` when the system message asks for it.
- [ ] Approve `harvest.approve` through `POST /api/agent/proposals/{id}/decision` as `smoke_manager_tc` → the parcel is `HARVEST_APPROVED`.
- [ ] Approve the households notification → a notification row for the household's user.
- [ ] Post an agent proposal with `note_vi` → 400 (test 32 end to end).
- [ ] Clean up.
- [ ] Commit.

#### Task I3: docs

- [ ] `docs/rules-and-limits.md`: new section with the C6 thresholds and the template rule.
- [ ] `README.md`: one line per new agent.
- [ ] Commit.

Done when `pytest platform/cli/tests platform/tests` passes, `bash -n` is clean on changed scripts, and the smoke runs green in CI.

## Done when

- Every track's tests pass, and the web suite, lint and type check are clean.
- The platform smoke passes in CI with the five proposals and the two approvals above.
- Each agent has its scenario file.
- Test 32 passes at unit level (W3) and end to end (I2).
