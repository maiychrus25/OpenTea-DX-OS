<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Về Xứ Chè — app di động gian hàng HTX (`hub-mobile`)

Một app Flutter (Dart) cho Android và iOS, nhiều vai trong một mã nguồn. Đây là **khung sườn (skeleton) mốc M3** theo
`docs/specs/2026-11-16-multirole-app-direction.md` (nhánh `docs/37-multirole-app-direction`) và
`docs/specs/2026-11-15-htx-storefront-app-direction.md` (nhánh `docs/htx-storefront-direction`). Hai tài liệu đó là nguồn
sự thật; chỗ khác nhau thì bản 2026-11-16 thắng.

> **Trạng thái:** mặc định chạy trên **dữ liệu mẫu trong bộ nhớ** và **tài khoản dùng thử**. Đã viết sẵn phần đọc dữ liệu lõi thật
> (Hasura) cho màn hình cán bộ, trưởng HTX và nông dân, đăng nhập Keycloak (PKCE) và vài lệnh ghi qua API web bằng Bearer token,
> **nhưng chưa từng chạy với Keycloak, Hasura hay web thật** (xem "Chạy chế độ thật" và "Chưa kiểm chứng").

Danh sách chức năng từng vai, và cái nào bỏ, nằm ở `docs/specs/2026-11-16-multirole-app-features.md`. Bản này đã **bỏ** các mục
giả theo §7 của tài liệu đó: tab "Đã lưu" (tim yêu thích), tab "Bản đồ" vẽ minh hoạ, "Chỉ đạo và nhiệm vụ" của công ty du lịch, và các
màn "Sắp có" (Chatbot, Bản đồ đối tác, Kho ứng dụng, Tài liệu, Chẩn đoán, Nhật ký bệnh, Trợ lý). Chúng chỉ làm trên web.

## Năm vai

| Vai | Vào bằng | Giao diện (`lib/features/...`) |
| --- | --- | --- |
| Khách vãng lai | "Xem với tư cách khách" | `customer`: thanh dưới là Khám phá, Tour, Lịch trình, Tài khoản. Tin tức, tour, sản phẩm, giỏ hàng xem tự do; thanh toán, đặt tour, đơn, vé yêu cầu đăng nhập |
| Khách có tài khoản (`customer`) | Đăng nhập | `customer`: đặt tour, mua hàng, thanh toán VietQR, đơn và vé lưu trong máy |
| Nông dân (`farmer`) | Đăng nhập | `farmer`: lịch tham quan tại hộ mình, điểm danh, sản phẩm của hộ |
| HTX (`manager`; `officer` chỉ xem) | Đăng nhập | `manager`: tổng quan, đơn, lượt đặt, xác nhận thu tiền, tin tức, sổ thu |
| Công ty du lịch (`operator`) | Đăng nhập | `operator`: tổng quan các HTX liên kết, tour toàn vùng, duyệt bài, báo cáo tổng hợp, theo dõi đặt tour |

Sau đăng nhập app đọc vai trong claims và chuyển tới giao diện của vai đó (`lib/core/role/role.dart`,
`lib/core/router/app_router.dart`). Ẩn màn hình chỉ để gọn; **quyền thật do máy chủ kiểm trên mỗi lệnh gọi**.

Tên vai `operator` là tên tạm: vai của công ty du lịch chưa được chốt (xem `2026-11-15-operator-and-articles-design.md`).

## Tài khoản dùng thử

Mật khẩu chung `Demo@2026` (đây là tài khoản công khai của bản demo, không phải bí mật):

| Email | Vai |
| --- | --- |
| `customer@demo.vn` | Khách có tài khoản |
| `farmer@demo.vn` | Nông dân (hộ `hh-01`) |
| `manager@demo.vn` | HTX (ghi được) |
| `officer@demo.vn` | Cán bộ HTX (chỉ xem) |
| `operator@demo.vn` | Công ty du lịch |

## Dựng và chạy

Cần Flutter 3.41.7 (Dart 3.11.5). Một lệnh, từ thư mục này:

```bash
./tool/build.sh          # cài đúng phiên bản trong pubspec.lock, kiểm định dạng, analyze, test, rồi dựng APK
./tool/build.sh check    # chỉ analyze và test (không cần Android SDK)
```

