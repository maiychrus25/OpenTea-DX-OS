# Database Schema — OpenTea DX-OS

**ORM:** Prisma 5.x · **DB:** PostgreSQL 16 (PostGIS + pgvector) · **Schema file:** `apps/web/prisma/schema.prisma`

> [!IMPORTANT]
> **Nguồn sự thật thực thi:** `apps/web/prisma/schema.prisma` (schema `public`) và `platform/postgres/init/*.sql` (các schema `audit`, `telemetry`, `platform`), cộng với các schema `app_<id>` của Mini-app Tầng 3.
> Tài liệu này còn ghi nhận một số sai lệch lịch sử so với Prisma thực tế (ví dụ: người dùng quản lý qua Keycloak thay vì bảng `users`; `journal_entries` hiện chưa có `parcel_crop_cycle_id` và `partners` chưa có `htx_profile_id` — xem `DEV-007`, `DEV-010` trong [deviation-register.md](./deviation-register.md) và lộ trình hợp nhất trong [product-roadmap.md](./product-roadmap.md)).

> **Rule:** n8n is the ONLY writer to `market_data`, `weather_cache`, `bulletins`, `fx_rates` tables.
> All other core `public` tables are written by Next.js API routes via Prisma (and protected by `audit.events` hash-chain triggers).

---

## ERD Overview

```mermaid
erDiagram
    HTXProfile ||--o{ Household : "has"
    HTXProfile ||--o{ Partner : "manages"
    Household ||--o{ Parcel : "owns"
    Parcel ||--o{ ParcelCropCycle : "has"
    ParcelCropCycle ||--o{ JournalEntry : "records"
    JournalEntry ||--o{ JournalActivity : "contains"
    JournalEntry }o--|| User : "recorded_by"
    Lot ||--o{ LotParcel : "includes"
    LotParcel }o--|| Parcel : "from"
    Lot ||--o{ DiseaseReport : "may_have"
    User ||--o{ Notification : "receives"
    User ||--o{ DiseaseReport : "submits"
    Parcel ||--o{ WeatherCache : "has_weather"
    Bulletin }o--|| MarketData : "synthesized_from"
```

---

## Tables

### `htx_profiles`
HTX (Hợp tác xã) master profile. Multi-tenant isolation key (`htx_code`, hỗ trợ nhiều HTX trên cùng một triển khai SaaS hoặc cụm Liên minh Tỉnh).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default gen_random_uuid() | |
| htx_code | VARCHAR(20) | UNIQUE, NOT NULL | Mã HTX (dùng cho Lot code) |
| name | VARCHAR(200) | NOT NULL | Tên HTX |
| province | VARCHAR(100) | NOT NULL | Tỉnh/Thành phố |
| district | VARCHAR(100) | NOT NULL | Quận/Huyện |
| commune | VARCHAR(100) | NOT NULL | Xã/Phường |
| address_detail | TEXT | | Địa chỉ chi tiết |
| primary_crop | VARCHAR(100) | NOT NULL | Cây trồng chính |
| total_area_ha | DECIMAL(10,2) | | Tổng diện tích (ha) — auto-calc from parcels |
| member_count | INT | | Số thành viên — auto-calc from households |
| certification | VARCHAR(50) | | VietGAP / GlobalGAP / Organic |
| logo_minio_key | VARCHAR(500) | | MinIO object key cho logo |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

---

### `users`
Keycloak-linked user records. Synced on first login.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Matches Keycloak subject ID |
| keycloak_id | VARCHAR(100) | UNIQUE, NOT NULL | Keycloak sub claim |
| email | VARCHAR(200) | UNIQUE, NOT NULL | |
| full_name | VARCHAR(200) | NOT NULL | |
| role | ENUM('manager','officer','farmer') | NOT NULL | Synced from Keycloak role |
| phone | VARCHAR(20) | | |
| household_id | UUID | FK → households, nullable | Nếu role = farmer |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** `keycloak_id`, `email`, `role`

---

### `households`
Nông hộ thành viên HTX.

> ⚠️ **Schema Divergence (Story 7.0a):** `htx_profile_id` được thêm qua migration `20260814102205_add_htx_relations`. Field là `nullable` (`String?`) trong Prisma thực tế, không phải NOT NULL như spec gốc. Existing rows cần backfill (`scripts/backfill-htx-profile-id.sql`).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT (cuid) | PK | |
| htx_profile_id | TEXT | FK → htx_profiles, **nullable** | Added by Story 7.0a migration |
| name | VARCHAR(200) | NOT NULL | Tên chủ hộ (`owner_name` trong spec gốc) |
| phone | VARCHAR(20) | UNIQUE, NOT NULL | Dùng làm household_code |
| address | TEXT | nullable | |
| keycloak_user_id | TEXT | nullable | Linked after farmer account created |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

