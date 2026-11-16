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
> (Hasura) cho màn hình cán bộ, trưởng HTX và nông dân, **nhưng chưa từng chạy với Hasura/Keycloak thật** (xem "Dữ liệu lõi thật" và
> "Chưa kiểm chứng"). Chưa có đăng nhập Keycloak.

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
             auth_service.dart (giao diện, có `bearerToken()`), demo_auth_service.dart, local_store.dart (lưu trong máy), models/
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
| Dữ liệu lõi (thành viên/hộ, thửa đất, nhật ký, lịch thu hái, lô, thông báo, hồ sơ HTX) | **Mẫu** theo mặc định; **thật nhưng chưa kiểm chứng** khi bật `HUB_USE_MOCK=false` (xem mục dưới). Chỉ đọc |
| Dữ liệu Gian hàng (tour, sản phẩm, đơn, lượt đặt, bài viết, sổ thu) | **Giả**: `MockHubRepository` trong bộ nhớ, mất khi tắt app. Quy tắc (tồn kho, chỗ trống, chuyển trạng thái, sổ thu chỉ thêm) viết theo hướng dẫn nhưng máy chủ mới là nơi giữ quy tắc thật |
| Đăng nhập | **Giả**: `DemoAuthService`, tài khoản cố định. Bản thật dùng **Keycloak OIDC, luồng mã xác thực có PKCE, client công khai `dxos-mobile`**, mở bằng trình duyệt hệ thống, token cất trong kho an toàn của hệ điều hành (chưa làm). Phiên dùng thử lưu trong `shared_preferences` |
| Giỏ hàng, đơn và vé của khách | **Thật** (lưu trong máy bằng `shared_preferences`, mở được khi mất mạng). Khi có mạng, danh sách từ máy chủ ghi đè bản cùng `id` trong máy, mục chỉ có trong máy được giữ lại |
| Mã VietQR | **Thật** về cấu trúc và CRC (cùng thuật toán và vectơ với `tea-tour`). **Chưa ai quét thử bằng app ngân hàng thật.** Tài khoản ngân hàng trong dữ liệu mẫu là bịa |
| API Gian hàng | **Chưa có** (mini-app Gian hàng chưa làm). Tour, sản phẩm, đơn, thanh toán, bài viết, bản tin, thời tiết, báo cáo vẫn do `MockHubRepository` phục vụ và có nhãn "Dữ liệu mẫu". Không bịa đường dẫn API |

## Chọn nguồn dữ liệu

Lúc dựng (`--dart-define`), mặc định là dữ liệu mẫu để bản demo chạy không cần mạng:

| Biến | Ý nghĩa |
| --- | --- |
| `HUB_USE_MOCK=true` (mặc định) | Mọi thứ do `MockHubRepository` phục vụ |
| `HUB_USE_MOCK=false` | Màn hình lõi đọc từ lõi thật; Gian hàng vẫn là mẫu. Bắt buộc có `HUB_API_BASE_URL`, thiếu thì app báo "Cấu hình chưa đúng" thay vì lặng lẽ dùng dữ liệu mẫu |
| `HUB_API_BASE_URL=https://...` | Địa chỉ gốc của cổng (APISIX). App gọi `POST {gốc}/api/data/graphql` |
| `HUB_DEV_TOKEN=...` | Token truy cập lấy từ stack phát triển, **chỉ được nhận trong bản debug** (bản release bỏ qua). Dùng thử bằng tay, không phải đăng nhập |
| `HUB_DEV_HOUSEHOLD_ID=...` | Chỉ cùng với `HUB_DEV_TOKEN` ở bản debug: mã hộ thật thay cho mã hộ bịa `hh-01` của tài khoản `farmer@demo.vn` |

```bash
flutter run --dart-define=HUB_USE_MOCK=false --dart-define=HUB_API_BASE_URL=https://gateway.example \
            --dart-define=HUB_DEV_TOKEN=<token của người dùng manager/officer/farmer>
```

