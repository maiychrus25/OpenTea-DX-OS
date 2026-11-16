<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Định hướng — Một app Flutter nhiều vai (khách, nông dân, HTX, công ty du lịch)

> **Trạng thái:** Tài liệu định hướng (2026-11-16), chưa phải đặc tả chi tiết. Chủ dự án quyết các điểm ở §2.
> **Quan hệ:** sửa và bổ sung `docs/specs/2026-11-15-htx-storefront-app-direction.md` (nhánh `docs/htx-storefront-direction`). Chỗ nào hai tài liệu khác nhau thì tài liệu này thắng; chỗ không nhắc tới thì giữ nguyên bản kia.

## 1. Thay đổi so với bản ngày 2026-11-15

| Điểm | Bản 2026-11-15 | Bản này |
| --- | --- | --- |
| Công nghệ app di động | Kotlin, Jetpack Compose, chỉ Android | **Flutter (Dart), Android và iOS** |
| Người dùng app | Khách; trưởng HTX làm trên web | **Một app, năm vai** (§3); web DX-OS vẫn dùng song song |
| Khách | Không có tài khoản, tra đơn bằng mã | **Khách có tài khoản**; xem tự do, mua phải đăng nhập |
| Công ty du lịch | Không có | Có vai nhân viên công ty du lịch (§3) |

Giữ nguyên: mỗi HTX một gian, tiền vào thẳng HTX, thanh toán VietQR do trưởng HTX xác nhận, mini-app không chạy JavaScript, không dùng dịch vụ Google Play, thư viện phải có giấy phép OSI.

## 2. Quyết định của chủ dự án (2026-11-16)

1. App làm bằng **Flutter**, vì app đặt tour đã viết bằng Dart; một mã nguồn cho Android và iOS.
2. **Một app, nhiều phân quyền:** hợp tác xã, nông dân, khách hàng (đặt tour, mua hàng), nhân viên công ty du lịch.
3. **Khách có tài khoản** và dùng tài khoản để đặt tour và mua hàng.

## 3. Các vai

Màn đầu: "Xem với tư cách khách" hoặc "Đăng nhập" (Keycloak, PKCE). Sau đăng nhập app đọc vai trong token và mở giao diện của vai đó. Ẩn màn hình chỉ để gọn; quyền thật do máy chủ kiểm trên mỗi lệnh gọi.

| Vai | Vai trong Keycloak | Làm được |
| --- | --- | --- |
| Khách vãng lai | không có token | Xem tin, tour, sản phẩm, hỏi chatbot chung |
| Khách có tài khoản | `customer` (mới) | Đặt tour, mua hàng, thanh toán VietQR, xem đơn và vé trên nhiều máy, đánh giá, lưu địa chỉ |
| Nông dân | `farmer` | Lịch tham quan tại hộ mình, điểm danh, sản phẩm của hộ; chỉ dữ liệu hộ mình |
| Hợp tác xã | `manager` (và `officer` xem) | Tin, tour, ngày khởi hành, sản phẩm, đơn, lượt đặt, ghi khoản thu, báo cáo của HTX mình |
| Nhân viên công ty du lịch | vai mới (xem `2026-11-15-operator-and-articles-design.md`) | Tổng hợp các HTX được liên kết, chỉ đạo, duyệt bài, theo dõi đặt tour |

## 4. Việc phải làm ở nền tảng (tách PR nhỏ, cần ADR)

1. **Vai `customer`:** thêm vào Keycloak, cho tự đăng ký (xác thực email hoặc số điện thoại). Khách **không thuộc HTX nào**, token không có `htx_code`; phải rà mọi chỗ của lõi và mini-app đang dựa vào `htx_code` trước khi mở vai này.
2. **Mini-app nhận thêm vai** ngoài `farmer`, `officer`, `manager` (`app.yaml`, `./dxos validate`, gateway).
3. **Vai công ty du lịch:** hai vai mới và bảng liên kết công ty với HTX, `tenant_code` thay `htx_code` (ADR riêng). Các câu Q-OP-1..5 vẫn chờ chủ dự án chốt.
4. **Cô lập dữ liệu khách:** khách chỉ đọc và sửa đơn, vé, địa chỉ của chính mình; kiểm bằng thử nghiệm từ chối.
5. **Dữ liệu cá nhân:** chính sách lưu và xoá tài khoản (số điện thoại, địa chỉ).
6. Các việc nền cũ ở §6 bản 2026-11-15 (giới hạn truy cập công khai, proxy video, kho tệp, đường gọi mô hình) vẫn giữ.

## 5. App Flutter

- **Ràng buộc:** không dùng dịch vụ Google Play (không Firebase, không Google Maps SDK), thư viện có giấy phép OSI và ghim phiên bản, dựng bằng một lệnh, APK đính kèm bản phát hành.
- **iOS:** dựng bắt buộc trên Mac có Xcode; CI Linux của repo chỉ dựng APK. Chạy thử trên giả lập miễn phí; cài iPhone thật hoặc TestFlight cần tài khoản Apple Developer (khoảng 99 USD một năm), **chưa có quyết định**.
- **Cấu trúc đề xuất:** một lõi dùng chung (đăng nhập, gọi API, lưu trong máy, tiền, VietQR) và mỗi vai một nhóm màn hình; định tuyến theo vai trong token.
- **Mã sẵn có:** app đặt tour bằng Dart là điểm xuất phát; **em chưa đọc mã này** nên chưa đánh giá được mức dùng lại.

## 6. Mốc (điều chỉnh)

Hạn: ngừng thêm tính năng 02/12/2026, nộp bài 05/12/2026.

| Mốc | Nội dung |
| --- | --- |
| M0 | Nền tảng: giới hạn truy cập công khai, vai `customer`, mini-app nhận thêm vai |
| M1 | Mini-app Gian hàng: tour, sản phẩm, đơn, lượt đặt, VietQR, theo tài khoản khách |
| M2 | API JSON có xác thực cho khách và cho HTX |
| M3 | App Flutter: khách (xem, đặt, mua, thanh toán, đơn, vé) và HTX |
| M4 | Nông dân, nhân viên công ty du lịch trong app |
| M5 | Tin tức, rồi video |
| M6 | Chatbot |

Với 19 ngày còn lại, nên cắt phạm vi: M0–M3 là lõi, M4–M6 làm nếu còn thời gian.

## 7. Điểm còn mở

1. Có làm iOS bản cài thật không (tài khoản Apple Developer), hay chỉ giả lập.
2. Khách đăng ký bằng email hay số điện thoại; có cần xác thực.
3. Q-OP-1..5 của công ty du lịch.
4. `tea-experience` (PR #35) gộp riêng trước hay đưa vào app mới.
5. Phí giao hàng; chatbot dùng mô hình nào.
