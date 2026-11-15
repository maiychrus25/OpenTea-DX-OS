<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — App Android "Tour đồi chè" và API của tea-tour

> **Trạng thái:** Bản thiết kế (2026-11-15), chưa triển khai. Chủ dự án đã chốt: một app Android dùng chung cho khách và người của HTX. Chủ dự án cho phép triển khai mà không chờ duyệt thêm; bước gộp vào `main` và gắn tag vẫn hỏi lại.
> **Phạm vi:** đợt 2, milestone `v1.14.0`. Tiếp nối `docs/specs/2026-11-15-tea-tour-system-design.md` (đợt 1, gọi là "đặc tả web"): mọi quy tắc nghiệp vụ ở §7 của đặc tả web giữ nguyên và không lặp lại ở đây.
> **Căn cứ:** Khách đi đồi chè dùng điện thoại, sóng yếu; người dẫn tour cần quét vé tại điểm hẹn. Trang web không JavaScript không dùng được camera và không giữ được vé khi mất mạng.

## 1. Mục tiêu

1. Khách cài một app, chọn HTX, xem tour, đặt chỗ, thấy mã VietQR, giữ vé trong máy và mở được vé khi không có mạng. Không cần tài khoản.
2. Người dẫn tour và trưởng HTX đăng nhập bằng tài khoản DX-OS (Keycloak, cùng một danh tính với web), xem lịch và danh sách đoàn, quét mã QR của vé để điểm danh. Trưởng HTX còn xác nhận lượt đặt và ghi khoản thu.
3. App dựng được từ mã nguồn bằng một lệnh, chỉ dùng thư viện mã nguồn mở có giấy phép OSI, không dùng dịch vụ Google Play.
4. API là một phần của mini-app `tea-tour`; lõi chỉ thêm quy tắc chung cho mọi mini-app.

## 2. Ngoài phạm vi

- iOS; phát hành trên Google Play; ký bản phát hành bằng khoá riêng (bản đính kèm là bản debug, xem §8).
- Thông báo đẩy; điểm danh khi mất mạng (danh sách đoàn đã tải vẫn xem được, nhưng điểm danh cần mạng).
- Soạn tour, lịch khởi hành, cài đặt, báo cáo trong app: các việc này làm trên web.
- Liên kết mở thẳng app từ trình duyệt (App Links).

## 3. Các cách làm đã cân nhắc

| Cách | Nội dung | Vì sao chọn hoặc không |
| --- | --- | --- |
| **A (chọn)** | App gốc Kotlin + Jetpack Compose gọi API JSON của `tea-tour` qua proxy của web | Dùng được camera, lưu vé khi mất mạng, giao diện đúng chất app; máy phát triển đã có JDK 17, Android SDK 35 và Gradle. Giá phải trả: thêm một cây mã nguồn và một bước dựng trong CI |
| B | Bọc trang web của khách trong WebView hoặc TWA | Rẻ, nhưng trang không JavaScript trong WebView vẫn là trang web: không quét được vé, không có vé ngoại tuyến |
| C | Flutter hoặc React Native | Thêm một bộ công cụ chưa có trên máy và trong CI; không cần iOS nên không được lợi gì |

Đăng nhập: chọn OIDC chuẩn (Authorization Code + PKCE qua trình duyệt của máy) thay cho cách "ghép thiết bị bằng mã do app tự cấp", vì token do Keycloak cấp được cổng APISIX kiểm chữ ký, đối tượng và vai như mọi yêu cầu khác (Zero-Trust), còn mã tự cấp sẽ đi vòng qua cổng.

## 4. API của `tea-tour`

JSON UTF-8. Lỗi trả `{"error": {"code": "<MÃ>", "message": "<câu tiếng Việt>"}}` với mã HTTP 400, 404, 409 hoặc 422. Thời điểm là ISO 8601 có múi giờ. Tiền là số nguyên đồng. Mọi hàm xử lý gọi đúng lớp `store`/`domain` của đợt 1; không có quy tắc nghiệp vụ nào viết lại trong API.

### 4.1 Công khai — dưới `/apps/tea-tour/public/<htx>/api/v1`

