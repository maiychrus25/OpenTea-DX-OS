# Đặc tả thiết kế — Tầng 1: Nền tảng Dịch vụ Lõi (DX-OS Open-Core)

> **Trạng thái:** Đã duyệt — giai đoạn 1a đã triển khai trên nhánh feat/tier1a-core-services (2026-11-08)
> **Phạm vi:** Toàn bộ Tầng 1 của OpenTea DX-OS. Giai đoạn **1a** đặc tả chi tiết; **1b**, **1c** ở mức khung và sẽ được chi tiết hoá trước khi triển khai.
> **Căn cứ:** Đề thi OLP 2026 "Xây dựng Hệ điều hành Chuyển đổi số bằng Công nghệ Lõi nguồn mở (DX-OS Open-Core)", mục 2–4; kế hoạch dự thi ngày 2026-11-06.

## 1. Bối cảnh và mục tiêu

Đề thi bắt buộc một **nền tảng dịch vụ lõi chạy ngầm (headless)** ở Tầng 1, *"hoàn toàn không cung cấp giao diện UI mà chỉ hoạt động như một PaaS"*, cung cấp tối thiểu 4 dịch vụ: **Định danh/SSO**, **API Gateway**, **Quản trị dữ liệu có cấu trúc và phi cấu trúc**, **Workflow**.

Hiện trạng repo: Keycloak, PostgreSQL, MinIO (image đã bị gỡ khỏi Docker Hub), n8n đã chạy nhưng **chưa có API Gateway**, logic dữ liệu nằm trong 50 API route của ứng dụng Next.js (Tầng 2), không có API dữ liệu tự sinh, không có phân quyền cấp dòng và ứng dụng chỉ phục vụ một HTX (`prisma.htxProfile.findFirst()`).

**Mục tiêu:** hoàn thiện Tầng 1 thành một nền tảng lõi headless, tổng quát (dùng lại được cho tổ chức khác ngoài HTX chè), được chứng minh bằng kiểm thử tự động — trước khi chuyển sang Tầng 2.

**Nguyên tắc xây theo tầng:** Tầng 1 không thay đổi mã của ứng dụng Next.js. Việc ứng dụng Tầng 2 chuyển sang gọi lõi qua gateway thuộc đặc tả Tầng 2.

## 2. Quyết định đã chốt

| Chủ đề | Quyết định | Ghi chú |
| --- | --- | --- |
| Giấy phép dự án | MIT | OSI; file mới dùng header SPDX `MIT` |
| API Gateway | Apache APISIX (Apache-2.0), chế độ standalone, cấu hình YAML khai báo | Không cần etcd; cấu hình nằm trong git (GitOps) |
| API dữ liệu tự sinh | Hasura GraphQL Engine v2 CE (Apache-2.0) | Chỉ đọc ở Tầng 1 |
| Định danh | Keycloak (Apache-2.0) | Bổ sung MFA, audience, claim `htx_code` |
| CSDL | PostgreSQL 16 + PostGIS + pgvector | Một CSDL cho nghiệp vụ, bản đồ, vector |
| Dữ liệu phi cấu trúc | SeaweedFS (Apache-2.0), API S3 | Thay MinIO: image community `minio/minio` đã bị gỡ khỏi Docker Hub (HTTP 404, kiểm tra 2026-11-08), không dựng được trên máy sạch |
| Workflow | n8n, ghim phiên bản | Sustainable Use License (không phải OSI) — quyết định của chủ dự án; ghi rõ trong ADR và THIRD_PARTY_LICENSES, có lối thoát sang Kestra |
| Frontend Tầng 2 | Giữ Next.js | Ngoài phạm vi đặc tả này |

## 3. Kiến trúc Tầng 1

```text
           Tầng 2 / Tầng 3 (ứng dụng, CLI, kiểm thử)
                          │  Bearer JWT do Keycloak cấp
┌─────────────────────────▼──────────── Tầng 1 (headless) ───────────────────────────┐
│ APISIX :9080                                                                        │
│   /api/data/graphql   → Hasura :8080        (JWT bắt buộc)  → PostgreSQL            │
│   /api/workflow/*     → n8n :5678/webhook/* (JWT bắt buộc)                          │
│   /api/ai/disease/*   → disease-api :8000   (JWT bắt buộc)                          │
│   /storage/*          → SeaweedFS S3 :9000  (presigned URL, S3 tự kiểm chữ ký)      │
│ Keycloak :8080 (SSO + MFA) — giữ truy cập trực tiếp ở giai đoạn 1a (mục 7)          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Cấu trúc thư mục mới

```text
platform/
├── gateway/
│   ├── config.yaml          # APISIX: deployment.role=data_plane, config_provider=yaml
│   └── apisix.yaml          # routes, upstreams, plugins (khai báo), kết thúc bằng #END
├── hasura/
│   └── metadata/            # tables, relationships, select permissions (định dạng metadata v3)
├── postgres/
│   ├── Dockerfile           # FROM postgis/postgis:16-3.5 + gói postgresql-16-pgvector
│   └── init/01-extensions.sql
├── keycloak/                # tài liệu và script cấu hình bổ sung cho realm (nếu cần)
└── tests/
    ├── fixtures/two-htx.sql # dữ liệu kiểm thử: HTX Tân Cương (TC), La Bằng (LB)
    └── smoke-platform.sh    # kiểm thử tự động Tầng 1