---

### `parcels`
Thửa đất (land parcel). Mỗi hộ có nhiều thửa.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| household_id | UUID | FK → households, NOT NULL | |
| parcel_code | VARCHAR(50) | UNIQUE, NOT NULL | Mã thửa |
| name | VARCHAR(200) | | Tên thửa (tự đặt) |
| area_ha | DECIMAL(10,4) | NOT NULL | Diện tích (ha) — Turf.js calculated |
| geojson | JSONB | NOT NULL | GeoJSON polygon từ Leaflet.draw |
| centroid_lat | DECIMAL(10,7) | NOT NULL | Tâm thửa — cho Open-Meteo query |
| centroid_lng | DECIMAL(10,7) | NOT NULL | |
| status | ENUM('idle','growing','harvested','fallow') | NOT NULL, DEFAULT 'idle' | |
| current_crop | VARCHAR(100) | | Cây trồng đang canh tác |
| soil_type | VARCHAR(100) | | Loại đất |
| irrigation_type | VARCHAR(100) | | Tưới tiêu |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** `household_id`, `status`, `(centroid_lat, centroid_lng)`

---

### `parcel_crop_cycles`
Vụ mùa của thửa đất. Mỗi thửa có thể nhiều vụ.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| parcel_id | UUID | FK → parcels, NOT NULL | |
| season | VARCHAR(50) | NOT NULL | Vụ Đông Xuân / Hè Thu / Vụ Mùa |
| crop | VARCHAR(100) | NOT NULL | Cây trồng vụ này |
| planting_date | DATE | NOT NULL | |
| estimated_harvest_date | DATE | | |
| actual_harvest_date | DATE | | |
| estimated_yield_kg | DECIMAL(10,2) | | Sản lượng ước tính |
| actual_yield_kg | DECIMAL(10,2) | | Sản lượng thực tế |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

---

### `journal_entries`
Nhật ký canh tác. Officer ghi, Manager duyệt.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| parcel_crop_cycle_id | UUID | FK → parcel_crop_cycles, NOT NULL | |
| recorded_by | UUID | FK → users, NOT NULL | Officer ID |
| approved_by | UUID | FK → users, nullable | Manager ID |
| entry_date | DATE | NOT NULL | Ngày ghi |
| growth_stage | VARCHAR(100) | | Giai đoạn sinh trưởng |
| observation | TEXT | | Quan sát chung |
| weather_condition | VARCHAR(100) | | Thời tiết ngày đó |
| temperature_c | DECIMAL(5,2) | | Auto từ Open-Meteo |
| rainfall_mm | DECIMAL(8,2) | | Auto từ Open-Meteo |
| status | ENUM('draft','pending_approval','approved','rejected') | NOT NULL, DEFAULT 'draft' | |
| approved_at | TIMESTAMPTZ | | |
| rejection_reason | TEXT | | |
| review_note | TEXT | nullable | Lý do cán bộ nhập khi từ chối hoặc yêu cầu sửa (`20261124120000_journal_review_note`) |
| reviewed_by_id | TEXT | nullable | Keycloak ID của người duyệt, từ chối hoặc yêu cầu sửa; ghi cùng lúc với cập nhật trạng thái có điều kiện `PENDING_APPROVAL` (`20261124140000_journal_reviewed_by`) |
| photo_minio_keys | TEXT[] | | Mảng MinIO keys |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** `parcel_crop_cycle_id`, `status`, `entry_date`, `recorded_by`

---

### `journal_activities`
Chi tiết hoạt động trong một nhật ký (phun thuốc, bón phân...).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| journal_entry_id | UUID | FK → journal_entries, NOT NULL | |
| activity_type | ENUM('pesticide','fertilizer','irrigation','harvesting','soil_prep','other') | NOT NULL | |
| product_name | VARCHAR(200) | | Tên thuốc / phân bón |
| dosage | VARCHAR(100) | | Liều lượng |
| area_applied_ha | DECIMAL(10,4) | | Diện tích áp dụng |
| withdrawal_days | INT | | Ngày cách ly (thuốc BVTV) |
| safe_harvest_date | DATE | | entry_date + withdrawal_days |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

