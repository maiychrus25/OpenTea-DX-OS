# Database Schema — DX-AgriMarket

**ORM:** Prisma 5.x · **DB:** PostgreSQL 16 · **Schema file:** `apps/web/prisma/schema.prisma`

> **Rule:** n8n is the ONLY writer to `market_data`, `weather_cache`, `bulletins`, `fx_rates` tables.
> All other tables are written by Next.js API routes via Prisma.

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
HTX (Hợp tác xã) master profile. One record per deployment.

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
- **`platform.agent_proposals`**: hàng đợi đề xuất hành động và vết kiểm duyệt (`id`, `htx_code`, `run_id`, `agent`, `kind`, `payload` JSONB, `reason_vi`, `evidence` JSONB, `confidence`, `risk` ∈ `low|medium|high`, `status` ∈ `proposed|approved|executed|failed|rejected|expired|stale`, `origin` ∈ `agent|user`, `requested_by`, `dedupe_key`, `subject_ids` text[] NOT NULL DEFAULT `'{}'`, `created_at`, `expires_at`, `decided_by`, `decided_by_name`, `decided_at`, `decision_channel` ∈ `web|telegram`, `decision_note`, `edited_payload` JSONB, `executed_at`, `result` JSONB). `dedupe_key` được máy tạo từ `kind` và danh sách đối tượng (`subject_ids`), không lấy khóa do agent gửi. Partial unique index `agent_proposals_one_open` trên `(htx_code, kind, dedupe_key)` khi `status IN ('proposed', 'approved')`. GIN index `agent_proposals_subject_ids` trên `subject_ids`: đề xuất `journal.*` mới bị từ chối khi một đề xuất mở cùng HTX đã chứa đối tượng đó (kiểm dưới khóa `pg_advisory_xact_lock` theo HTX). Migration Prisma `20261124130000_agent_proposal_subjects` thêm cột có điều kiện, vì bảng này nằm ngoài schema Prisma; cùng thay đổi nằm trong `platform/postgres/init/08-agent.sql` (idempotent).
- **`platform.agent_settings`**: cấu hình agent theo từng HTX (`id` UUID UNIQUE, `htx_code`, `agent`, `enabled`, `schedule`, `provider`, `model`, `thresholds` JSONB, `monthly_budget`; PK `(htx_code, agent)`). M3: `model` là tên model tuỳ chọn (cột thêm trong `08-agent.sql` và bằng migration Prisma `20261125120000_agent_external_providers`, có điều kiện vì bảng nằm ngoài Prisma). Tab Cài đặt trên web chỉ đổi `provider`, `model`, `schedule` và ngân sách; `enabled` chỉ đổi bằng `./dxos agent enable|disable`. Hàng `agent = 'cooperative'` giữ ngân sách tháng của HTX trong `monthly_budget`; với `digest`, `schedule` là giờ gửi báo cáo `HH:MM`.


### Telegram base (`platform` schema — `platform/postgres/init/09-telegram.sql`, M2)
Chỉ `telegram_links` và `system_alerts` gắn trigger `dxos_audit_row` (ai liên kết tài khoản nào, cảnh báo hệ thống). Các bảng còn lại là dữ liệu vận hành (mã liên kết, hàng đợi gửi, hội thoại, mã cập nhật, nhịp tim mỗi phút, dấu báo cáo): ghi audit sẽ làm chuỗi băm phình ra mà không thêm thông tin.

- **`platform.telegram_links`**: liên kết Telegram. `kind` ∈ `user|group`; với `user` có `user_id` (Keycloak sub), `user_name`, `role` (lúc liên kết, chỉ dùng để chọn người nhận), `telegram_user_id`; `htx_code`, `chat_id`, `linked_at`, `unlinked_at`. Tối đa một liên kết hoạt động cho mỗi tài khoản Telegram, mỗi người dùng, và mỗi HTX có một nhóm.
- **`platform.telegram_link_codes`**: mã liên kết, chỉ lưu `code_hash` (SHA-256), dùng một lần, hết hạn sau 10 phút.
- **`platform.telegram_outbox`**: hàng đợi tin nhắn cho relay. `op` ∈ `send|edit`, `purpose` ∈ `proposal|result|report|health|reply`, `status` ∈ `pending|leased|sent|failed`, kèm `attempts`, `next_attempt_at`, `lease_until`, `telegram_message_id`, `last_error`. Cột `health_key` (bổ sung ngoài thiết kế ban đầu) giữ khóa để mỗi tình trạng chỉ báo tối đa một lần sau 6 giờ.
- **`platform.telegram_conversations`**: trạng thái chờ lý do từ chối (`telegram_user_id`, `proposal_id`, `expires_at` sau 10 phút).
- **`platform.telegram_updates_seen`**: `update_id` đã xử lý, để bỏ qua cập nhật lặp lại.
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