docs/adr/0001-n8n-workflow-engine.md
```

Các service mới (`apisix`, `hasura`, `platform-init`) được thêm vào `docker/docker-compose.yml` hiện có, nối vào mạng `agrimarket-net`. Không di chuyển service hiện có để tránh đổi đường dẫn của gói phát hành.

## 4. Giai đoạn 1a — 4 dịch vụ bắt buộc (chi tiết)

### 4.1. Định danh (Keycloak)

- **Claim tổ chức:** user `manager`/`officer` có thuộc tính `htx_code` (ví dụ `TC`, khớp `htx_profiles.htx_code`). Mapper *User Attribute* trên client `nextjs-web` đưa vào access token claim `htx_code`. Dùng `htx_code` vì là khoá duy nhất, ổn định và khai báo được trong file realm (khác `id` cuid sinh ngẫu nhiên).
- **Audience:** mapper *Audience* thêm `dx-os-core` vào access token của `nextjs-web`.
- **MFA:** TOTP (6 số, 30 giây). User mẫu `manager1`, `officer1` có required action `CONFIGURE_TOTP`; luồng `browser` mặc định đã yêu cầu OTP khi user đã cấu hình. User được mời qua `invite-member` với vai trò manager/officer cũng nhận required action này — *thay đổi đó nằm trong mã Tầng 2 và được thực hiện ở đặc tả Tầng 2*. Farmer: tuỳ chọn.
- **Zero-Trust:** tắt `directAccessGrantsEnabled` trên `nextjs-web` sau khi xác nhận ứng dụng không dùng password grant.
- **Thay đổi realm:** sửa trực tiếp `docker/keycloak/realm-agrimarket.json`. Lưu ý: `--import-realm` không ghi đè realm đã tồn tại → môi trường dev đang chạy phải xoá realm hoặc volume để nhận cấu hình mới (ghi trong hướng dẫn).

### 4.2. API Gateway (APISIX)

- Image: `apache/apisix:3.19.0-debian` (đã xác minh tồn tại 2026-11-08).
- Plugin toàn cục: `request-id` (header `X-Request-Id`), `limit-count` (giới hạn theo IP), `cors` (origin cấu hình qua biến môi trường).
- Route có `openid-connect` với `bearer_only: true`, `use_jwks: true`, `discovery` trỏ tới Keycloak nội bộ: kiểm **chữ ký, hạn và issuer**. **Audience** `dx-os-core` được kiểm tại Hasura (mục 4.3); với route n8n và disease-api, kiểm audience bằng `claim_validator` nếu phiên bản APISIX hỗ trợ, nếu không thì ghi nhận là giới hạn đã biết.
- Không có token / token sai → `401` tại gateway; upstream lỗi → `502`/`503` kèm `X-Request-Id`.
- Cổng: `9080` (HTTP). TLS kết thúc ở reverse proxy/VPS — ngoài phạm vi 1a.

### 4.3. Dữ liệu có cấu trúc (PostgreSQL + Hasura)

- **PostgreSQL:** image tự build `platform/postgres` từ `postgis/postgis:16-3.5` (Debian) + `postgresql-16-pgvector`. Extension `postgis`, `vector` được tạo bởi `init/01-extensions.sql` (volume mới) và bởi service một-lần `platform-init` (`CREATE EXTENSION IF NOT EXISTS`, idempotent) cho volume đang có.
  - **Rủi ro collation:** chuyển từ `postgres:16-alpine` (musl) sang Debian (glibc) có thể làm lệch thứ tự sắp xếp text trên volume cũ. Hướng dẫn: với dev, khuyến nghị tạo lại volume; nếu giữ dữ liệu thì chạy `REINDEX DATABASE agrimarket;`. CI luôn dùng volume mới.
- **Hasura:** image `hasura/graphql-engine:v2.51.4.cli-migrations-v3`, tự áp metadata từ `platform/hasura/metadata` khi khởi động.
  - Metadata lưu trong schema `hdb_catalog` của CSDL `agrimarket` (Prisma chỉ quản lý schema `public`, không xung đột).
  - `HASURA_GRAPHQL_ENABLE_CONSOLE=false` (headless), `HASURA_GRAPHQL_DEV_MODE=false`, `HASURA_GRAPHQL_ADMIN_SECRET` bắt buộc (lấy từ `.env.local`), không đặt `UNAUTHORIZED_ROLE` (người chưa xác thực không có quyền).
  - **Prisma vẫn sở hữu schema và migration.** Hasura chỉ track bảng; không dùng Hasura migrations.
  - **JWT:** `jwk_url` = JWKS nội bộ của Keycloak; `issuer` = issuer công khai hiện tại (`http://localhost:8080/realms/agrimarket`, cấu hình qua biến môi trường); `audience` = `dx-os-core`; `claims_map`:

    | Claim Hasura | Nguồn trong token | Mặc định |
    | --- | --- | --- |
    | `x-hasura-user-id` | `$.sub` | — |
    | `x-hasura-allowed-roles` | `$.realm_access.roles` | — |
    | `x-hasura-default-role` | — | `farmer` (ít quyền nhất) |
    | `x-hasura-htx-code` | `$.htx_code` | chuỗi rỗng → không thấy dữ liệu tổ chức |

  - **Quyền đọc (RLS)** — mọi vai trò chỉ có `select`; không có `insert/update/delete`:

    | Bảng | manager / officer | farmer |
    | --- | --- | --- |
    | `htx_profiles` | `htx_code = X-Hasura-Htx-Code` | tồn tại `households` của chính mình thuộc HTX |
    | `households` | `htx_profile.htx_code = X-Hasura-Htx-Code` | `keycloak_user_id = X-Hasura-User-Id` |
    | `parcels`, `parcel_crop_cycles`, `journal_entries`, `journal_activities`, `disease_reports`, `weather_cache` | theo quan hệ tới `households` thuộc HTX | theo quan hệ tới `households` của chính mình |
    | `lots` | `htx_profile.htx_code = X-Hasura-Htx-Code` | tồn tại `lot_parcels.parcel.household` của chính mình |
    | `lot_parcels` | theo `lot` | theo `parcel.household` |
    | `notifications` | `recipient_id = X-Hasura-User-Id` | như bên trái |
    | `chat_history` | `user_id = X-Hasura-User-Id` | như bên trái |
    | `market_data`, `bulletins`, `fx_rates` | đọc tất cả | đọc tất cả |

    Không expose: `partners` (chưa có cột tổ chức), các bảng hệ thống của Prisma.

