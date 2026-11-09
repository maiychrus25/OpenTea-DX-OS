<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tầng 1c: Dữ liệu và sự kiện (MQTT, vòng đời dữ liệu, lineage, LLM nội bộ)

> **Trạng thái:** Chờ duyệt (2026-11-09).
> **Phạm vi:** Giai đoạn 1c của Tầng 1 (milestone `v1.5.0`, issue #11), chi tiết hoá §9 của đặc tả Tầng 1; kèm sửa #15 và #17.
> **Căn cứ:** Đề thi OLP 2026 mục 4, các nguyên lý về vòng đời dữ liệu (nóng → lake), IT/OT (cảm biến → bản sao số), phả hệ và chất lượng dữ liệu; đặc tả `docs/specs/2026-11-08-tier1-core-platform-design.md`.

## 1. Mục tiêu

1. Dữ liệu cảm biến đi vào lõi qua MQTT, có xác thực và cô lập theo từng HTX ngay tại broker.
2. Dữ liệu quá hạn được chuyển từ PostgreSQL sang Parquet trên kho đối tượng, không mất và không đếm đôi, truy vấn được bằng DuckDB.
3. Mỗi lần chuyển dữ liệu để lại bản ghi phả hệ và báo cáo chất lượng.
4. Có LLM nội bộ qua gateway, nội dung prompt không rời mạng nội bộ.
5. Triển khai không còn tải công cụ từ npm (#15), Hasura luôn khởi động sau khi đã có bảng (#17).
6. Giữ nguyên tắc xây theo tầng: **không sửa mã `apps/web`**; chứng minh bằng kiểm thử tự động trong CI.

**Câu chuyện demo:** cảm biến trên các thửa chè → MQTT → dữ liệu nóng → Parquet → truy vấn DuckDB, kèm phả hệ từng file.

## 2. Hiện trạng liên quan

- Thửa đất: `public.parcels` có `parcel_code` duy nhất; thuộc HTX qua `households.htx_profile_id` → `htx_profiles.htx_code`. Các bảng này do Prisma quản lý.
- `dxos-scanner` là khuôn mẫu cho service Python của Tầng 1: Python 3.12, cấu hình qua biến môi trường, healthcheck bằng heartbeat, thư viện `minio` và `psycopg`, kết nối autocommit.
- `audit.record_event(p_source, p_op, p_subject, p_details)` ghi sự kiện vào chuỗi băm của Tầng 1b.
- `ChatbotUseCase` dùng giao thức OpenAI: Groq nếu có khoá, không thì `OLLAMA_BASE_URL/v1`. Volume `ollama_data` đã khai báo trong compose, service `ollama` đang bị comment.
- `migrate` chỉ có trong `docker-compose.release.yml` và chạy `npx prisma@5.22.0`. `make platform-up` khởi động Hasura trước khi có bảng.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định | Lý do |
| --- | --- | --- |
| Nguồn dữ liệu demo | Bộ giả lập, broker vẫn bật xác thực | Không phụ thuộc phần cứng, chạy được trong CI; thiết bị thật không đòi đổi thiết kế |
| Cách dựng luồng | Service Python riêng `dxos-dataops` | Dùng lại khuôn `dxos-scanner`; kiểm thử được; không dồn lõi dữ liệu vào n8n (không phải OSI) |
| Broker | Mosquitto `2.1.2-alpine` (EPL-2.0) | Theo đặc tả Tầng 1 |
| Định dạng lạnh | Parquet nén ZSTD, DuckDB 2.0.0 (MIT) | Định dạng mở, không cần máy chủ truy vấn |
| Client MQTT | `paho-mqtt` 2.2.0 (`EPL-2.0 OR BSD-3-Clause`) | Thư viện chuẩn của Eclipse |
| LLM | Ollama `0.40.15` (MIT), model `qwen2.5:0.5b` (Apache-2.0, 398 MB) | Chạy được bằng CPU; đổi model bằng biến môi trường |
| Gateway LLM | Chỉ mở một endpoint | Ollama có API quản trị (`/api/pull`, `/api/delete`, `/api/create`); thu hẹp so với `/api/ai/llm/*` ở đặc tả Tầng 1 |

## 4. MQTT và dữ liệu nóng

### 4.1. Broker

- Không cho anonymous; không publish cổng ra host, chỉ dùng trong mạng `agrimarket-net`, nên chưa cần TLS (xem §10).
- Tài khoản thiết bị đặt tên theo `htx_code`, lấy từ `DXOS_MQTT_DEVICES` (`TC:matkhau,LB:matkhau`). Tài khoản `dxos-ingest` lấy mật khẩu từ `DXOS_MQTT_INGEST_PASSWORD`. `platform/mosquitto/entrypoint.sh` sinh file mật khẩu lúc khởi động.
- ACL:

```text
pattern write htx/%u/plot/+/+
user dxos-ingest
topic read htx/+/plot/+/+
```

- Bản tin giới hạn 1 KiB. Bật persistence để giữ bản tin QoS 1 khi worker tắt.
- Override release từ chối khởi động nếu mật khẩu rỗng hoặc bắt đầu bằng `change_me` (không phân biệt hoa thường).

### 4.2. Bản tin

- Topic: `htx/<htx_code>/plot/<parcel_code>/<sensor>`.
- Nội dung JSON: `{"ts": "2026-11-09T08:00:00Z", "value": 23.4}`. `ts` là ISO 8601 có múi giờ.

| `sensor` | Đơn vị | Khoảng hợp lệ |
| --- | --- | --- |
| `soil_moisture` | % | 0 đến 100 |
| `soil_temperature` | °C | -10 đến 60 |
| `air_temperature` | °C | -10 đến 55 |
| `air_humidity` | % | 0 đến 100 |
| `rainfall` | mm | 0 đến 500 |

### 4.3. Worker `ingest`

- QoS 1, session bền, client id cố định, ack thủ công (`manual_ack`).
- **Ack sau khi commit.** Lỗi database thì không ack và kết nối lại, broker gửi lại bản tin.
- Kiểm tra theo thứ tự, trả lý do từ chối: `bad_topic`, `bad_json`, `bad_ts`, `future_ts` (quá hiện tại hơn 5 phút), `unknown_sensor`, `out_of_range`, `unknown_parcel` (`parcel_code` không thuộc `htx_code` của topic).
- Bản tin bị từ chối ghi vào `ingest_rejects` rồi vẫn ack, để bản tin hỏng không bị gửi lại mãi.
- Bản tin có `ts` trong quá khứ được chấp nhận, gồm cả dữ liệu cũ hơn hạn lưu nóng.
- shortcut: mỗi bản tin một truy vấn kiểm tra thửa và một lệnh insert, đủ cho quy mô demo; thêm batch khi tải thực vượt khả năng worker.

### 4.4. Lược đồ `telemetry` (`platform/postgres/init/04-telemetry.sql`, idempotent)

| Bảng | Cột chính |
| --- | --- |
| `sensor_readings` | `htx_code`, `parcel_code`, `sensor`, `ts timestamptz`, `value double precision`, `ingested_at`; khoá chính `(htx_code, parcel_code, sensor, ts)`; chỉ mục theo `ts` |
| `ingest_rejects` | `id`, `received_at`, `topic`, `payload` (cắt còn 256 byte), `reason`, `htx_code` (nếu đọc được từ topic) |
| `lifecycle_runs` | Xem §5.3 |

- Bản tin trùng khoá bị bỏ qua (`ON CONFLICT DO NOTHING`), do QoS 1 có thể gửi lại.
- Không có khoá ngoại sang `public.parcels`: dữ liệu cảm biến phải còn khi thửa bị xoá, và không dính vào migration Prisma (#7).
- `sensor_readings` không gắn trigger kiểm toán vì tần suất ghi cao; bản ghi kiểm toán của luồng này nằm ở bước chuyển dữ liệu (§5.3).

### 4.5. Hasura

`sensor_readings` và `lifecycle_runs` chỉ đọc cho `manager`, `officer`, lọc theo claim `htx_code`. `farmer` chưa có quyền (làm ở Tầng 2 khi có màn hình). `ingest_rejects` không mở.

### 4.6. Bộ giả lập

Lệnh `simulate` dùng chung image, chỉ chạy ở profile `demo` (service `dxos-simulator`) và trong smoke. Đọc danh sách thửa của các HTX trong `DXOS_MQTT_DEVICES` từ database, phát số liệu mỗi 60 giây bằng đúng tài khoản thiết bị. Tuỳ chọn `--backfill-days N` tạo dữ liệu cũ một lần rồi thoát.

## 5. Vòng đời dữ liệu và phả hệ

### 5.1. Job `lifecycle`

- Chạy mỗi `DXOS_LIFECYCLE_INTERVAL_SECONDS` (mặc định 3600), hoặc một lần với `--once`.
- Giữ `pg_try_advisory_lock` trong suốt lần chạy; lock đang bị giữ thì bỏ qua, để `--once` không chồng lên tiến trình nền.
- Hạn lưu nóng `DXOS_HOT_RETENTION_DAYS` (mặc định 30).
- Xử lý theo cụm **một `htx_code`, một ngày UTC**, tối đa 100 cụm mỗi lần chạy.
- Không giữ transaction trong lúc xử lý file; chỉ mở transaction ở bước cuối.

### 5.2. Các bước cho mỗi cụm

1. Tạo dòng `running` trong `lifecycle_runs`, ghi trước đường dẫn đích `s3://dxos-lake/telemetry/sensor_readings/htx=<code>/date=<YYYY-MM-DD>/<run_id>.parquet`. Tạo bucket `dxos-lake` nếu chưa có.
2. Đọc các dòng của cụm cùng khoá của chúng.
3. Dùng DuckDB ghi Parquet ZSTD ra file tạm, tính SHA-256.
4. Tải lên bằng thư viện `minio`.
5. Tải về lại, so SHA-256, đọc lại số dòng bằng DuckDB.
6. Trong một transaction: nạp các khoá đã xuất vào bảng tạm, `DELETE ... USING` đúng các khoá đó, kiểm tra số dòng xoá bằng số dòng xuất (lệch thì rollback), cập nhật dòng `lifecycle_runs` thành `done`, gọi `audit.record_event('dxos-lifecycle', 'lake_export', <đường dẫn>, {rows, sha256})`.

### 5.3. `lifecycle_runs`

`id`, `source` (`telemetry.sensor_readings`), `target`, `htx_code`, `partition_date`, `status` (`running`, `done`, `failed`), `row_count`, `min_ts`, `max_ts`, `sha256`, `size_bytes`, `quality jsonb`, `error`, `started_at`, `finished_at`.

Bảng này không phải append-only. Bằng chứng chống sửa nằm ở sự kiện trong chuỗi kiểm toán, lưu `sha256` và số dòng: đối chiếu `lifecycle_runs` với `audit.events` để phát hiện sửa đổi. `verify_chain()` một mình không làm việc đối chiếu này.

### 5.4. Báo cáo chất lượng (`quality`)

Theo từng cụm: số dòng, min/max/trung bình theo `sensor`; số bản tin bị từ chối theo `reason` trong ngày đó của HTX đó. Trong transaction ở bước 6, các dòng `ingest_rejects` của cụm được xoá. Dòng không thuộc cụm nào (không đọc được HTX, hoặc ngày không có dữ liệu hợp lệ) bị xoá khi cũ hơn hai lần hạn lưu nóng.

### 5.5. Xử lý lỗi

| Tình huống | Xử lý |
| --- | --- |
| Lỗi trước bước 6 | Dòng nóng nguyên vẹn; đánh dấu `failed`, xoá file đã tải lên; lần sau thử lại |
| Tiến trình chết giữa chừng | Đầu lần chạy sau, các dòng `running` được xoá file đích và đánh dấu `failed` |
| Bản tin đến muộn | Xoá theo khoá nên dòng mới không bị mất; lần sau tạo file khác trong cùng thư mục ngày |
| Số dòng xoá lệch | Rollback, xoá file đã tải lên, đánh dấu `failed` |
| Một cụm lỗi | Không chặn các cụm khác |

### 5.6. Truy vấn dữ liệu lạnh

`python -m dxos_dataops query "<SQL>"` chạy trong container, với view `sensor_readings_cold` trên các file Parquet (`htx`, `date` lấy từ đường dẫn). Extension `httpfs` cài lúc build image. Nếu `httpfs` không tương thích SeaweedFS, lệnh tải các file vào thư mục tạm rồi đọc, giao diện không đổi. Không mở SQL tuỳ ý qua HTTP.

## 6. LLM nội bộ

- Service `ollama`: không publish cổng, `mem_limit: 2g`, `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_QUEUE=8`.
- `ollama-init` (chạy một lần, profile `tools`, không tự chạy theo `up`): kéo `DXOS_LLM_MODEL` (mặc định `qwen2.5:0.5b`), so mã từ `ollama list` với `DXOS_LLM_MODEL_ID` (mặc định `a8b0c5157701`, xác nhận lại khi triển khai); lệch thì thoát với lỗi. Đổi model phải đổi cả hai biến.
- Route gateway duy nhất: `POST /api/ai/llm/v1/chat/completions` → `/v1/chat/completions`. JWT có audience `dx-os-core` (cấu hình `oidc_aud`), giới hạn 30 yêu cầu/phút, timeout 120 giây.
- Chatbot của `apps/web` không đổi. Khi không có Groq key, app nhận lỗi model không tồn tại thay vì lỗi kết nối; cả hai vào cùng nhánh xử lý lỗi. Chuyển chatbot sang Ollama thuộc Tầng 2.

## 7. Triển khai

### 7.1. #17

`migrate` chuyển vào `docker/docker-compose.yml` (profile `tools`). `make platform-up` chạy: `postgres` → `platform-init` → `migrate` → `platform-init` → các service còn lại → `ollama-init`. Bản phát hành dùng cùng thứ tự.

### 7.2. #15

Image `dxos-migrate`, Dockerfile đặt tại `apps/web/prisma/` để dùng thư mục đó làm build context: cài sẵn `prisma@5.22.0`, chứa schema và migration. Entrypoint dựng `DATABASE_URL` từ `POSTGRES_USER`, `POSTGRES_PASSWORD` (URL-encode) và `POSTGRES_DB`.

### 7.3. Thay đổi khác

- Compose thêm `mosquitto`, `dxos-ingest`, `dxos-lifecycle`, `dxos-simulator` (profile `demo`), `ollama`, `ollama-init`.
- `release.yml`, `docker-publish.yml`, ghi chú phát hành thêm image `dataops` và `migrate` (tổng 6). `docker-compose.release.yml` đổi các service tương ứng sang image GHCR.
- `scripts/package-release.sh` đóng gói `platform/mosquitto`.
- `ci.yml` chạy unit test của `platform/dataops` như scanner.
- README (Tầng 1, thứ tự triển khai), `DEPENDENCIES.md`, `CHANGELOG.md` cập nhật cùng thay đổi.

## 8. Kiểm thử

**Unit (`platform/dataops/tests`):** phân tích topic, kiểm tra bản tin cho từng lý do từ chối; lifecycle lỗi ở từng bước thì không xoá dữ liệu nóng; dọn dòng `running`; số dòng xoá lệch thì rollback; tính `quality`.

**Smoke (`make platform-smoke`):**

| Nhóm | Khẳng định |
| --- | --- |
| MQTT | Anonymous bị từ chối; `TC` ghi vào topic `LB` không tạo dòng; bản tin đúng vào `sensor_readings`; sai thửa vào `ingest_rejects` đúng lý do; bản tin trùng không thêm dòng; tắt worker, phát bản tin, bật lại vẫn nhận được |
| Vòng đời | Backfill rồi `lifecycle --once`: dòng nóng quá hạn biến mất, dòng còn hạn giữ nguyên; `query` đếm đúng số dòng; lineage `done` có `sha256` khớp sự kiện kiểm toán; `audit.verify_chain()` sạch; dòng đến muộn đi vào file khác |
| Hasura | Manager `TC` chỉ thấy dữ liệu `TC`; `farmer` không truy cập được |
| LLM | Không JWT hoặc sai audience bị 401; `/api/ai/llm/api/pull` không tới được Ollama; chat trả nội dung |
| Khởi động | Trên database mới, Hasura phục vụ được mà không cần restart; image migrate URL-encode mật khẩu |

**Chống hồi quy:** 79 khẳng định smoke, 38 test scanner, 7 test realm, 405 test web và toàn bộ job CI hiện có phải xanh.

## 9. Tiêu chí hoàn thành

1. `make platform-up` trên máy sạch dựng đủ Tầng 1; `make platform-smoke` xanh hai lần liên tiếp.
2. CI xanh toàn bộ, Platform Smoke được đo thời gian và ghi lại.
3. Không còn image `latest`; thành phần mới khai trong `DEPENDENCIES.md`.
4. Đóng #11, #15, #17; phát hành `v1.5.0` với 6 image.

## 10. Thứ tự, điểm cắt và ngoài phạm vi

**Thứ tự:** #17 và #15 → MQTT → vòng đời và phả hệ → LLM. Mục tiêu xong trước **16/11**. Nếu trễ, cắt LLM trước vì không thuộc các nguyên lý bắt buộc.

**Ngoài phạm vi:** thiết bị thật và TLS cho MQTT (khi cần: mở cổng 8883 có TLS); OpenBao; che PII; quyền `farmer` trên dữ liệu cảm biến; màn hình hiển thị cảm biến. Ở 1c, nguyên lý bản sao số mới có phần dữ liệu gắn với từng thửa; phần hiển thị thuộc Tầng 2.

**Giới hạn đã biết:**
- `ollama-init` cần mạng ra ngoài một lần để kéo model; digest khoá đúng nội dung. Đóng model vào image sẽ thêm một image nhiều GB nên chưa làm.
- `dxos-dataops` dùng tài khoản database `agrimarket` như `dxos-scanner`; tách vai trò tối thiểu thuộc Tầng 2.
- Model 0.5B có chất lượng tiếng Việt hạn chế; khi demo có thể đổi sang `qwen2.5:1.5b` (Apache-2.0).

## 11. Rủi ro

| Rủi ro | Biện pháp |
| --- | --- |
| DuckDB `httpfs` không tương thích SeaweedFS | Ghi và đọc qua file tạm (§5.6); phần ghi không phụ thuộc `httpfs` |
| `ACL pattern` của Mosquitto 2.1 khác kỳ vọng | Kiểm chứng ở bước đầu bằng khẳng định smoke `TC` ghi vào topic `LB` |
| Ollama làm CI chậm hoặc thiếu RAM | Đo thời gian; thêm cache model nếu đáng kể; cắt LLM nếu không xử lý được trước 16/11 |
| Chuyển `migrate` làm đổi luồng cũ | Smoke trên database mới; giữ thứ tự 5 bước trong README |
