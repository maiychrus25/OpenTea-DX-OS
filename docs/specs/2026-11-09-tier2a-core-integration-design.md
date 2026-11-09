<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tầng 2a: Nối ứng dụng vào lõi (định danh, đa thuê bao, đọc qua gateway)

> **Trạng thái:** Đợt 2a đã triển khai trên nhánh `feat/tier2a-core-integration` (2026-11-09), chưa phát hành; thân tài liệu giữ nguyên bản thiết kế, xem "Ghi chú sau triển khai 2a" ở cuối.
> **Phạm vi:** Đợt 2a của Tầng 2 (milestone `v1.6.0`), gồm issue #7 và #18. Đợt 2b (chuyển sang HTX chè, #19) có đặc tả riêng.
> **Căn cứ:** Đề thi OLP 2026 mục 2 và 4 (ứng dụng Tầng 2 tiêu thụ nền tảng lõi); đặc tả `docs/specs/2026-11-08-tier1-core-platform-design.md` §10.

## 1. Mục tiêu

1. Ứng dụng gọi lõi bằng danh tính của người dùng, qua API Gateway.
2. Mỗi người dùng chỉ thấy và chỉ sửa được dữ liệu của HTX mình.
3. Database tạo bằng `prisma migrate deploy` khớp hoàn toàn với `schema.prisma`, không làm mất dữ liệu đang có (#7).
4. Toàn bộ chức năng đang chạy được giữ nguyên.

## 2. Hiện trạng liên quan

- `src/auth.ts` dùng next-auth v5 với Keycloak, phiên JWT 8 giờ, chỉ giữ `idToken`, `sub`, `role`; `access_token` bị bỏ đi.
- Realm đã cấp sẵn cho client `nextjs-web` audience `dx-os-core` và claim `htx_code` (client scope mặc định `dx-os-core`). Token mặc định sống 5 phút, phiên SSO mặc định hết sau 30 phút không hoạt động.
- Tài khoản tạo qua `keycloak-admin.adapter.ts` chỉ có thuộc tính `htxId`, không có `htx_code`. Tài khoản mẫu `farmer1` cũng không có.
- Khoảng 13 chỗ `htxProfile.findFirst()` giả định một HTX. Một số nơi tự chọn HTX tạo sớm nhất khi không tìm được.
- Các route chỉ kiểm tra vai trò; `PUT /api/farm/parcels/[id]` và tương tự không kiểm tra bản ghi thuộc HTX nào.
- Ứng dụng đã có lớp port (`src/domain/*/ports`) và repository Prisma (`src/infrastructure/db/**`), nhưng khoảng một nửa route còn gọi Prisma trực tiếp.
- Hasura chỉ đọc, lọc theo `htx_code` và chưa mở phép tổng hợp. Giới hạn của gateway là 300 yêu cầu/phút theo IP.
- `prisma migrate diff` cho thấy thiếu giá trị enum `REJECTED` và 5 cột; đồng thời đề xuất xoá 3 cột `lots`, xoá 2 chỉ mục và đặt `harvest_date` là `NOT NULL`.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định | Lý do |
| --- | --- | --- |
| Cách đọc qua lõi | Adapter cài phần đọc của port hiện có | Theo kiến trúc đang có, thay và kiểm thử từng đường đọc |
| Đường ghi | Giữ Prisma, thêm `TenantGuard` | Hasura chỉ đọc; đổi đường ghi không kịp mốc |
| Khi lõi lỗi | Báo lỗi, không quay về đọc Prisma | Quay về sẽ bỏ qua phân quyền theo HTX |
| Dashboard | Giữ Prisma, lọc theo HTX | Cần phép tổng hợp mà Hasura chưa mở |
| Giới hạn gateway | Cổng nội bộ `9081` cho container `web` | Mọi yêu cầu từ server có chung một IP |
| Cột và chỉ mục thừa | Khai báo trong schema, không xoá | Tránh mất dữ liệu |

## 4. Phiên đăng nhập

- Lúc đăng nhập, callback `jwt` lưu `accessToken`, `refreshToken`, `accessTokenExpiresAt` và `htxCode` (giải mã từ `access_token`).
- Khi token còn dưới 30 giây, callback gọi token endpoint nội bộ để làm mới. Lỗi thì đặt `token.error = 'RefreshFailed'`; middleware chuyển người dùng về `/login`.
- Việc làm mới phải lưu được vào cookie: middleware gọi `auth` cho các đường dẫn đã đăng nhập, vì server component không ghi được cookie.
- `session.user` thêm `htxCode`. `accessToken` và `refreshToken` không có trong `session`. Hàm chỉ chạy phía server `getCoreToken()` đọc token từ JWT.
- Realm đặt `ssoSessionIdleTimeout` và `ssoSessionMaxLifespan` là `28800` giây, khớp phiên ứng dụng.

## 5. Đa thuê bao

### 5.1. `requireTenant()` (`src/lib/api/tenant.ts`)

Trả về `{ userId, role, htxCode, htxProfileId }`. Chưa đăng nhập trả 401. Thiếu `htx_code`, hoặc mã không tồn tại trong `htx_profiles`, trả 403 với mã `NO_HTX`. Không có nhánh dự phòng sang HTX khác.

### 5.2. Thay `findFirst()`

Mọi chỗ `htxProfile.findFirst()` đọc theo `htxCode` của người dùng; port `HtxProfilePort` đổi `findFirst()` thành `findByCode(htxCode)`. `PrismaParcelRepository.create` lấy `season_label` theo HTX của hộ chủ thửa. Trang công khai `htx/[htx_code]` và `lot/[lot_code]` không đổi.

### 5.3. Tạo tài khoản

- `registerUser` ghi thuộc tính `htx_code`, giữ `htxId`.
- Người tự đăng ký lấy mã từ HTX đã chọn. Người được mời lấy mã theo HTX của người mời.
- Manager và officer được mời có required action `CONFIGURE_TOTP` (#18).
- `farmer1` trong realm được gắn `htx_code`. Tài khoản cũ không có mã nhận `NO_HTX` cho tới khi được gán trong Keycloak.

### 5.4. `TenantGuard` (`src/lib/api/tenant-guard.ts`)

Các phương thức `parcel(id)`, `household(id)`, `lot(id)`, `journalEntry(id)`, `diseaseReport(id)` so bản ghi với `htxProfileId` của người gọi (thửa, nhật ký qua hộ; lô qua `htx_profile_id`). Bản ghi khác HTX, không tồn tại, hoặc chưa gắn HTX đều trả **404**. Áp dụng trước mọi thao tác ghi theo `id`. Các kiểm tra vai trò hiện có giữ nguyên.

## 6. Đọc qua lõi

### 6.1. `CoreGatewayClient` (`src/infrastructure/core/core-gateway.client.ts`)

Chỉ chạy phía server. `graphql<T>(query, variables)` gọi `${CORE_GATEWAY_URL}/api/data/graphql` với `Authorization: Bearer` và `x-hasura-role` theo vai trò trong phiên, timeout 10 giây. Lỗi: `CoreUnavailableError` (mạng, timeout, 5xx, có `errors` trong phản hồi) và `CoreUnauthorizedError` (401). `withErrorHandler` đổi lỗi đầu thành 503 `CORE_UNAVAILABLE`, lỗi sau thành chuyển về đăng nhập. Trang hiện thông báo tiếng Việt.

### 6.2. Adapter đọc (`src/infrastructure/core/*`)

| Adapter | Phương thức |
| --- | --- |
| `GatewayParcelReader` | `findAll`, `findById` |
| `GatewayHouseholdReader` | `findAll`, `findById` |
| `GatewayLotReader` | `findAll`, `findById` |
| `GatewayJournalReader` | `findAll`, `findById` |
| `GatewayDiseaseReportReader` | `findPendingReports`, `findHistoryByFarmer` |

Mỗi adapter cài `Pick<...Port, ...>` và trả đúng kiểu dữ liệu của port. Adapter không tự lọc theo HTX. Route `GET` dùng adapter; use case trước khi ghi vẫn dùng repository Prisma cùng `TenantGuard`. Metadata Hasura bổ sung các relationship adapter cần (ví dụ thửa tới `parcel_crop_cycles`), không đổi bộ lọc quyền.

### 6.3. Dashboard và phần giữ Prisma

Dashboard manager, officer dùng Prisma và lọc theo `htxProfileId`. `market_data`, `bulletins`, `fx_rates`, `partners` không đổi.

## 7. Gọi lõi khác

- `DiseaseApiAdapter`: `${CORE_GATEWAY_URL}/api/ai/disease/predict` có token, giữ timeout 60 giây.
- `ChatbotUseCase`: có Groq key thì giữ nguyên; không có thì dùng `${CORE_GATEWAY_URL}/api/ai/llm/v1` với token người dùng làm API key và model `OLLAMA_MODEL` (mặc định `qwen2.5:0.5b`).

## 8. Migration (#7)

Một migration mới, chạy được trên database đang có:

1. `ALTER TYPE "DiseaseReportStatus" ADD VALUE IF NOT EXISTS 'REJECTED'`.
2. `ADD COLUMN IF NOT EXISTS`: `disease_reports.treatment_recommendation`, `journal_entries.photo_minio_key`, `journal_entries.photo_url`, `parcel_crop_cycles.estimated_harvest_date`, `weather_cache.forecast_json`.
3. Điền `lots.harvest_date = created_at` cho dòng trống, rồi `SET NOT NULL`.

`schema.prisma` khai báo tuỳ chọn 3 cột `lots` (`packaging_date`, `packaging_spec`, `total_weight_kg`) và `@@index` cho `households(htx_profile_id)`, `lots(htx_profile_id, status)`. Sau migration, `prisma migrate diff` phải rỗng. Migration `20260828134608` giữ nguyên.

## 9. Triển khai

- `platform/gateway/config.yaml` nghe thêm `9081`; không publish ra host. Plugin `limit-count` trong global rule có `_meta.filter` để bỏ qua `server_port` `9081`. JWT, audience và phân quyền áp dụng như trên `9080`.
- Compose: `web` có `CORE_GATEWAY_URL=http://apisix:9081` và phụ thuộc `apisix`.
- Upgrade notes: cập nhật phiên SSO trong realm đang chạy, gán `htx_code` cho tài khoản cũ, chạy `migrate`.

## 10. Kiểm thử

| Lớp | Nội dung |
| --- | --- |
| Unit | Làm mới token (thành công, lỗi); `requireTenant` cho từng trường hợp; `TenantGuard` trên từng loại bản ghi; từng adapter so với bản Prisma trên cùng dữ liệu mẫu; `errors` và timeout thành lỗi rõ ràng |
| Route | Cán bộ `TC` gọi từng route ghi trên bản ghi `LB` nhận 404 |
| Smoke | `prisma migrate diff --exit-code` rỗng; `9081` không bị giới hạn theo IP, `9080` vẫn bị; JWT vẫn bắt buộc trên `9081` |
| Trình duyệt, trên stack thật | `manager_tc`, `manager_lb` đăng nhập qua Keycloak và chỉ thấy dữ liệu của mình; `/api/auth/session` không chứa token; tắt Hasura thì trang báo lỗi, không hiện dữ liệu |

**Chống hồi quy:** 115 khẳng định smoke, 78 test dataops, 38 test scanner, 7 test realm, 405 test web và toàn bộ job CI phải xanh. Test đang mock `findFirst()` được cập nhật theo giao diện mới, không xoá và không bỏ qua.

## 11. Tiêu chí hoàn thành

1. Migration chạy được trên database mới và trên database có sẵn dữ liệu; `prisma migrate diff` rỗng.
2. Không còn `htxProfile.findFirst()` trong mã ứng dụng.
3. Mọi route ghi theo `id` có `TenantGuard`.
4. Năm adapter đọc được dùng trong các route `GET` tương ứng.
5. CI xanh toàn bộ; đóng #7, #18; phát hành `v1.6.0`.

## 12. Thứ tự, điểm cắt và ngoài phạm vi

**Thứ tự:** #7 → phiên và đa thuê bao → `TenantGuard` → adapter đọc → chẩn đoán bệnh và chatbot → kiểm thử trình duyệt, tài liệu. Mục tiêu xong trước **14/11**. Nếu trễ, cắt chatbot trước, rồi giảm số adapter đọc. `TenantGuard` và #7 không cắt.

**Ngoài phạm vi:** presigned URL qua gateway (#12); `market_data`, `bulletins`, `partners`; quyền `farmer` trên dữ liệu cảm biến; toàn bộ phần chè, `DESIGN.md`, giao diện và dark mode (đợt 2b).

**Giới hạn đã biết:** cổng `9081` chỉ an toàn khi nằm trong mạng Docker; đường ghi được bảo vệ ở tầng ứng dụng, không phải ở database.

## 13. Rủi ro

| Rủi ro | Biện pháp |
| --- | --- |
| `_meta.filter` theo `server_port` không hoạt động như dự kiến | Kiểm chứng đầu tiên trong plan; không được thì dừng lại và chốt cách khác trước khi viết tiếp |
| Token mới không lưu được vào cookie ở server component | Làm mới trong middleware; kiểm thử trình duyệt với token hết hạn |
| Cookie phiên lớn hơn do chứa thêm token | next-auth chia cookie; đo kích thước trong kiểm thử trình duyệt |
| Định dạng dữ liệu Hasura khác Prisma (ngày, quan hệ) | Test so sánh adapter với bản Prisma |
| Bỏ sót route ghi khi gắn `TenantGuard` | Plan liệt kê từng route; test route chạy trên toàn bộ danh sách |

## Ghi chú sau triển khai 2a

Khác biệt/bổ sung so với thiết kế:

- `_meta.filter` theo `server_port` hoạt động đúng như dự kiến: `9081` không bị giới hạn, `9080` vẫn trả 429. Yêu cầu không có token bị `openid-connect` từ chối 401 trước khi tới `limit-count`, nên kiểm tra giới hạn trong smoke dùng token hợp lệ.
- Route `llm-chat` giới hạn theo `$remote_addr $http_authorization`: qua `9081` mọi người dùng chung một IP là container `web`, giới hạn theo IP sẽ dồn chung ngân sách.
- Migration có hai file thay vì một: `20261109130000_notifications_htx` thêm `notifications.htx_profile_id`, vì thông báo gửi chung (`recipient_id` rỗng) trước đó hiện cho mọi HTX. Thông báo cũ không có người nhận và không có HTX không còn hiển thị; cảnh báo hệ thống của n8n (không có người gửi) vẫn hiển thị.
- Việc làm mới token nằm ở cả hai nơi: middleware ghi cookie, và `getCoreToken()` cũng làm mới, vì yêu cầu kích hoạt làm mới vẫn mang cookie cũ vào server component. Token làm mới ở `getCoreToken()` không được lưu; middleware đã lưu.
- `readHtxCode` dùng `atob` vì chạy trong Edge middleware.
- `TenantGuard` có thêm `cropCycle(id)`, và được gắn thêm vào các route `POST` nhận `household_id`/`parcel_id` trong body, `soil-health`, `latest-photo`, `schedule/harvest/[cycle_id]`. `soil-health` trước đây không yêu cầu đăng nhập.
- Realm khai báo thêm `fullName`, `phone`, `htxId` là thuộc tính chỉ admin xem và sửa, vì Keycloak 24 bỏ các thuộc tính chưa khai báo khi tạo tài khoản.
- Hasura ngoài các relationship dạng mảng còn có object relationship `disease_reports.parcel` (adapter cần `parcel_code`) và `allow_aggregations` trên `journal_entries` (đếm trang); không đổi bộ lọc quyền. Dashboard vẫn dùng Prisma như thiết kế.
- `api/weather` và `getFarmerParcels` cũng đọc qua adapter, ngoài danh sách ban đầu. Hasura trả `timestamp` không có múi giờ, nên `parseCoreTimestamp` đọc theo UTC để khớp Prisma.
- Lỗi tìm thấy bởi kiểm thử trình duyệt: container `web` có `HOSTNAME=0.0.0.0` và không có `AUTH_URL`, nên `redirect_uri` thành `http://0.0.0.0:3000/...` và Keycloak từ chối (`Invalid parameter: redirect_uri`). Compose nay đặt `AUTH_URL` (mặc định `http://localhost:3000`). Unit test và smoke không phát hiện được lỗi này.
- Kiểm thử trình duyệt đăng nhập thật qua form Keycloak. Test token hết hạn hạ `accessTokenLifespan` của realm xuống 40 giây rồi khôi phục trong `finally`, chờ token hết hạn thật và chặn `/api/auth/session`, nên chỉ middleware có thể ghi token mới; cookie sau đó được giải mã để so sánh token và thời điểm hết hạn. Test Hasura dừng và khởi động lại Hasura trong `finally`.
- `error.tsx` nhận đúng digest `CORE_UNAVAILABLE` trên trình duyệt thật ở bản production.
- `DISEASE_API_URL` và `OLLAMA_BASE_URL` bị bỏ khỏi các file env mẫu vì không service nào đọc; `scripts/validate-env.sh` bỏ khóa tương ứng. `KEYCLOAK_ISSUER` bỏ khỏi `docker/.env.local.example` vì compose ghi đè.
- Test e2e `8.11-E2E-001` (trạng thái lỗi) nay mock hai route và cookie giả có `htxCode`, vì cookie không có token bị chuyển về `/login` và layout hiện `NO_HTX` khi thiếu mã HTX.
- Rà soát cuối nhánh phát hiện `schedule/harvest`, `schedule/unscheduled`, `weather/forecast` và trang soil-health của cán bộ đọc Prisma không lọc HTX; nay các route này dùng `requireTenant()` và lọc theo `household.htx_profile_id`.
- Tài liệu được tách theo HTX: mọi key là `para/<htxCode>/...`, ba route tài liệu lấy mã HTX từ phiên, key ngoài thư mục (kể cả `..`) trả 404; `certificate_keys` ngoài thư mục trả 400 ở cả xuất QR và tạo lô. Object cũ không còn được liệt kê và không tự chuyển. Chatbot kỹ thuật chỉ đọc `Resources` và `Areas` của HTX.
- `refreshAccessToken` đọc lại vai trò từ access token mới bằng hàm dùng chung với `auth.ts`; không còn vai trò hợp lệ thì xóa vai trò. Ở production, phiên không có refresh token được coi là `RefreshFailed`.
- `KeycloakAdminAdapter` đọc `KC_BOOTSTRAP_ADMIN_*` rồi `KEYCLOAK_ADMIN*`, và không dùng `admin/admin` ở production. `/api/register` nằm trong danh sách API công khai của middleware.

Đo thực tế (máy arm64, database sạch, image và lớp build đã có cache; model được kéo lại vì volume mới):

| Bước | Vòng 1 | Vòng 2 |
| --- | --- | --- |
| `make platform-up` | 52 giây | 49 giây |
| `make platform-smoke` | 65 giây | 65 giây |
| Dựng và chờ `web` | 66 giây | 5 giây (dùng cache) |
| 5 test trình duyệt | 68 giây | 69 giây |

- Smoke: 122 khẳng định PASS, 0 FAIL ở mỗi vòng (115 khẳng định cũ cộng 7 khẳng định mới).
- Unit web: 754 test PASS, 3 skipped (405 test ban đầu vẫn còn); dataops 78; scanner 38; realm 9.
- Cookie phiên, tính cả tên và giá trị: 5407 byte trong 2 cookie trên realm mới; 5023 byte trong 2 cookie trên realm đã chạy từ trước. next-auth tự chia cookie nên không vượt giới hạn 4 KB mỗi cookie.
- Chưa đo thời gian toàn job Platform Smoke trên CI sau khi thêm `web` và Chromium.

Giới hạn đã biết: cổng `9081` chỉ an toàn khi nằm trong mạng Docker; đường ghi được bảo vệ ở tầng ứng dụng, không phải ở database; `workflows/mattermost-push.json` đẩy sự kiện bệnh và thu hoạch của mọi HTX vào một webhook; `/api/dev-login` và cookie trước nâng cấp không có access token nên đọc qua lõi bị từ chối; lỗi làm mới trong Edge middleware không được ghi log vì `logger` dùng `process.stderr`; `disease-api` không dựng được trên máy arm64 (thiếu `tensorflow-cpu`), nên đường chẩn đoán bệnh qua gateway chỉ được kiểm thử bằng unit test.