### 4.4. Dữ liệu phi cấu trúc (SeaweedFS)

- Service `seaweedfs` dùng image `chrislusf/seaweedfs:4.50` (trùng digest `latest`, phát hành 2026-10-25), chạy `weed server` với S3 API ở **cổng 9000** và **alias mạng `minio`**, để ứng dụng Tầng 2 (adapter S3 đang cố định `port: 9000`, host mặc định `minio`) và các workflow n8n chạy **không cần sửa mã**.
- Danh tính S3 sinh từ biến môi trường hiện có `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` (giữ tên biến để không đổi cấu hình Tầng 2).
- Dữ liệu trong volume MinIO cũ không được chuyển tự động (chỉ là dữ liệu dev); bucket được ứng dụng tự tạo (`makeBucket`) như hiện tại.
- Route `/storage/*` qua APISIX chỉ chuyển tiếp presigned URL (S3 tự kiểm chữ ký SigV4). Không còn MinIO Console `:9001`.
- `scripts/smoke-test.sh` đổi kiểm tra sức khoẻ MinIO sang SeaweedFS.

### 4.5. Workflow (n8n)

- Ghim `n8nio/n8n:2.47.2` (≥ `latest` hiện tại; n8n không hỗ trợ hạ phiên bản CSDL).
- Route `/api/workflow/*` → `n8n:5678/webhook/*`, bắt buộc JWT. Giao diện editor n8n không đi qua gateway.
- `docs/adr/0001-n8n-workflow-engine.md`: lý do chọn n8n (có trong giải pháp tham chiếu của đề, 10 workflow đang chạy), giấy phép Sustainable Use License, ranh giới (chạy độc lập qua HTTP, không nhúng mã), lối thoát sang Kestra.

### 4.6. Vận hành