---

### `lots`
Lô hàng — đơn vị QR truy xuất nguồn gốc.

> ⚠️ **Schema Divergence (Story 7.0a):** Table được recreate qua migration `20260814102205_add_htx_relations` (DROP TABLE `Lot` + CREATE TABLE `lots`). Một số fields thực tế khác với spec gốc — xem cột "Thực tế" bên dưới.

| Column | Type | Constraints | Thực tế trong Prisma | Description |
|--------|------|-------------|---------------------|-------------|
| id | TEXT (cuid) | PK | `id String @id @default(cuid())` | |
| lot_code | VARCHAR(100) | UNIQUE, NOT NULL | ✅ | Format: HTX-CROP-YYYYMMDD-NNN |
| htx_profile_id | TEXT | **nullable** FK → htx_profiles | ✅ Added Story 7.0a | HTX scoping |
| commodity | VARCHAR(100) | NOT NULL | ✅ (`commodity`) | Loại nông sản |
| quality_grade | TEXT | nullable | ✅ (không có trong spec gốc) | "Grade 1" / "Grade 2" / "Ungraded" |
| harvest_date | DATE | NOT NULL | ✅ `DateTime` | |
| estimated_weight_kg | DECIMAL(10,2) | nullable | ✅ | |
| actual_weight_kg | DECIMAL(10,2) | nullable | ✅ | |
| packaging_type | VARCHAR(100) | nullable | ✅ | |
| destination | VARCHAR(200) | nullable | ✅ | Nơi giao hàng |
| buyer_name | VARCHAR(200) | nullable | ✅ | Tên người mua |
| status | ENUM | NOT NULL, DEFAULT 'DRAFT' | `LotStatus` enum: DRAFT/READY/QR_EXPORTED | |
| qr_image_url | TEXT | nullable | `qr_image_url` (không phải `qr_minio_key`) | MinIO URL |
| certificate_keys | TEXT[] | DEFAULT [] | ✅ | MinIO object keys |
| public_page_data | JSONB | nullable | ✅ | Snapshot for QR public page |
| created_by_id | TEXT | nullable | keycloak officer user ID | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | ✅ | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | ✅ | |

**Indexes:** `lot_code` (unique), `status`, `htx_profile_id`

> **Note:** Fields `packaging_date`, `total_weight_kg`, `packaging_spec` xuất hiện trong migration SQL nhưng **không có trong schema.prisma hiện tại** — đây là migration artefact từ intermediate schema version, không dùng trong application code.

---

### `lot_parcels`
Junction: thửa nào thuộc lô nào (M-M).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| lot_id | UUID | FK → lots, NOT NULL | |
| parcel_id | UUID | FK → parcels, NOT NULL | |
| cycle_id | UUID | FK → parcel_crop_cycles | Vụ mùa cụ thể |

**PK:** (lot_id, parcel_id)

---

### `partners`
Đối tác nông nghiệp (bản đồ đối tác).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| htx_profile_id | UUID | FK → htx_profiles | |
| name | VARCHAR(200) | NOT NULL | Tên đối tác |
| type | ENUM('buyer','supplier','service','bank','other') | NOT NULL | |
| address | TEXT | | |
| lat | DECIMAL(10,7) | | Geocoded bởi Nominatim |
| lng | DECIMAL(10,7) | | |
| phone | VARCHAR(20) | | |
| website | VARCHAR(500) | | |
| contact_person | VARCHAR(200) | | |
| is_verified | BOOLEAN | NOT NULL, DEFAULT false | Manager verified |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** `type`, `(lat, lng)`, `htx_profile_id`

---

### `notifications`
Thông báo cá nhân (Web Bell).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| recipient_id | UUID | FK → users, NOT NULL | |
| type | ENUM('market_alert','journal_approved','journal_rejected','lot_exported','system','disease_result') | NOT NULL | |
| title | VARCHAR(200) | NOT NULL | |
| body | TEXT | NOT NULL | |
| link | VARCHAR(500) | | Deep link URL |
| is_read | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| read_at | TIMESTAMPTZ | | |

**Indexes:** `recipient_id`, `is_read`, `created_at DESC`

---