| Phương thức và đường dẫn | Trả về |
| --- | --- |
| `GET /site` | Tên hiển thị, khẩu hiệu, giới thiệu, đường dây nóng, Zalo, địa chỉ, liên kết bản đồ, ảnh bìa, tỉ lệ cọc, số giờ giữ chỗ, hạn huỷ, chính sách, đã khai ngân hàng hay chưa |
| `GET /tours?category=&month=&sort=&page=` | Danh mục như trang `/tours` của web: mỗi tour có `slug`, tên, tóm tắt, loại, thời lượng, "giá từ", điểm sao và số đánh giá, ảnh bìa (`thumb`, `large`), chuyến gần nhất và số chỗ còn |
| `GET /tours/<slug>` | Chi tiết tour: mọi mục nội dung, danh sách ảnh, các chuyến sắp tới (id, ngày giờ, giá, số chỗ còn, tên người dẫn, đặt được hay không), đánh giá đã đăng |
| `POST /quote` | Nhận `departure_id`, `adults`, `children`; trả tổng tiền, tiền cọc, hạn giữ chỗ dự kiến. Không ghi gì |
| `POST /bookings` | Nhận `departure_id`, `adults`, `children`, `guest_name`, `phone`, `email`, `note`, `request_key`, `expected_total`. Tổng tiền khác `expected_total` thì trả 409 `PRICE_CHANGED` kèm báo giá mới. Thành công trả lượt đặt đầy đủ (mục dưới), `source = APP` |
| `GET /bookings/<code>?key=` | Lượt đặt: trạng thái, tình trạng thanh toán, tour và chuyến, số người, các khoản tiền, hạn giữ chỗ, quyền (huỷ được, đánh giá được), khối `payment` (số tiền phải trả lúc này, chuỗi VietQR, ngân hàng, số tài khoản, chủ tài khoản, nội dung) khi còn phải trả và HTX đã khai ngân hàng, `ticket_text` khi đã xác nhận, thông tin điểm danh |
| `POST /bookings/lookup` | Nhận `code`, `phone`; trả lượt đặt kèm `access_key` |
| `POST /bookings/<code>/paid`, `/cancel`, `/review` | Nhận `key` (và `rating`, `comment`, `display_name` cho đánh giá); trả lượt đặt sau thay đổi |
| `POST /inquiries` | Yêu cầu tour riêng |

Ảnh dùng lại đường dẫn `/public/<htx>/media/...` của đợt 1. Sai mã hoặc sai khoá trả cùng một lỗi 404 `NOT_FOUND`.

### 4.2 Có đăng nhập — dưới `/apps/tea-tour/api/v1` (vai `manager` và `farmer`)

| Phương thức và đường dẫn | Ai | Trả về |
| --- | --- | --- |
| `GET /me` | cả hai | Tên, vai, mã HTX |
| `GET /departures?scope=upcoming\|past&page=` | cả hai | Người dẫn: chuyến được giao cho mình. Trưởng HTX: mọi chuyến của HTX |
| `GET /departures/<id>` | cả hai | Chuyến và danh sách lượt `CONFIRMED`: tên khách, người lớn, trẻ em, ghi chú, còn phải thu, điểm danh. Trưởng HTX thấy thêm số điện thoại và các lượt `PENDING`; người dẫn thì không |
| `POST /checkin` | cả hai | Nhận `ticket_text` hoặc `code`, và `count` (không gửi là cả đoàn). Trả lượt đặt đã điểm danh. Lỗi: `NOT_FOUND`, `NOT_CONFIRMED`, `OUTSIDE_WINDOW`, `NOT_YOUR_DEPARTURE`, `ALREADY_CHECKED_IN` (kèm thời điểm và số người đã điểm danh) |
| `POST /bookings/<id>/undo-checkin` | cả hai | Bỏ điểm danh |
| `GET /todo` | trưởng HTX | Lượt chờ xác nhận, lượt khách báo đã chuyển khoản, lượt cần hoàn tiền |
| `POST /bookings/<id>/confirm` | trưởng HTX | Xác nhận |
| `POST /bookings/<id>/payments` | trưởng HTX | Nhận `amount_vnd`, `method`, `note`; ghi khoản thu |

Manifest thêm tiền tố có bảo vệ `/api/` cho hai vai. Cổng kiểm vai ở mức tiền tố; app kiểm lại từng đường dẫn (người dẫn gọi đường dẫn của trưởng HTX nhận 403).

### 4.3 Bộ mẫu hợp đồng

Kiểm thử của API ghi mỗi dạng phản hồi thành một tệp JSON mẫu trong `miniapps/tea-tour/tests/api_fixtures/`. App Android giữ bản chép của các tệp này làm dữ liệu kiểm thử giải mã; một lệnh kiểm trong `make lint` báo lỗi khi hai bên lệch nhau (cùng cách với `appkit-sync`).

## 5. Thay đổi ở lõi