- `Makefile` ở gốc: `make platform-up`, `make platform-smoke`, `make up`, `make down`, `make build`, `make test`, `make lint` (bọc các lệnh hiện có: `docker compose build`, Jest, `npm run lint`, `actionlint`).
- Ghim mọi image còn dùng `latest` trong compose theo nguyên tắc "tag mới nhất ≥ phiên bản `latest` hiện tại" để chỉ nâng cấp, không hạ phiên bản dữ liệu: `n8nio/n8n:2.47.2`, `rhasspy/wyoming-piper:2.5.2` (trùng digest `latest`), `mattermost/mattermost-team-edition:12.1.0`.
- File mới có header SPDX (`SPDX-License-Identifier: MIT`, `SPDX-FileCopyrightText: 2026 OpenTea Developers`).

## 5. Xử lý lỗi

| Tình huống | Hành vi mong đợi |
| --- | --- |
| Thiếu token, token hết hạn, sai chữ ký hoặc issuer | `401` tại APISIX, request không tới upstream |
| Token không có audience `dx-os-core` | Hasura từ chối (`invalid-jwt`) |
| Truy vấn bảng/cột không có quyền | Lỗi GraphQL `field not found`/`permission`, không lộ schema |
| Mutation bất kỳ | Bị từ chối với mọi vai trò |
| `x-hasura-role` không thuộc `allowed-roles` | Hasura từ chối |
| Upstream không phản hồi | `502`/`503` kèm `X-Request-Id` |
| Keycloak chưa sẵn sàng khi APISIX/Hasura khởi động | `depends_on` + healthcheck; JWKS được tải lại khi có request |

## 6. Kiểm thử

**Job CI mới "Platform Smoke"** (thêm vào `ci.yml`, không sửa 8 job hiện có): dựng `postgres keycloak hasura apisix platform-init` bằng volume mới, chạy `npx prisma migrate deploy`, nạp `platform/tests/fixtures/two-htx.sql`, rồi chạy `platform/tests/smoke-platform.sh`.

Script dùng Keycloak Admin API (thông tin admin từ biến môi trường CI) để tạo user kiểm thử tạm thời `manager_tc` (`htx_code=TC`), `manager_lb` (`htx_code=LB`), `farmer_tc` (gắn `households.keycloak_user_id`), lấy token qua một client kiểm thử chỉ tồn tại trong CI, rồi khẳng định:

1. Không có token → `401` cho `/api/data/graphql`, `/api/workflow/*`, `/api/ai/disease/*`.
2. `manager_tc` chỉ thấy nông hộ của TC; `manager_lb` không thấy bản ghi nào của TC.
3. `farmer_tc` chỉ thấy nông hộ, thửa và lô của chính mình.
4. Mọi mutation bị từ chối.
5. `manager_tc` gửi `x-hasura-role: farmer` → không thấy dữ liệu tổ chức.
6. Token thiếu audience `dx-os-core` → bị từ chối.

**Chống hồi quy:** 8 job CI hiện có giữ nguyên và phải xanh; ứng dụng vẫn chạy ở `:3000`, mọi chức năng dùng Prisma như cũ; e2e không đăng nhập Keycloak nên MFA không ảnh hưởng.

## 7. Phát hành

- Gói triển khai bổ sung thư mục `platform/` (config gateway, metadata Hasura, Dockerfile postgres, script kiểm thử).
- `docker/docker-compose.release.yml`: đóng cổng host của `postgres`, `n8n`, `seaweedfs`, `piper` (`ports: !reset []`); chỉ mở `apisix:9080`, `web:3000` và **tạm giữ** `keycloak:8080` vì trình duyệt cần truy cập trực tiếp để đăng nhập cho tới khi Keycloak được đặt sau gateway (đổi issuer — làm cùng đợt triển khai VPS).
- Thêm service một-lần `migrate` (profile `tools`) chạy `prisma migrate deploy` bên trong mạng nội bộ; README chuyển bước migration sang `docker compose run --rm migrate`.
- Image mới (`apisix`, `hasura`) và image `platform/postgres` được ghim phiên bản; `platform/postgres` build từ mã nguồn trong repo.

## 8. Giai đoạn 1b — Zero-Trust tại biên (khung)

- **ClamAV** (GPL-2.0, chạy qua mạng): quét file trước khi ghi vào kho đối tượng; file nhiễm bị từ chối và ghi nhật ký.
- **OpenBao** (MPL-2.0): quản lý secret của các service lõi thay cho giá trị trong `.env`.
- **Nhật ký kiểm toán bất biến:** bảng append-only (trigger chặn `UPDATE/DELETE`) ghi thay đổi trên các bảng nghiệp vụ chính, có `request_id`, `actor`, thời điểm.
- **Che PII:** quyền cột Hasura ẩn số điện thoại/địa chỉ với vai trò không cần thiết.