### `disease_reports`
Kết quả chẩn đoán bệnh cây (FastAPI model).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| submitted_by | UUID | FK → users, NOT NULL | |
| parcel_id | UUID | FK → parcels, nullable | |
| lot_id | UUID | FK → lots, nullable | |
| image_minio_key | VARCHAR(500) | NOT NULL | |
| disease_name | VARCHAR(200) | | Tên bệnh (VI) |
| confidence_score | DECIMAL(5,4) | | 0.0000 – 1.0000 |
| raw_api_response | JSONB | | Full FastAPI response |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

---

### `market_data` *(written by n8n)*
Dữ liệu thị trường raw từ external APIs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| source | VARCHAR(50) | NOT NULL | (NASA, COMTRADE, USDA, WTO, FAOSTAT, worldbank, etc.) |
| commodity | VARCHAR(100) | NOT NULL | |
| metric | VARCHAR(100) | NOT NULL | (export_volume, price_fob, tariff_rate...) |
| value | DECIMAL(18,4) | NOT NULL | |
| unit | VARCHAR(50) | | |
| period | VARCHAR(20) | | YYYY-MM hoặc YYYY |
| country | VARCHAR(10) | | ISO country code |
| fetched_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes:** `(source, commodity, metric, period)`

---

### `weather_cache` *(written by n8n)*
Cache thời tiết theo thửa (Open-Meteo 1h).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| parcel_id | UUID | FK → parcels, NOT NULL | |
| temperature_c | DECIMAL(5,2) | | |
| humidity_pct | DECIMAL(5,2) | | |
| rainfall_mm | DECIMAL(8,2) | | |
| wind_speed_ms | DECIMAL(6,2) | | |
| weather_code | INT | | WMO weather code |
| uv_index | DECIMAL(4,1) | | |
| forecast_json | JSONB | | 7-day forecast |
| fetched_at | TIMESTAMPTZ | NOT NULL | |

**Upsert key:** `(parcel_id)` — một record per parcel, overwritten mỗi giờ

---

### `bulletins` *(written by n8n + Ollama)*
Bản tin thị trường được AI tổng hợp.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| commodity | VARCHAR(100) | NOT NULL | |
| bulletin_vi | TEXT | NOT NULL | Bản tin tiếng Việt (Ollama output) |
| sources_json | JSONB | NOT NULL | Citations: [{source, url, date, value}] |
| audio_minio_key | VARCHAR(500) | | Piper TTS audio (nullable nếu chưa gen) |
| generated_at | TIMESTAMPTZ | NOT NULL | |
| model_used | VARCHAR(100) | NOT NULL | phi3 / mistral |
| is_latest | BOOLEAN | NOT NULL, DEFAULT true | Chỉ 1 record is_latest=true per commodity |
| status | TEXT | NOT NULL, DEFAULT 'published', CHECK `draft \| published \| rejected` | M4. Only `published` rows are read. Drafts are not stored (the text lives in the proposal), so `draft` and `rejected` are reserved |
| htx_code | TEXT | NULL | M4. The owning cooperative; NULL is a shared bulletin written by the n8n workflow |

Migration `20261125130000_bulletin_status_and_cooperative` adds `status` and `htx_code` (index `bulletins_htx_code_commodity_is_latest_idx`). The agent's `bulletin.publish` approval marks the cooperative's earlier latest rows of the commodity not latest and inserts a row with `htx_code` and `model_used = 'agent:bulletin'`. Readers (`/api/bulletin`, `/api/tts`, the manager and officer pages, Hasura `public_bulletins`) show the cooperative's own published row first, otherwise the latest shared one.

**Indexes:** `(commodity, is_latest)`, `generated_at DESC`

---

### `fx_rates` *(written by n8n)*
Tỷ giá USD/VND (Frankfurter API).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| rates | JSONB | NOT NULL | Toàn bộ tỷ giá thế giới (VND, CNY, JPY...) |
| fetched_at | TIMESTAMPTZ | NOT NULL | |

---

### Agentic Layer (`platform` schema — `platform/postgres/init/08-agent.sql`, M1a)
Tất cả ba bảng đều gắn trigger `dxos_audit_row` ghi vào `audit.events`.