APK nằm ở `build/app/outputs/flutter-apk/app-release.apk`. Dựng APK cần Android SDK và JDK; dựng iOS
(`flutter build ios`) bắt buộc trên Mac có Xcode. Chạy thử khi phát triển:

```bash
flutter pub get && flutter run
```

Phiên bản mọi thư viện được ghim chính xác trong `pubspec.yaml` (không dùng `^`); `pubspec.lock` ghim cả thư viện gián tiếp
và `--enforce-lockfile` làm lệnh dựng thất bại nếu hai tệp lệch nhau. Danh sách và giấy phép ở `DEPENDENCIES.md` của repo.

## Ràng buộc

Không dịch vụ Google Play, không Firebase, không Google Maps SDK, không thống kê/analytics. Mọi thư viện có giấy phép OSI.
Không dùng ảnh bên ngoài: ảnh minh hoạ là dải màu chuyển (`lib/core/theme/app_theme.dart`).
Manifest Android xin quyền `INTERNET` cho `HttpHubRepository`; bản mặc định (dữ liệu mẫu) không gọi mạng. Android chặn HTTP thường
(không TLS) ở bản phát hành, nên máy chủ thật phải là `https`; HTTP chỉ dùng khi thử trên máy phát triển.

## Cấu trúc

```
lib/
  core/      theme, router, role (vai và claims), money, format, vietqr (có thử nghiệm đơn vị)
  data/      hub_repository.dart (giao diện), mock_hub_repository.dart + seed_data.dart (dữ liệu mẫu),
             http_hub_repository.dart (lõi thật qua GraphQL + phần còn lại giao cho bản mẫu), hub_config.dart (--dart-define),
             core/ (graphql_client, core_queries, core_mappers, core_exception),
             auth_service.dart (giao diện: `bearerToken()`, `refreshBearer()`), demo_auth_service.dart, keycloak_auth_service.dart,
             auth/ (oidc_client, appauth_oidc_client, token_store, jwt_claims), core/hub_api_client.dart (lệnh ghi bằng Bearer),
             local_store.dart (lưu trong máy), models/
  app/       AppState (phiên), CartController, ActivityController (đơn và vé), HubApp
  features/  auth, customer, farmer, manager, operator, common
  shared/    widget dùng chung
test/        thử nghiệm đơn vị và widget (money, VietQR, vai/định tuyến, giỏ hàng, trạng thái đơn, lưu trong máy, luồng màn hình,
             test/data/core: máy khách GraphQL, ánh xạ lỗi, phân tích dữ liệu, đối chiếu cột với metadata Hasura và schema.prisma;
             test/fixtures/core: JSON viết tay có hình dạng như Hasura trả về)
```

Quy ước: tên trong mã bằng tiếng Anh, chữ hiển thị bằng tiếng Việt, tệp mới có header SPDX.

## Thật và giả

| Phần | Hiện tại |
| --- | --- |
| Dữ liệu lõi (thành viên/hộ, thửa đất, nhật ký, lịch thu hái, lô, thông báo, hồ sơ HTX) | **Mẫu** theo mặc định; **thật nhưng chưa kiểm chứng** khi bật `HUB_USE_MOCK=false` (xem mục dưới). Đọc qua GraphQL; ghi qua các đường Bearer của web (bảng "Ghi dữ liệu"), trừ từ chối nhật ký, đổi ngày thu hoạch, ảnh |
| Dữ liệu Gian hàng (tour, sản phẩm, đơn, lượt đặt, bài viết, sổ thu) | **Giả**: `MockHubRepository` trong bộ nhớ, mất khi tắt app. Quy tắc (tồn kho, chỗ trống, chuyển trạng thái, sổ thu chỉ thêm) viết theo hướng dẫn nhưng máy chủ mới là nơi giữ quy tắc thật |
| Đăng nhập | Mặc định **giả**: `DemoAuthService`, tài khoản cố định, phiên lưu trong `shared_preferences`. Chế độ thật: `KeycloakAuthService`, **Keycloak OIDC, mã xác thực có PKCE (S256), client công khai `dxos-mobile`**, mở bằng trình duyệt hệ thống, token cất trong kho an toàn của hệ điều hành (Android Keystore, iOS Keychain). Đã viết và thử bằng máy chủ giả, **chưa chạy với Keycloak thật** |
| Giỏ hàng, đơn và vé của khách | **Thật** (lưu trong máy bằng `shared_preferences`, mở được khi mất mạng). Khi có mạng, danh sách từ máy chủ ghi đè bản cùng `id` trong máy, mục chỉ có trong máy được giữ lại |
| Mã VietQR | **Thật** về cấu trúc và CRC (cùng thuật toán và vectơ với `tea-tour`). **Chưa ai quét thử bằng app ngân hàng thật.** Tài khoản ngân hàng trong dữ liệu mẫu là bịa |
| API Gian hàng | **Chưa có** (mini-app Gian hàng chưa làm). Tour, sản phẩm, đơn, thanh toán, bài viết, bản tin, thời tiết, báo cáo vẫn do `MockHubRepository` phục vụ và có nhãn "Dữ liệu mẫu". Không bịa đường dẫn API |