## 9. Giai đoạn 1c — Dữ liệu và sự kiện (khung)

- **Mosquitto** (EPL-2.0): broker MQTT nhận dữ liệu cảm biến; topic theo `htx/<code>/plot/<id>/<sensor>`.
- **Vòng đời dữ liệu:** job định kỳ chuyển dữ liệu quá N ngày sang Parquet trên kho đối tượng S3 (SeaweedFS), truy vấn bằng DuckDB; mỗi lần chạy ghi bản ghi phả hệ (nguồn → đích, số bản ghi, checksum) và báo cáo chất lượng.
- **Ollama** (MIT) + model giấy phép mở: route `/api/ai/llm/*` qua gateway, không gửi dữ liệu ra ngoài.

## 10. Ngoài phạm vi Tầng 1

- Mọi thay đổi trong `apps/web` (lưu `access_token`, gọi lõi qua gateway, đa thuê ước trong ứng dụng, MFA cho user được mời) → Tầng 2.
- Chuyển nghiệp vụ và dữ liệu mẫu sang chè → Tầng 2.
- App Manifest, `dxos` CLI, mini-app → Tầng 3.
- Đặt Keycloak sau gateway, TLS, VPS → đợt triển khai.

## 11. Rủi ro

| Rủi ro | Biện pháp |
| --- | --- |
| Tài liệu discovery của Keycloak trả `jwks_uri` theo `KC_HOSTNAME_URL` (`localhost`) mà APISIX không gọi được | Kiểm chứng ở bước đầu; xử lý bằng `KC_HOSTNAME_STRICT_BACKCHANNEL=false` hoặc cấu hình JWKS tĩnh |
| Đổi image PostgreSQL làm lệch collation volume dev | Hướng dẫn tạo lại volume / `REINDEX` |
| Realm đã tồn tại không nhận cấu hình mới | Hướng dẫn xoá realm/volume Keycloak dev |
| Hạ phiên bản n8n/Mattermost khi ghim | Ghim tag mới nhất ≥ `latest` hiện tại |
| Tương thích S3 của SeaweedFS với thư viện `minio` (presigned PUT/GET, `bucketExists`, `makeBucket`) | Kiểm thử tự động trong smoke Tầng 1 bằng chính các thao tác này |
| Tầng 1 kéo dài quá 16/11 | 1a là mốc bắt buộc; 1b/1c cắt theo thứ tự: OpenBao → che PII → lifecycle |

## 12. Tiêu chí hoàn thành giai đoạn 1a

1. `make platform-up` trên máy sạch dựng đủ Tầng 1; `make platform-smoke` xanh cả 6 khẳng định ở mục 6.
2. Job CI "Platform Smoke" xanh; 8 job CI hiện có vẫn xanh.
3. Không còn image `latest` trong compose; image mới được ghim.
4. ADR n8n được viết; README cập nhật cách chạy Tầng 1 và cổng gateway.
5. Phát hành `v1.3.0` qua pipeline Release hiện có.

## Ghi chú sau triển khai 1a

Các điểm triển khai khác với nội dung đặc tả ở trên:

- **Postgres:** dùng `postgres:16.14-bookworm` cộng PostGIS 3.7.0 và pgvector (PGDG) thay cho `postgis/postgis:16-3.5` (hết hỗ trợ, chỉ có amd64). Image được dựng sẵn và đăng lên GHCR (`opentea-dx-os-postgres`).
- **Workflow n8n:** 12 workflow (không phải 10); danh sách thành phần bên thứ ba nằm ở `DEPENDENCIES.md`. n8n dùng schema Postgres riêng `n8n`.
- **Vai trò mặc định Hasura:** vai trò mặc định là `farmer`; nhân viên (manager/officer) phải gửi header `x-hasura-role`.
- **SeaweedFS:** cổng S3 9000 vẫn mở ra host trong bản phát hành vì trình duyệt dùng presigned URL; route `/storage/*` của gateway chưa xác thực được SigV4 (hạn chế, chờ Tầng 2).
- **Audience:** `/api/workflow/*` và `/api/ai/disease/*` kiểm tra audience `dx-os-core` tại gateway bằng `claim_schema` của plugin `openid-connect` (APISIX 3.19; `claim_validator.audience` chỉ so với `client_id` nên không dùng được). Hasura tự kiểm tra audience cho route dữ liệu.
- **Admin secret:** gateway gỡ header `x-hasura-admin-secret` do client gửi (nếu không, người dùng đã xác thực có thể leo thang thành admin Hasura); override release từ chối khởi động Hasura với secret placeholder.