- **`platform.agent_runs`**: lịch sử các lượt chạy agent (`id`, `htx_code`, `agent`, `trigger` ∈ `schedule|event|manual`, `started_at`, `finished_at`, `status` ∈ `running|ok|failed|skipped`, `provider`, `model`, `tokens_in`, `tokens_out`, `cost_estimate`, `error`, `prompt_version`, `input_hash`).
- **`platform.agent_proposals`**: hàng đợi đề xuất hành động và vết kiểm duyệt (`id`, `htx_code`, `run_id`, `agent`, `kind`, `payload` JSONB, `reason_vi`, `evidence` JSONB, `confidence`, `risk` ∈ `low|medium|high`, `status` ∈ `proposed|approved|executed|failed|rejected|expired|stale|sent_to_staff_app`, `origin` ∈ `agent|user`, `requested_by`, `dedupe_key`, `subject_ids` text[] NOT NULL DEFAULT `'{}'`, `created_at`, `expires_at`, `decided_by`, `decided_by_name`, `decided_at`, `decision_channel` ∈ `web|telegram`, `decision_note`, `edited_payload` JSONB, `executed_at`, `result` JSONB, `external_ref` text NULL: mã việc của app nhân sự). `dedupe_key` được máy tạo từ `kind` và danh sách đối tượng (`subject_ids`), không lấy khóa do agent gửi. Partial unique index `agent_proposals_one_open` trên `(htx_code, kind, dedupe_key)` khi `status IN ('proposed', 'approved')`. GIN index `agent_proposals_subject_ids` trên `subject_ids`: đề xuất `journal.*` mới bị từ chối khi một đề xuất mở cùng HTX đã chứa đối tượng đó (kiểm dưới khóa `pg_advisory_xact_lock` theo HTX). Migration Prisma `20261124130000_agent_proposal_subjects` thêm cột có điều kiện, vì bảng này nằm ngoài schema Prisma; cùng thay đổi nằm trong `platform/postgres/init/08-agent.sql` (idempotent).
- **`platform.agent_settings`**: cấu hình agent theo từng HTX (`id` UUID UNIQUE, `htx_code`, `agent`, `enabled`, `schedule`, `provider`, `model`, `thresholds` JSONB, `monthly_budget`; PK `(htx_code, agent)`). M3: `model` là tên model tuỳ chọn (cột thêm trong `08-agent.sql` và bằng migration Prisma `20261125120000_agent_external_providers`, có điều kiện vì bảng nằm ngoài Prisma). Tab Cài đặt trên web chỉ đổi `provider`, `model`, `schedule` và ngân sách; `enabled` chỉ đổi bằng `./dxos agent enable|disable`. Hàng `agent = 'cooperative'` giữ ngân sách tháng của HTX trong `monthly_budget`; với `digest`, `schedule` là giờ gửi báo cáo `HH:MM`.


### Chiến dịch hôm nay (`platform` schema — `platform/postgres/init/08-agent.sql`, M7)

Migration Prisma `20261126180000_daily_campaigns` tạo cùng ba bảng khi schema `platform` đã có (có điều kiện, như các bảng M3 đến M5).

- **`platform.campaigns`**: một chiến dịch cho mỗi HTX và ngày Việt Nam (`UNIQUE (htx_code, day)`). `status` ∈ `draft|approved|partial|done|dropped`; `goals` JSONB (`[{goal_key, label_vi, unit_vi, target}]`), `summary_vi`, `run_id`, `decided_by`, `decided_by_name`, `decided_at`, `telegram_sent`, `created_at`. Có trigger `dxos_audit_row`.
- **`platform.campaign_items`**: các việc của chiến dịch, `(campaign_id, proposal_id)` là khóa chính, `position` 1..15 duy nhất trong chiến dịch, `goal_key`, `target`. Có trigger `dxos_audit_row`. Bảng có thêm cột `id uuid UNIQUE` để trigger kiểm toán (đọc `NEW.id`) hoạt động như các bảng khác; đây là khác biệt so với hợp đồng C1 ghi trong kế hoạch M7.
- **`platform.campaign_outcomes`**: kết quả 18:00 theo mục tiêu, khóa chính `(campaign_id, goal_key)`, `target`, `actual`, `measured_at`. Cũng có cột `id uuid UNIQUE` và trigger `dxos_audit_row` vì cùng lý do.

### Cải tiến hằng tuần (`platform` schema — `platform/postgres/init/08-agent.sql`, M8)

Migration Prisma `20261127090000_weekly_improvements` tạo bảng khi schema `platform` đã có (có điều kiện, như các migration M7).