## Chọn nguồn dữ liệu

Lúc dựng (`--dart-define`), mặc định là dữ liệu mẫu để bản demo chạy không cần mạng:

| Biến | Ý nghĩa |
| --- | --- |
| `HUB_USE_MOCK=true` (mặc định) | Mọi thứ do `MockHubRepository` phục vụ |
| `HUB_USE_MOCK=false` | Màn hình lõi đọc từ lõi thật và đăng nhập bằng Keycloak; Gian hàng vẫn là mẫu. Bắt buộc có `HUB_API_BASE_URL` và `HUB_KEYCLOAK_ISSUER` (hoặc `HUB_DEV_TOKEN` ở bản debug), thiếu thì app báo "Cấu hình chưa đúng" thay vì lặng lẽ dùng dữ liệu mẫu |
| `HUB_API_BASE_URL=https://...` | Địa chỉ gốc của cổng (APISIX) và của web. App đọc qua `POST {gốc}/api/data/graphql` và ghi qua `{gốc}/api/journal`, `{gốc}/api/notifications` |
| `HUB_KEYCLOAK_ISSUER=https://.../realms/agrimarket` | Địa chỉ realm Keycloak. Client cố định `dxos-mobile`, chuyển hướng `vn.opentea.hub_mobile:/oauth2redirect`, phạm vi `openid profile email`. Không có bí mật nào trong app (client công khai) |
| `HUB_DEV_TOKEN=...` | Token truy cập lấy từ stack phát triển, **chỉ được nhận trong bản debug** (bản release bỏ qua). Dùng thử bằng tay, không phải đăng nhập. Có biến này thì app vẫn dùng tài khoản dùng thử như trước, không dùng Keycloak |
| `HUB_DEV_HOUSEHOLD_ID=...` | Chỉ cùng với `HUB_DEV_TOKEN` ở bản debug: mã hộ thật thay cho mã hộ bịa `hh-01` của tài khoản `farmer@demo.vn` |

```bash
flutter run --dart-define=HUB_USE_MOCK=false --dart-define=HUB_API_BASE_URL=https://gateway.example \
            --dart-define=HUB_DEV_TOKEN=<token của người dùng manager/officer/farmer>
```

Vai gửi lên Hasura (`x-hasura-role`) lấy từ tài khoản dùng thử đã đăng nhập (`manager`, `officer`, `farmer`) và phải là một vai có trong
token. Không có token thì màn hình lõi hiện "Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ" kèm nút Thử lại, không gọi máy chủ.

## Dữ liệu lõi thật

`HttpHubRepository` (`lib/data/http_hub_repository.dart`) đọc lõi theo cách `apps/web` đọc
(`apps/web/src/infrastructure/core/gateway-*-reader.ts`): GraphQL tới Hasura qua cổng, tiêu đề `Authorization: Bearer`, `x-hasura-role`.
Tên bảng và cột lấy từ `platform/hasura/metadata/databases/default/tables/public_*.yaml` và `apps/web/prisma/schema.prisma`;
`test/data/core/core_contract_test.dart` đối chiếu từng cột, quan hệ, `order_by` và quyền `select` của ba vai với hai nguồn đó.

