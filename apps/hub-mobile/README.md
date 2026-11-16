<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Về Xứ Chè — app di động gian hàng HTX (`hub-mobile`)

Một app Flutter (Dart) cho Android và iOS, nhiều vai trong một mã nguồn. Đây là **khung sườn (skeleton) mốc M3** theo
`docs/specs/2026-11-16-multirole-app-direction.md` (nhánh `docs/37-multirole-app-direction`) và
`docs/specs/2026-11-15-htx-storefront-app-direction.md` (nhánh `docs/htx-storefront-direction`). Hai tài liệu đó là nguồn
sự thật; chỗ khác nhau thì bản 2026-11-16 thắng.

> **Trạng thái:** chạy trên **dữ liệu mẫu trong bộ nhớ** và **tài khoản dùng thử**. Chưa nối máy chủ, chưa đăng nhập Keycloak.

## Năm vai

| Vai | Vào bằng | Giao diện (`lib/features/...`) |
| --- | --- | --- |
| Khách vãng lai | "Xem với tư cách khách" | `customer`: tin tức, tour, sản phẩm, giỏ hàng. Thanh toán, đặt tour, đơn, vé yêu cầu đăng nhập |
| Khách có tài khoản (`customer`) | Đăng nhập | `customer`: đặt tour, mua hàng, thanh toán VietQR, đơn và vé lưu trong máy |
| Nông dân (`farmer`) | Đăng nhập | `farmer`: lịch tham quan tại hộ mình, điểm danh, sản phẩm của hộ |
| HTX (`manager`; `officer` chỉ xem) | Đăng nhập | `manager`: tổng quan, đơn, lượt đặt, xác nhận thu tiền, tin tức, sổ thu |
| Công ty du lịch (`operator`) | Đăng nhập | `operator`: tổng quan các HTX liên kết, duyệt bài, theo dõi đặt tour |

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
Manifest Android chưa xin quyền `INTERNET` vì bản mẫu chưa gọi mạng; thêm cùng với ứng dụng khách API thật.

## Cấu trúc

```
lib/
  core/      theme, router, role (vai và claims), money, format, vietqr (có thử nghiệm đơn vị)
  data/      hub_repository.dart (giao diện), mock_hub_repository.dart + seed_data.dart (dữ liệu mẫu),
             auth_service.dart (giao diện), demo_auth_service.dart, local_store.dart (lưu trong máy), models/
  app/       AppState (phiên), CartController, ActivityController (đơn và vé), HubApp
  features/  auth, customer, farmer, manager, operator, common
  shared/    widget dùng chung
test/        thử nghiệm đơn vị và widget (money, VietQR, vai/định tuyến, giỏ hàng, trạng thái đơn, lưu trong máy, luồng màn hình)
```

Quy ước: tên trong mã bằng tiếng Anh, chữ hiển thị bằng tiếng Việt, tệp mới có header SPDX.

## Thật và giả

| Phần | Hiện tại |
| --- | --- |
| Dữ liệu (tour, sản phẩm, đơn, lượt đặt, bài viết, sổ thu) | **Giả**: `MockHubRepository` trong bộ nhớ, mất khi tắt app. Quy tắc (tồn kho, chỗ trống, chuyển trạng thái, sổ thu chỉ thêm) viết theo hướng dẫn nhưng máy chủ mới là nơi giữ quy tắc thật |
| Đăng nhập | **Giả**: `DemoAuthService`, tài khoản cố định. Bản thật dùng **Keycloak OIDC, luồng mã xác thực có PKCE, client công khai `dxos-mobile`**, mở bằng trình duyệt hệ thống, token cất trong kho an toàn của hệ điều hành (chưa làm). Phiên dùng thử lưu trong `shared_preferences` |
| Giỏ hàng, đơn và vé của khách | **Thật** (lưu trong máy bằng `shared_preferences`, mở được khi mất mạng). Khi có mạng, danh sách từ máy chủ ghi đè bản cùng `id` trong máy, mục chỉ có trong máy được giữ lại |
| Mã VietQR | **Thật** về cấu trúc và CRC (cùng thuật toán và vectơ với `tea-tour`). **Chưa ai quét thử bằng app ngân hàng thật.** Tài khoản ngân hàng trong dữ liệu mẫu là bịa |
| API máy chủ | **Chưa có.** Khách API thật sẽ cắm sau `HubRepository`; địa chỉ gốc là `HUB_API_BASE_URL` (TODO trong `lib/main.dart`). Không bịa đường dẫn API trước khi có mốc M2 |

## Chưa làm trong khung sườn

Đăng nhập Keycloak, API thật, tạo/sửa tour, ngày khởi hành, sản phẩm và bài viết trong app HTX (chỉ xem, gửi duyệt),
đánh giá sau chuyến, lưu địa chỉ, chatbot, video, đồng bộ ngoại tuyến hai chiều (hiện chỉ đọc lại bản lưu), ảnh thật,
chạy thử trên máy ảo Android/iOS.