- **`platform.improvements`**: cải tiến A10 đề xuất, một dòng cho mỗi HTX, tuần (thứ Hai) và `metric_key` (`UNIQUE (htx_code, week, metric_key)`). `kind` ∈ `setting|process|template`; `title_vi` tối đa 120 ký tự, `rationale_vi` tối đa 600; `baseline` số; `evidence` JSONB do agent gửi; `proposal_id` là đề xuất đã tạo (`UNIQUE`, khóa ngoại tới `agent_proposals`). `status` ∈ `proposed|adopted|declined|measured`, `decided_by`, `adopted_at`. `effect` JSONB chứa `after_2w` và `after_4w`, mỗi mục gồm `value`, `verdict` (`helped|no_effect|drop`) và `at`. `template` JSONB chỉ cho kind `template`: `{weekday, goal_key, title_vi}`. Có trigger `dxos_audit_row`.
- Ghi kiểm toán dùng tác nhân `agent:improvement` khi A10 tạo hoặc gắn đề xuất, và `user:<id>` khi quyết định.

### Giao việc cho nhân sự (`platform` schema — `platform/postgres/init/08-agent.sql`, M10)

Migration Prisma `20261127170000_staff_sync` thêm cột `agent_proposals.external_ref`, đổi ràng buộc `agent_proposals_status_check` để có `sent_to_staff_app` (chỉ `staff.task.create` dùng), và tạo hai bảng khi schema `platform` đã có (có điều kiện, như các migration M7). Cả hai bảng có trigger `dxos_audit_row`.

- **`platform.staff_roster`**: nhân sự do app nhân sự báo, `UNIQUE (htx_code, staff_ref)`; `staff_ref` là mã nhân viên trong app, `name`, `department`, `active`, `updated_at`. Mỗi lần đẩy danh sách, dòng không có mặt chuyển `active = false` (không xóa). Không lưu số điện thoại hay lương.
- **`platform.staff_attendance`**: số người có mặt theo ngày, `UNIQUE (htx_code, day)`, `present` ≥ 0, `reported_at`. Quy tắc người của A9 chỉ đọc hàng của hôm nay.
- Ghi kiểm toán dùng tác nhân `system:staff` cho đẩy danh sách, báo có mặt và xác nhận việc; sự kiện `agent.proposal.sent_to_staff_app` khi duyệt, `agent.proposal.executed` khi app nhân sự xác nhận.

### Kế hoạch mùa vụ (`platform` schema — `platform/postgres/init/08-agent.sql`, M11)

Migration Prisma `20261127150000_strategy_plans` tạo bảng khi schema `platform` đã có (có điều kiện, như các migration M7 và M8).

- **`platform.strategy_plans`**: kế hoạch quý do A11 soạn. `season` dạng `YYYY-Qn`; `goals` JSONB (`[{key, label_vi, unit_vi, baseline, target, direction}]`), `priorities` và `initiatives` JSONB (mỗi loại tối đa 5), `warnings` JSONB (mặc định `[]`). `status` ∈ `draft|adopted|superseded`; `proposal_id` UNIQUE, khóa ngoại tới `agent_proposals` với `ON DELETE SET NULL`; `adopted_by`, `adopted_at`, `run_id`, `created_at`; `UNIQUE (htx_code, season, created_at)`.
- Chỉ mục duy nhất từng phần `strategy_plans_one_draft` trên `(htx_code, season) WHERE status = 'draft'`: mỗi HTX và quý chỉ có một bản nháp. Áp dụng một bản nháp chuyển bản đã áp dụng trước của quý đó sang `superseded`.
- Có trigger `dxos_audit_row`. Ghi kiểm toán dùng tác nhân `agent:strategy` khi A11 tạo hoặc gắn đề xuất, `user:<id>` khi áp dụng, kèm sự kiện `strategy.adopted`.

### Tự vận hành (`platform` schema — `platform/postgres/init/08-agent.sql`, M12)

Migration Prisma `20261127120000_autopilot` tạo bảng và thêm cột khi schema `platform` đã có (có điều kiện, như các migration M7 và M8). Trong init, ràng buộc `agent_proposals_decision_channel_check` được tạo lại để nhận giá trị `autopilot`.