| Màn hình | Gốc truy vấn (Hasura) | Cột/quan hệ dùng |
| --- | --- | --- |
| Hồ sơ HTX | `htx_profiles(limit: 1)` | `id htx_code name address contact_phone contact_email crop_types season_label total_area_ha` |
| Thành viên, nông hộ | `households` | `id name phone address keycloak_user_id created_at` (có tài khoản liên kết = "Hoạt động", chưa = "Chờ kích hoạt") |
| Vùng trồng, thửa của tôi, lịch thu hái | `parcels` | `id parcel_code household_id area_ha crop_type status estimated_yield_per_ha`, `household { id name address }`, `crop_cycles(order_by created_at desc, limit 1) { season sowed_at harvested_at estimated_harvest_date }`. Lịch thu hái = ngày dự kiến của vụ chưa thu. "Vùng" lấy tạm từ địa chỉ hộ vì lõi không có cột vùng |
| Nhật ký (xem, lọc chờ duyệt) | `journal_entries` | `id parcel_id entry_date activity_type performed_by status notes created_at`, `activities { activity_detail product_name dosage withdrawal_days safe_harvest_date }`, `parcel { parcel_code crop_type household_id }` |
| Lô hàng | `lots` | `id lot_code commodity quality_grade harvest_date estimated_weight_kg actual_weight_kg total_weight_kg packaging_type destination buyer_name status`, `lot_parcels { parcel { parcel_code } }` |
| Thông báo | `notifications` | `id type title body is_read created_at household_id` (quyền Hasura chỉ cho `recipient_id` = người dùng, nên bản tin phát chung của HTX không hiện) |

Mỗi danh sách lấy tối đa 200 dòng mới nhất (chưa phân trang). Ngày giờ Hasura trả không kèm múi giờ là UTC (giống web).

**Phạm vi theo hộ.** Nông dân chỉ thấy hộ mình là do **quyền hàng của Hasura** (`keycloak_user_id = X-Hasura-User-Id`, nằm trong
metadata), không phải do app. App chỉ thêm bộ lọc `household_id` để màn hình hỏi đúng thứ nó hiển thị; không có kiểm tra bảo mật phía máy khách.
Mã HTX không được gửi: Hasura lấy từ `htx_code` trong token.

**Lỗi.** HTTP 401, 403, 5xx, mất mạng/quá thời gian, mã lỗi Hasura (`invalid-jwt`, `access-denied`, `validation-failed`...) được đổi thành câu
tiếng Việt cố định (`lib/data/core/core_exception.dart`), không chứa token hay nội dung thô của máy chủ. Màn hình hiện vòng quay khi tải,
trạng thái rỗng khi không có dòng, và nút "Thử lại" khi lỗi.

**Ghi dữ liệu.** Hasura không cho ba vai này insert/update, nên lệnh ghi đi qua API web bằng `Authorization: Bearer <access token>`, chỉ ở các
đường mà web đã mở cho app di động (phần "Bearer token (mobile apps)" trong `docs/api-contract.md`). Web tự kiểm token (chữ ký RS256, `iss`, `exp`, `azp`
= `dxos-mobile`, vai) và kiểm vai, HTX, hộ như với phiên đăng nhập web; app không tự kiểm gì về quyền.

| Việc trong app | Vai | Lệnh gọi | Thân yêu cầu |
| --- | --- | --- | --- |
| Nông dân ghi nhật ký | nông dân | `POST /api/journal` | `{parcel_id, entry_date: "yyyy-MM-dd", observation?, activities: [{activity_type, product_name?, dosage?, withdrawal_days?}]}` (đúng `journalCreateSchema`; người ghi lấy từ token) |
| Duyệt nhật ký | trưởng HTX (web cũng cho cán bộ duyệt; app giữ quy ước "cán bộ chỉ xem") | `POST /api/journal/batch-approve` | `{entry_ids: [id]}`; trả `{approved_count, failed_ids}` |
| Đánh dấu đã đọc một thông báo | mọi vai có token | `PUT /api/notifications` | `{id, action: "mark-read"}` |
| Đánh dấu đã đọc tất cả | mọi vai có token | `PUT /api/notifications` | `{action: "mark-all-read"}` |
| Gửi thông báo cho HTX | trưởng HTX, cán bộ | `POST /api/notifications/announce` | `{title, body}` (có hàm `announce` trong repository và thử nghiệm, **chưa có màn hình** gọi nó) |