Vai gửi lên Hasura (`x-hasura-role`) lấy từ tài khoản dùng thử đã đăng nhập (`manager`, `officer`, `farmer`) và phải là một vai có trong
token. Không có token thì màn hình lõi hiện "Phiên đăng nhập đã hết hạn hoặc chưa hợp lệ" kèm nút Thử lại, không gọi máy chủ.

## Dữ liệu lõi thật (chỉ đọc)

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

**Chỉ đọc, vì sao.** Trong metadata Hasura, ba vai này **không có quyền insert/update** và các đường ghi của web (`/api/journal`,
`/api/notifications`...) dùng phiên đăng nhập web, không nhận bearer token. Nên với bản thật: duyệt nhật ký, nông dân ghi nhật ký, đổi ngày
thu hái và đánh dấu đã đọc **chưa làm được trên app**; các nút đó được ẩn và có dòng "dùng bản web DX-OS". Ở chế độ mẫu các nút vẫn hoạt động.
Không bịa điểm ghi; cần quyết định phía lõi (mở API ghi chấp nhận bearer) trước.

Ở chế độ thật, các phần của tổng quan lấy từ Gian hàng/thị trường/thời tiết (khối "Gian hàng", "Chỉ số giá nông sản", thời tiết, lịch tham quan)
bị ẩn thay vì trộn số mẫu cạnh số thật.

## Nhãn "Dữ liệu mẫu"

Chip "Dữ liệu mẫu" ở đầu màn hình cho biết màn hình đó do `MockHubRepository` phục vụ: toàn bộ phần khách, các trang Gian hàng và công ty du lịch,
và cả các trang lõi khi chạy chế độ mẫu. Trang lõi chạy chế độ thật thì không có chip.

## Bước tiếp theo: đăng nhập Keycloak (chưa làm)

`AuthService.bearerToken()` là điểm cắm. Bản thật cần: Keycloak OIDC, luồng mã xác thực có PKCE, **client công khai `dxos-mobile`**, mở bằng trình
duyệt hệ thống, token cất trong kho an toàn của hệ điều hành và làm mới khi hết hạn, vai đọc từ token. Audience của token phải là `dx-os-core`
(Hasura từ chối token khác) và token cần claim `htx_code`. Client `dxos-mobile` **chưa có** trong `docker/keycloak/realm-agrimarket.json` (realm hiện chỉ có `nextjs-web`): phải thêm vào realm,
kèm mapper audience `dx-os-core` và claim `htx_code`, rồi mới đăng nhập được. Trong lúc đó chỉ có thể thử bằng `HUB_DEV_TOKEN` ở bản debug.

## Chưa kiểm chứng

**Chưa có lần gọi nào tới Hasura hay Keycloak thật.** Docker không chạy được trên máy dựng. Những gì đã kiểm tra là: truy vấn khớp metadata và
schema (thử nghiệm đối chiếu), cách ghép yêu cầu và ánh xạ lỗi với máy chủ giả, phân tích dữ liệu bằng JSON viết tay có hình dạng như Hasura trả
về (không ghi lại từ máy chủ thật). Chưa kiểm: Hasura chấp nhận đúng các truy vấn này với từng vai, giá trị `x-hasura-role`, định dạng ngày giờ
thật, CORS khi chạy trên web, quá thời gian và chứng chỉ TLS trên máy thật, hiệu năng với dữ liệu thật.

## Chưa làm trong khung sườn

Đăng nhập Keycloak, ghi dữ liệu lõi từ app, API Gian hàng, tạo/sửa tour, ngày khởi hành, sản phẩm và bài viết trong app HTX (chỉ xem, gửi duyệt),
đánh giá sau chuyến, lưu địa chỉ, chatbot, video, đồng bộ ngoại tuyến hai chiều (hiện chỉ đọc lại bản lưu), ảnh thật,
chạy thử trên máy ảo Android/iOS.