- **`platform.autopilot`**: một dòng cho mỗi HTX (`htx_code` UNIQUE). `enabled`, `enabled_by` (id trưởng HTX đã bật), `enabled_by_name`, `enabled_at`, `unlocked_kinds` text[] (các loại `unlockable` được mở lúc bật), `daily_cap` 1..50 (mặc định 50), `stopped_at`, `stopped_by`, `stop_reason` ∈ `manual|enabler_lost|inactive|brake_failures|brake_cap|brake_blocks|brake_volume`, `last_manager_activity_at`, `updated_at`. Có trigger `dxos_audit_row`. Bật lại dùng lại dòng cũ (xóa các cột dừng).
- **`platform.agent_proposals`** có thêm: `shadow_auto` boolean (đề xuất có chạy tự động không nếu mọi loại `unlockable` đều được mở; ghi lúc tạo ở cả hai chế độ), `run_at` (giờ tick được phép chạy; chỉ đặt khi chế độ bật), `run_claimed_at` (tick đã nhận; câu lệnh nhận là `UPDATE … WHERE run_at <= now() AND run_claimed_at IS NULL … FOR UPDATE SKIP LOCKED … RETURNING`, nên hai tick không bao giờ nhận cùng một dòng), `blocked_by`, `blocked_at` (nút Chặn). Chỉ mục từng phần `agent_proposals_due (run_at) WHERE run_at IS NOT NULL AND run_claimed_at IS NULL AND status = 'proposed'`.
- `decision_channel` nhận thêm `autopilot`. Dừng chế độ xóa `run_at` và `run_claimed_at` của mọi đề xuất còn `proposed`.
- Sự kiện kiểm toán: `autopilot.enabled` (kèm ảnh chụp màn hình bật), `autopilot.stopped` (`reason`, `returned`), `autopilot.blocked`. Quyết định tự chạy ghi tác nhân `autopilot:<agent>` và `enabled_by` trong chi tiết của `agent.proposal.approved`, `executed`, `failed`, `stale`.

### Xưởng mini-app (`platform` schema — `platform/postgres/init/08-agent.sql`, M13)

- `app_build_requests`: yêu cầu của trưởng HTX (`request_text` 5 đến 500, `questions` tối đa 5, `answer_text`, `path` `store|book|build`, `app_id`, `spec`, `status` `new|asking|routed|spec_proposed|spec_approved|building|passed|failed|installed|cancelled`, `error_vi`, `announced_at`). Chỉ mục duy nhất từng phần: một dòng mỗi `htx_code` ở `new`, `asking`, `spec_proposed`, `spec_approved`, `building`. Có trigger kiểm toán.
- `app_builds`: mỗi lần xây (`request_id` ON DELETE CASCADE, `app_id`, `version`, `provider`, `rounds` 0 đến 3, `status` `running|passed|failed`, `gates` `[{name, ok, detail_vi}]`, `git_tag`); duy nhất `(app_id, version)`. Có trigger kiểm toán.
- `app_build_files`: sáu tệp theo `(build_id, name)`: bốn ảnh PNG, `review.md`, `spec.md`.
- `app_catalog.owner_htx` (06-app-store.sql) và `app_catalog.build_id` (tham chiếu `app_builds`): app do AI xây thuộc đúng một HTX. `telegram_conversations.kind` thêm `app_answer`; `telegram_outbox.photos jsonb`.
- Di chuyển `20261127190000_app_builder` (có `IF` bảo vệ như M7 và M12).

### Telegram base (`platform` schema — `platform/postgres/init/09-telegram.sql`, M2)
Chỉ `telegram_links` và `system_alerts` gắn trigger `dxos_audit_row` (ai liên kết tài khoản nào, cảnh báo hệ thống). Các bảng còn lại là dữ liệu vận hành (mã liên kết, hàng đợi gửi, hội thoại, mã cập nhật, nhịp tim mỗi phút, dấu báo cáo): ghi audit sẽ làm chuỗi băm phình ra mà không thêm thông tin.