**Chưa làm được, nên nút bị ẩn:** *từ chối* nhật ký (web chỉ có duyệt hàng loạt cho token Bearer; `PUT /api/journal/{id}` sửa nội dung, không đổi trạng thái)
và *đổi ngày thu hoạch* (`/api/schedule/harvest` chưa nhận Bearer). Repository báo `canRejectJournal` và `canRescheduleHarvest` là sai nên màn hình không vẽ các nút đó.
**Ảnh nhật ký chưa làm:** `POST /api/journal/upload` `{filename, contentType}` trả `{uploadUrl, key}` (PUT thẳng lên URL ký sẵn rồi gửi `photo_minio_key`), hợp đồng đơn giản,
nhưng cần thêm thư viện chọn ảnh/máy ảnh và quyền camera nên để lại.

**Lỗi ghi** đổi thành câu tiếng Việt cố định, chỉ dựa vào mã HTTP (và `error.code` cho `NO_HTX`), không chép chữ của máy chủ, không chứa token hay nội dung đã gửi:
401 thử làm mới token đúng một lần rồi mới báo "Hãy đăng nhập lại"; 403 "Bạn không có quyền thực hiện thao tác này."; 404 "Không tìm thấy dữ liệu này"; 400/422 "Dữ liệu chưa hợp lệ";
409 "Dữ liệu này đã tồn tại..."; 503 "Hệ thống tạm thời không khả dụng. Hãy thử lại sau." (kèm nút "Thử lại" trên thanh thông báo, cũng cho mất mạng và 5xx).

Ở chế độ thật, các phần của tổng quan lấy từ Gian hàng/thị trường/thời tiết (khối "Gian hàng", "Chỉ số giá nông sản", thời tiết, lịch tham quan)
bị ẩn thay vì trộn số mẫu cạnh số thật.

## Nhãn "Dữ liệu mẫu"

Chip "Dữ liệu mẫu" ở đầu màn hình cho biết màn hình đó do `MockHubRepository` phục vụ: toàn bộ phần khách, các trang Gian hàng và công ty du lịch,
và cả các trang lõi khi chạy chế độ mẫu. Trang lõi chạy chế độ thật thì không có chip.

## Chạy chế độ thật với stack dev

Cần trước: hai PR của nền tảng **phải được gộp và triển khai** (hoặc chạy từ nhánh của chúng): **#41** (client công khai Keycloak `dxos-mobile`, chuyển hướng
`vn.opentea.hub_mobile:/oauth2redirect`) và **#43** (các đường `/api/journal/**` và `/api/notifications/**` nhận `Authorization: Bearer` của `dxos-mobile`).
Chưa có hai PR đó thì đăng nhập hoặc ghi sẽ thất bại.

```bash
make mobile-client      # ở thư mục gốc repo, stack đang chạy: tạo client dxos-mobile nếu realm cũ chưa có
flutter run \
  --dart-define=HUB_USE_MOCK=false \
  --dart-define=HUB_API_BASE_URL=http://<máy-dev>:<cổng-cổng-vào> \
  --dart-define=HUB_KEYCLOAK_ISSUER=http://<máy-dev>:8080/realms/agrimarket
```

Máy ảo/điện thoại phải tới được cả hai địa chỉ (trên máy ảo Android, máy chủ trên máy dựng là `10.0.2.2`). Issuer phải **trùng chữ** với `KEYCLOAK_ISSUER` của web
(web so khớp `iss` của token). Địa chỉ `http://` chỉ chạy ở bản debug (AppAuth bị bật `allowInsecureConnections`) và Android còn có thể chặn HTTP thường; bản release phải là `https`.
Trước khi dùng cần: một người dùng trong realm có vai `farmer`, `officer` hoặc `manager` và thuộc tính `htx_code`; token cần audience `dx-os-core` (client `dxos-mobile` đã có phạm vi `dx-os-core`).

Cách app xử lý đăng nhập (`lib/data/keycloak_auth_service.dart`):