1. **Proxy nhận token từ app di động.** Yêu cầu tới đường dẫn có bảo vệ mang `Authorization: Bearer <token>` thì proxy chuyển đúng token đó tới cổng, không đọc phiên đăng nhập của web. Mã HTX để kiểm app có bật cho HTX hay không lấy từ claim `htx_code` của token mà không kiểm chữ ký: giá trị này chỉ dùng để chọn dòng bật app, còn cổng vẫn kiểm chữ ký, đối tượng và vai trước khi app nhận yêu cầu. Token sai dạng trả 401. Trang "Phiên đăng nhập đã hết hạn" chỉ dành cho yêu cầu không có header này.
2. **Danh bạ HTX của một app:** `GET /api/apps/<id>/tenants` (công khai, dùng bộ đếm đọc công khai) trả các HTX đang bật app đó, gồm mã, tên và địa chỉ, chỉ khi app có đường dẫn công khai. App không tồn tại trả 404.
3. **Client Keycloak `dxos-mobile`:** client công khai, luồng Authorization Code, bắt buộc PKCE `S256`, không cấp bằng mật khẩu, địa chỉ quay về `vn.opentea.dxos.tour:/oauth2redirect`, cùng các scope mặc định với client của web (để token có đối tượng `dx-os-core`, claim `htx_code` và vai). Có trong tệp realm cho máy mới; `make mobile-client` thêm client vào realm đang chạy bằng `kcadm` trong container Keycloak, chạy lại không gây lỗi.
4. Trưởng HTX vẫn phải nhập mã TOTP: việc đó diễn ra trên trang đăng nhập của Keycloak trong trình duyệt của máy.
5. Phiên bản web thành `1.14.0`; `tea-tour` thành `1.1.0` với `requires.core: ">=1.14.0"`.

## 6. App Android

- **Vị trí và tên:** `apps/tour-android/`; mã ứng dụng `vn.opentea.dxos.tour`; tên hiển thị "Tour đồi chè"; giấy phép MIT.
- **Nền tảng:** Kotlin, Jetpack Compose (Material 3), một Activity, Navigation Compose, ViewModel với StateFlow. `minSdk 26`, `compileSdk` và `targetSdk 35`. Gradle wrapper nằm trong repo.
- **Thư viện** (đều Apache-2.0, không có dịch vụ Google Play): AndroidX và Compose, kotlinx.serialization, kotlinx.coroutines, OkHttp, Coil (ảnh), AppAuth-Android (OIDC + PKCE), ZXing `core` (dựng và giải mã QR), CameraX (camera), DataStore (lưu vé và cài đặt). Kiểm thử: JUnit, Robolectric, Roborazzi (ảnh màn hình trên JVM), MockWebServer.
- **Kiến trúc:** ba lớp trong một module: `data` (client API, kho vé cục bộ, phiên đăng nhập), `domain` (mô hình và vài quy tắc hiển thị), `ui` (màn hình theo tính năng). Phụ thuộc truyền qua hàm tạo; không dùng khung DI.

### 6.1 Màn hình

| Nhóm | Màn hình |
| --- | --- |
| Mở đầu | Chọn HTX từ danh bạ của máy chủ; địa chỉ máy chủ sửa được trong Cài đặt (mặc định lấy từ cấu hình lúc dựng) |
| Khách | Trang chủ (ảnh bìa, tour nổi bật, liên hệ); Danh sách tour (lọc loại, tháng, sắp xếp); Chi tiết tour (ảnh vuốt ngang, lịch trình, chuyến, đánh giá); Đặt chỗ (chọn chuyến, số người, thông tin); Xem lại (báo giá từ máy chủ); Lượt đặt (trạng thái, mã VietQR dựng trong app, sao chép số tài khoản và nội dung, "Tôi đã chuyển khoản", huỷ, đánh giá); Vé của tôi (các lượt đã lưu trong máy); Vé (mã QR lớn, tăng độ sáng màn hình); Tra cứu (mã và số điện thoại, để đưa một lượt đặt trên web vào app); Yêu cầu tour riêng |
| HTX | Đăng nhập; Lịch của tôi (sắp tới, đã qua); Chuyến (danh sách đoàn, số đã điểm danh); Quét vé (camera, kết quả hiện tên khách, số người, còn phải thu, nút điểm danh; nhập mã bằng tay); Việc cần làm của trưởng HTX (xác nhận, ghi khoản thu) |
| Chung | Cài đặt (máy chủ, HTX, giao diện sáng/tối/theo máy, đăng xuất, giấy phép mã nguồn mở) |

### 6.2 Quy tắc