- **`platform.telegram_links`**: liên kết Telegram. `kind` ∈ `user|group`; với `user` có `user_id` (Keycloak sub), `user_name`, `role` (lúc liên kết, chỉ dùng để chọn người nhận), `telegram_user_id`; `htx_code`, `chat_id`, `linked_at`, `unlinked_at`. Tối đa một liên kết hoạt động cho mỗi tài khoản Telegram, mỗi người dùng, và mỗi HTX có một nhóm.
- **`platform.telegram_link_codes`**: mã liên kết, chỉ lưu `code_hash` (SHA-256), dùng một lần, hết hạn sau 10 phút.
- **`platform.telegram_outbox`**: hàng đợi tin nhắn cho relay. `op` ∈ `send|edit`, `purpose` ∈ `proposal|result|report|health|reply`, `status` ∈ `pending|leased|sent|failed`, kèm `attempts`, `next_attempt_at`, `lease_until`, `telegram_message_id`, `last_error`. Cột `health_key` (bổ sung ngoài thiết kế ban đầu) giữ khóa để mỗi tình trạng chỉ báo tối đa một lần sau 6 giờ.
- **`platform.telegram_conversations`**: mỗi người dùng Telegram một hội thoại đang mở. `kind` ∈ `reject_reason|flow`. `reject_reason` (M2) có `proposal_id`; `flow` (M5) có `proposal_id` rỗng và các cột `flow` (tên hành động hoặc `ask`), `step` (chỉ số bước; `-1` là thẻ đầu, `-2` là thẻ thứ hai), `state` JSONB, `token` (mã của nút đang hiệu lực), `card_message_id`, `expires_at`. Ràng buộc `(kind = 'reject_reason') = (proposal_id IS NOT NULL)`. Hội thoại hết hạn: luồng sau 30 phút không có bước mới, thẻ sau 10 phút, thẻ thứ hai sau 10 phút kể từ khi bấm Tiếp tục.
- **`platform.telegram_updates_seen`**: `update_id` đã xử lý, để bỏ qua cập nhật lặp lại. Cột `telegram_user_id` (M5, chỉ mục `(telegram_user_id, seen_at)`) đếm giới hạn 60 tin mỗi giờ.
- **`platform.assistant_requests`** (M5): câu chat mà router không xử lý, chờ agent A7. `status` ∈ `pending|claimed|done|failed|expired`, `role`, `chat_id`, `run_id`, `created_at`, `claimed_at`, `finished_at`. `text` tối đa 1000 ký tự và được xoá khi yêu cầu xong, hết hạn hoặc thất bại; dòng còn lại chỉ để đếm. Chỉ mục `(htx_code, status, created_at)`.
- **`platform.agent_runs.trigger`** (M5): thêm giá trị `message` cho lượt A7 chạy theo câu chat; ràng buộc `agent_runs_trigger_check` được tạo lại trong `08-agent.sql` và trong migration `20261126120000_telegram_assistant`.
- **`platform.service_heartbeats`**: nhịp kiểm tra theo dịch vụ. Khóa `service` là `telegram` hoặc `agent:<HTX>`. Cột `details` JSONB (M3) giữ `{ "providers": [...] }` cho agent: danh sách provider có khoá trong container. Cột được thêm trong `09-telegram.sql` và trong cùng migration `20261125120000_agent_external_providers`.
- **`platform.system_alerts`**: cảnh báo hệ thống. `source` ∈ `n8n|agent|web`; `htx_code` và `notified_at` có thể rỗng; `id` và `created_at` có mặc định. n8n ghi vào bảng này khi workflow lỗi.
- **`platform.agent_reports`**: báo cáo đã ghi nhận, khóa `(htx_code, kind, period_start)`, bảo đảm mỗi kỳ chỉ gửi một lần.

---

## Indexing Strategy

```sql
-- Critical query patterns and their indexes

-- 1. Journal entries by parcel, pending approval (most common officer query)
CREATE INDEX idx_journal_parcel_status ON journal_entries(parcel_crop_cycle_id, status);

-- 2. Notifications for user, unread first (polling/SSE)
CREATE INDEX idx_notif_recipient_read ON notifications(recipient_id, is_read, created_at DESC);

-- 3. Market data latest per source+commodity (bulletin generation)
CREATE INDEX idx_market_source_commodity ON market_data(source, commodity, metric, period DESC);

-- 4. Lot lookup by code (QR public page — must be fast)
CREATE UNIQUE INDEX idx_lot_code ON lots(lot_code);

-- 5. Weather by parcel (real-time dashboard)
CREATE INDEX idx_weather_parcel ON weather_cache(parcel_id, fetched_at DESC);

-- 6. Latest bulletin per commodity
CREATE INDEX idx_bulletin_latest ON bulletins(commodity, is_latest, generated_at DESC);
```

---

## Prisma Schema Location

```
apps/web/prisma/schema.prisma    ← Single source of truth
apps/web/prisma/migrations/      ← Auto-generated by prisma migrate
```

**Migration commands:**
```bash
# Dev: generate + apply
npx prisma migrate dev --name "init"

# Production: apply only
npx prisma migrate deploy

# Reset dev DB
npx prisma migrate reset
```