- Nút "Đăng nhập bằng tài khoản HTX" mở trình duyệt hệ thống (không có ô mật khẩu trong app); mã xác thực có PKCE S256, không có bí mật nào.
- Vai, tên, `htx_code` đọc từ phần thân access token **không kiểm chữ ký**, chỉ để hiển thị và chọn giao diện. Web kiểm token thật; Hasura giữ quyền theo hàng. Thứ tự vai như web:
  `manager` > `officer` > `farmer`. Người dùng không có vai nào trong số đó chỉ được vào nếu token ghi rõ vai `customer`; ngược lại bị từ chối (và không lưu gì). Vai `operator` chưa chốt tên nên chưa nhận.
- Access và refresh token chỉ nằm trong `flutter_secure_storage` (Android Keystore / iOS Keychain) và bộ nhớ, không ở `shared_preferences`, không vào nhật ký hay thông báo lỗi.
- Token được làm mới trước khi hết hạn (còn dưới 60 giây) và một lần sau mỗi 401. Refresh token bị từ chối (`invalid_grant`) thì xoá token, đăng xuất và về màn hình đầu; lỗi mạng thì giữ phiên.
- Android: `manifestPlaceholders["appAuthRedirectScheme"] = "vn.opentea.hub_mobile"` trong `android/app/build.gradle.kts`. iOS: scheme `vn.opentea.hub_mobile` trong `ios/Runner/Info.plist`.

Chưa gộp #41/#43 thì chế độ dùng thử (`HUB_USE_MOCK=true`, mặc định) và `HUB_DEV_TOKEN` ở bản debug vẫn chạy như cũ.

## Chưa kiểm chứng

**Chưa có lần gọi nào tới Keycloak, Hasura hay web thật, cả đăng nhập lẫn đọc lẫn ghi.** Docker không chạy được trên máy dựng, cũng không có Android SDK hay Xcode, nên chưa dựng
APK/iOS và chưa mở trình duyệt đăng nhập trên máy thật. Những gì đã kiểm tra là: truy vấn khớp metadata và
schema (thử nghiệm đối chiếu), cách ghép yêu cầu và ánh xạ lỗi với máy chủ giả, phân tích dữ liệu bằng JSON viết tay có hình dạng như Hasura trả
về (không ghi lại từ máy chủ thật); với phần mới: hình dạng yêu cầu ghi (phương thức, đường dẫn, tiêu đề, thân) so với zod schema trong mã web, luồng làm mới token khi gặp 401 bằng kho token và máy chủ giả,
ánh xạ lỗi, đọc vai từ JWT không ký dựng tay, và bản web của chế độ dùng thử vẫn dựng và chạy (có chụp màn hình đăng nhập ở cả hai chế độ). Chưa kiểm: toàn bộ luồng PKCE trên Android/iOS (mã lỗi
`PlatformException` của AppAuth khi huỷ hoặc `invalid_grant` là suy đoán, nên mọi lỗi lạ được coi là tạm thời để không đăng xuất nhầm), redirect `vn.opentea.hub_mobile:/oauth2redirect` với Keycloak thật,
issuer khớp `iss`, Keycloak/Hasura chấp nhận `x-hasura-role` và audience `dx-os-core` với token của `dxos-mobile`, dạng thân trả về `{data}` của các đường ghi, ID nhật ký/thông báo từ Hasura khớp ID web nhận,
việc dựng Android với `jni`/`jni_flutter` (kéo theo bởi `path_provider_android`, cần NDK), HTTP thường trên Android debug, hạ tầng khác. Còn chưa kiểm: Hasura chấp nhận đúng các truy vấn này với từng vai, giá trị `x-hasura-role`, định dạng ngày giờ
thật, CORS khi chạy trên web, quá thời gian và chứng chỉ TLS trên máy thật, hiệu năng với dữ liệu thật.

## Chưa làm trong khung sườn

Từ chối nhật ký, đổi ngày thu hoạch và ảnh nhật ký trong app (xem trên), màn hình gửi thông báo, API Gian hàng, tạo/sửa tour, ngày khởi hành, sản phẩm và bài viết trong app HTX (chỉ xem, gửi duyệt),
đánh giá sau chuyến, lưu địa chỉ, chatbot, video, đồng bộ ngoại tuyến hai chiều (hiện chỉ đọc lại bản lưu), ảnh thật,
chạy thử trên máy ảo Android/iOS.
