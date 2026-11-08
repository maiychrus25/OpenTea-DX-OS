<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tầng 1b: Zero-Trust tại biên (kiểm dịch file, nhật ký kiểm toán bất biến)

> **Trạng thái:** Bản nháp chờ duyệt — 2026-11-08
> **Phạm vi:** Giai đoạn 1b của Tầng 1 (milestone `v1.4.0`, issue #10). Thu hẹp so với khung trong đặc tả Tầng 1 (§8): chỉ gồm **kiểm dịch file** và **nhật ký kiểm toán bất biến**. OpenBao và che PII được hoãn (ghi ở §9).
> **Căn cứ:** Đề thi OLP 2026 mục 2 ("Trạm kiểm dịch đám mây xử lý an toàn tệp tin", "nhật ký truy vết… kiểm toán hành vi bất biến") và mục 4 nguyên lý (iv) "thực thi kiểm dịch mã độc nghiêm ngặt"; đặc tả `docs/specs/2026-11-08-tier1-core-platform-design.md`.

## 1. Mục tiêu

1. Mọi file **do người dùng tải lên** kho đối tượng được quét mã độc; file nhiễm hoặc không quét được bị **cách ly** tự động.
2. Mọi thay đổi trên các bảng nghiệp vụ chính được ghi vào **nhật ký chỉ-thêm**, có **chuỗi băm** để phát hiện mọi can thiệp, kể cả của superuser.
3. Giữ nguyên tắc xây theo tầng: **không sửa mã `apps/web`**; chứng minh bằng kiểm thử tự động trong CI.

## 2. Hiện trạng liên quan

- Đường file người dùng vào kho: ảnh chẩn đoán bệnh (server gọi `uploadFile`, `application/disease/submit-diagnosis.usecase.ts`) và tài liệu PARA (trình duyệt **PUT trực tiếp** lên S3 bằng presigned URL, `application/document/generate-document-upload-url.usecase.ts`). File do hệ thống sinh (QR, HTML, TXT) cũng đi vào cùng bucket.
- Bucket: cả hai adapter đọc `MINIO_BUCKET_NAME` (env mẫu: `agrimarket-docs`; giá trị dự phòng trong mã: `agrimarket-private`).
- CSDL chưa có bảng hay trigger kiểm toán nào. Prisma quản lý schema `public`; n8n dùng schema `n8n`.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định |
| --- | --- |
| Cơ chế phát hiện file mới | **Quét định kỳ qua API S3** (mỗi 5 giây), nhận diện file đã quét bằng `(bucket, key, etag)` — không phụ thuộc tính năng riêng của SeaweedFS |
| Bộ quét | ClamAV `clamd` — image `clamav/clamav-debian:1.4.6` (GPL-2.0, đa kiến trúc amd64/arm64, có sẵn CSDL chữ ký), chạy qua mạng, không liên kết mã |
| Dịch vụ của đội | `dxos-scanner` — Python 3.12 (`python:3.12.15-slim-bookworm`), mã trong `platform/scanner/`, build từ mã nguồn |
| Chính sách | Fail-closed theo **từng file** (nhiễm hoặc không quét được → cách ly); lỗi **hạ tầng** (clamd/S3/CSDL không phản hồi) → chỉ thử lại, không cách ly |
| Nhật ký | Schema `audit` trong CSDL `agrimarket`, trigger PostgreSQL, chuỗi SHA-256 (`sha256()` có sẵn), không thêm extension |

## 4. Kiểm dịch file

### 4.1. Thành phần

- **`clamav`**: `clamav/clamav-debian:1.4.6`; không mở cổng host; volume `clamav_db` cho CSDL chữ ký; healthcheck sẵn có của image (`clamdcheck`); `StreamMaxLength` nâng lên `50M`.
- **`dxos-scanner`**: phụ thuộc `minio` (S3, Apache-2.0) và `psycopg` (PostgreSQL, LGPL-3.0) — ghim phiên bản ổn định mới nhất tại thời điểm triển khai trong `requirements.txt` và khai báo trong `DEPENDENCIES.md`. Giao thức `clamd INSTREAM` do đội tự cài (không thêm thư viện).
- Biến môi trường: `DXOS_SCAN_BUCKETS` (danh sách phân tách bằng dấu phẩy, mặc định `agrimarket-docs,agrimarket-private`; bucket chưa tồn tại thì bỏ qua), `DXOS_QUARANTINE_BUCKET` (mặc định `dxos-quarantine`, tự tạo nếu thiếu), `DXOS_SCAN_INTERVAL_SECONDS` (mặc định `5`), thông tin S3 từ `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, kết nối CSDL từ biến hiện có.

### 4.2. Vòng quét

Mỗi vòng, với mỗi bucket theo dõi:
1. Liệt kê toàn bộ object (đệ quy).
2. Bỏ qua object có `(bucket, key, etag)` đã nằm trong `audit.file_scans`.
3. Đọc object dạng luồng, gửi `clamd` bằng `INSTREAM` (khối 64 KiB).
4. Phản hồi:
   - `stream: OK` → ghi `file_scans` với `status = clean`.
   - `stream: <signature> FOUND` → **cách ly** với `status = infected`, `signature = <signature>`.
   - `INSTREAM size limit exceeded` hoặc `… ERROR` cho riêng file đó → **cách ly** với `status = unscannable`.
5. Cách ly = chép sang `dxos-quarantine/<bucket>/<key>` → **chỉ khi chép thành công** mới xoá bản gốc → ghi `file_scans` và gọi `audit.record_event('scanner', 'QUARANTINE', '<bucket>/<key>', {...})`.

Quy mô mục tiêu: vài nghìn object (liệt kê toàn bộ mỗi vòng là chấp nhận được; tối ưu bằng sự kiện để sau khi có trục sự kiện ở 1c).

### 4.3. Xử lý lỗi

| Tình huống | Hành vi |
| --- | --- |
| `clamd` không phản hồi / S3 không phản hồi | Ghi log cảnh báo, sang vòng sau; không ghi `file_scans`, không cách ly |
| CSDL không phản hồi khi ghi kết quả | Không xoá/chép; vòng sau quét lại (kết quả chỉ coi là xong khi đã ghi) |
| Chép sang quarantine lỗi | Giữ nguyên bản gốc, ghi log, thử lại vòng sau |
| `SIGTERM` | Hoàn tất file đang xử lý rồi thoát |
| Sức khoẻ tiến trình | Healthcheck dựa trên file heartbeat cập nhật sau mỗi vòng (quá 3 vòng không cập nhật → unhealthy) |

### 4.4. Ảnh hưởng

- File bị cách ly trả `404` cho ứng dụng; hiển thị trạng thái quét cho người dùng thuộc Tầng 2.
- Khoảng thời gian file nằm trong kho trước khi được quét (tối đa ~một vòng) được ghi lại (`uploaded_at` lấy từ `LastModified`, `scanned_at`) — giới hạn được chấp nhận vì trình duyệt PUT trực tiếp lên S3.

## 5. Nhật ký kiểm toán bất biến

### 5.1. Lược đồ (schema `audit`)

- `audit.events`: `id bigserial primary key`, `occurred_at timestamptz not null default now()`, `source text not null` (`db` | `scanner`), `table_name text`, `op text not null` (`INSERT` | `UPDATE` | `DELETE` | `QUARANTINE`), `row_id text`, `actor text not null`, `old_data jsonb`, `new_data jsonb`, `prev_hash bytea not null`, `hash bytea not null unique`.
- `audit.file_scans`: `bucket text`, `key text`, `etag text`, `status text` (`clean` | `infected` | `unscannable`), `signature text`, `size_bytes bigint`, `uploaded_at timestamptz`, `scanned_at timestamptz default now()`, khoá chính `(bucket, key, etag)`.

### 5.2. Chuỗi băm

- `hash = sha256(prev_hash || convert_to(<chuỗi chuẩn hoá>, 'UTF8'))`; chuỗi chuẩn hoá ghép `id`, `occurred_at` (UTC, ISO 8601), `source`, `table_name`, `op`, `row_id`, `actor`, `old_data::text`, `new_data::text` theo thứ tự cố định, phân tách bằng ký tự `U+001F`.
- Bản ghi đầu chuỗi dùng `prev_hash = '\x00' × 32`.
- Thêm bản ghi qua một hàm duy nhất (`audit.append_event(...)`) giữ `pg_advisory_xact_lock` khi đọc hash cuối và cấp `id`, để thứ tự chuỗi trùng thứ tự `id` dưới giao dịch đồng thời.
- `audit.verify_chain()` trả về `(checked bigint, first_bad_id bigint)`; `first_bad_id` là `NULL` khi chuỗi toàn vẹn.

### 5.3. Ghi tự động

- Trigger `AFTER INSERT OR UPDATE OR DELETE … FOR EACH ROW` trên 9 bảng: `htx_profiles`, `households`, `parcels`, `parcel_crop_cycles`, `journal_entries`, `journal_activities`, `lots`, `lot_parcels`, `disease_reports`.
- `actor = coalesce(nullif(current_setting('dxos.actor', true), ''), session_user)`; `row_id` = cột `id` của dòng.
- Không ghi: dữ liệu tham chiếu và khối lượng lớn (`market_data`, `bulletins`, `fx_rates`, `weather_cache`, `notifications`, `chat_history`, `partners`).
- `audit.record_event(source, op, subject, details jsonb)` cho nguồn ngoài CSDL (scanner).

### 5.4. Chống sửa xoá

1. Trigger `BEFORE UPDATE OR DELETE` (theo dòng) và `BEFORE TRUNCATE` (theo câu lệnh) trên `audit.events` báo lỗi `audit.events is append-only`.
2. Vì superuser có thể tắt trigger, toàn vẹn được bảo đảm bằng **phát hiện**: `audit.verify_chain()` phát hiện mọi bản ghi bị sửa, xoá giữa chuỗi hoặc chèn sai thứ tự.

### 5.5. Cài đặt và thứ tự

- Schema, bảng, hàm: trong `platform/postgres/init/` (volume mới) và qua `platform-init` (idempotent) cho volume đã có.
- Trigger trên bảng `public` chỉ được gắn khi bảng tồn tại (`to_regclass`), dùng `CREATE OR REPLACE TRIGGER` (idempotent). Vì bảng do migration Prisma tạo, **thứ tự triển khai** trở thành: `postgres` → `platform-init` → `migrate` → **`platform-init` (gắn trigger)** → các dịch vụ còn lại. README, `make platform-up`/smoke và release override cập nhật tương ứng.
- Không expose qua Hasura ở 1b (dữ liệu nhiều HTX; cần thiết kế quyền ở Tầng 2).

## 6. Kiểm thử

1. **Unit test scanner** (`pytest`, không cần Docker): phân tích phản hồi `clamd` (`OK`, `FOUND`, `ERROR`, quá cỡ) và hàm quyết định (`clean` / `quarantine` / `retry`).
2. **Smoke `[quarantine]`**: tải lên `agrimarket-docs` chuỗi kiểm thử chuẩn **EICAR** (chuỗi được ghép lúc chạy từ nhiều phần, không lưu nguyên văn trong repo để tránh bị trình quét mã độc của máy dev/GitHub gắn cờ) → trong ≤ 30 giây object biến mất khỏi bucket, có trong `dxos-quarantine`, `file_scans.status = 'infected'`, có sự kiện `QUARANTINE` trong `audit.events`; tải lên file sạch → còn nguyên, `status = 'clean'`.
3. **Smoke `[audit]`**:
   - chèn rồi sửa một nông hộ của fixture qua `psql` → có `INSERT` và `UPDATE` cho đúng `row_id`, `verify_chain()` trả `first_bad_id IS NULL`;
   - `UPDATE audit.events …` và `DELETE FROM audit.events …` bị từ chối với thông báo `append-only`;
   - mô phỏng can thiệp superuser **trong `BEGIN … ROLLBACK`**: tắt trigger chặn, sửa một bản ghi, `verify_chain()` trả đúng `id` đó, rồi rollback (chuỗi thật không đổi, smoke chạy lặp được);
   - chạy `platform-init` hai lần → mỗi bảng chỉ có một trigger kiểm toán.
4. **Chống hồi quy**: 9 job CI hiện có giữ nguyên và xanh; smoke hiện có giữ nguyên; đo lại thời gian job `platform-smoke` (giới hạn 30 phút).

## 7. Phát hành

- Ghim `clamav/clamav-debian:1.4.6`; image `dxos-scanner` được đăng lên GHCR như `postgres` (ma trận `release.yml` / `docker-publish.yml`, ngữ cảnh `./platform/scanner`); release override trỏ `dxos-scanner` tới image GHCR, không build.
- Thứ tự triển khai mới (§5.5) trong README và chú thích release override.
- `DEPENDENCIES.md`, `CHANGELOG.md` (`[Unreleased]`) cập nhật; phát hành `v1.4.0`.

## 8. Tiêu chí hoàn thành

1. `make platform-smoke` xanh, gồm `[quarantine]` và `[audit]`; unit test scanner xanh.
2. 10 job CI (9 cũ + Platform Smoke) xanh.
3. Không có image `latest`; phụ thuộc mới được ghim và khai báo.
4. README, CHANGELOG, DEPENDENCIES cập nhật; phát hành `v1.4.0`.

## 9. Hoãn / ngoài phạm vi

- OpenBao quản lý secret; che PII theo vai trò (để sau, theo thời gian còn lại).
- Quét đồng bộ tại gateway (cần upload đi qua gateway — Tầng 2, xem #12).
- Gắn người thực hiện thật vào `actor` (ứng dụng đặt `dxos.actor`) và hiển thị trạng thái quét — Tầng 2.
- Lưu trữ dài hạn nhật ký sang hồ dữ liệu — giai đoạn 1c.