1. Vé và lượt đặt đã mở được lưu trong máy (mã, khoá truy cập, bản JSON gần nhất): màn hình Vé mở được khi mất mạng và ghi rõ dữ liệu được cập nhật lúc nào.
2. Khoá truy cập của lượt đặt và token đăng nhập không ghi vào log; token lưu bằng kho lưu được mã hoá của AppAuth/Android Keystore.
3. Mọi lời gọi có ba trạng thái hiển thị: đang tải, lỗi (kèm nút thử lại và câu lỗi của máy chủ), trống.
4. Token hết hạn thì app làm mới bằng refresh token; không làm mới được thì đưa về màn hình đăng nhập, không mất dữ liệu của khách.
5. Bản debug cho phép HTTP không mã hoá (máy chủ thử nghiệm trong mạng nội bộ); bản release chỉ cho HTTPS.
6. Giao diện theo màu và phông của `DESIGN.md` (xanh chè, Be Vietnam Pro đóng gói trong app), sáng và tối, cỡ chữ theo cài đặt của máy, vùng chạm tối thiểu 48 dp, có nhãn cho trình đọc màn hình.
7. Toàn bộ chữ trong app là tiếng Việt, nằm trong `strings.xml`.

## 7. Kiểm thử và nghiệm thu

- **pytest của `tea-tour`:** mỗi đường dẫn API có ca thành công và ca từ chối; người dẫn không nhận được số điện thoại ở bất kỳ phản hồi nào; người dẫn gọi đường dẫn của trưởng HTX nhận 403; cách ly giữa các HTX; bộ mẫu hợp đồng được sinh ra.
- **jest của web:** proxy với `Authorization` (token được chuyển nguyên vẹn, claim hỏng trả 401, app chưa bật cho HTX trả 404, không đọc phiên của web); danh bạ HTX.
- **Realm:** `test_realm_policy.py` thêm kiểm tra client `dxos-mobile` (công khai, PKCE `S256`, không cấp bằng mật khẩu, đủ scope).
- **App:** kiểm thử JVM cho giải mã JSON trên bộ mẫu hợp đồng, ViewModel với API giả (đặt chỗ, `PRICE_CHANGED`, điểm danh và các lỗi của nó), kho vé cục bộ, phân tích `ticket_text`; ảnh màn hình Roborazzi của các màn hình chính, sáng và tối.
- **Đầu cuối:** trên stack sạch có `tea-tour`, chạy app trong máy ảo Android của máy phát triển (đã có ảnh hệ thống) với `adb reverse` cho cổng web và Keycloak: khách đặt chỗ, trưởng HTX ghi khoản thu trên web, vé hiện trong app, người dẫn đăng nhập và điểm danh bằng nhập mã. Quét bằng camera thật không kiểm được trong máy ảo: ghi là giới hạn và nhờ chủ dự án thử trên điện thoại.
- **Không thoái lui:** mọi bộ kiểm của `v1.13.0` giữ nguyên số lượng và đều qua.

## 8. Dựng, CI và phát hành

- Dựng từ mã nguồn: `cd apps/tour-android && ./gradlew assembleDebug` (cần JDK 17 và Android SDK 35); ghi trong README. `make android-build` và `make android-test` gọi đúng các lệnh đó.
- CI thêm job `android`: kiểm tệp Gradle wrapper, chạy kiểm thử JVM, dựng APK debug, tải APK và ảnh màn hình lên làm artifact.
- Luồng phát hành đính kèm `opentea-tour-<phiên bản>-debug.apk` và mã băm vào GitHub Release. Bản debug cài được trên điện thoại để thử nhưng không phải bản ký chính thức; ghi rõ trong ghi chú phát hành.
- `DEPENDENCIES.md` thêm mục Android: từng thư viện, phiên bản, giấy phép.

## 9. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Phiên bản AGP, Kotlin, Compose trong trí nhớ của người thiết kế đã cũ | Người triển khai tra tài liệu chính thức và chọn bộ phiên bản ổn định mới nhất tương thích với nhau, ghi vào `gradle/libs.versions.toml` |
| `iss` của token không khớp khi điện thoại gọi Keycloak bằng địa chỉ khác | Máy ảo và máy cắm USB dùng `adb reverse` để `localhost` trỏ về máy phát triển; máy chủ demo đặt `KC_HOSTNAME_URL` đúng địa chỉ công khai; ghi trong README |
| Job Android làm CI chậm và có thể hỏng vì mạng | Job riêng, có bộ đệm Gradle; không chặn các job khác |
| Máy ảo Android tốn bộ nhớ trên máy 16 GB | Chỉ chạy một lần ở bước nghiệm thu, không cửa sổ, tắt các nhóm dịch vụ tuỳ chọn trước, tắt máy ảo ngay sau đó |
| Proxy nhận token từ ngoài mở thêm bề mặt | Token chỉ được chuyển tiếp, không được tin: cổng kiểm chữ ký, đối tượng và vai; kiểm thử phủ token giả và token của HTX chưa bật app |
