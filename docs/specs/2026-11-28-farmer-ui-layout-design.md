<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->

# Chỉnh bố cục giao diện nông hộ

**Ngày:** 2026-11-28. **Phạm vi:** `apps/web`, chỉ tài khoản nông hộ.

## 1. Mục tiêu

Trình bày lại các màn hình nông hộ theo bộ thiết kế 15 màn hình (PDF `OpenTea_DX-OS_15_giao_dien_HiFi`), trên bản 1.22.0 đang phát triển.

## 2. Nguyên tắc: bám bộ thiết kế về bố cục, giữ mã làm chuẩn về nghiệp vụ

Bộ thiết kế là chuẩn trình bày, làm sát từng trang. Bộ thiết kế được dựng từ mô tả, không có ảnh hiện trạng, nên không đổi API, dữ liệu, quyền, luồng nghiệp vụ, màu hay phông theo nó.

Theo bộ thiết kế, trang Tổng quan bỏ thẻ Cẩm nang và bảng "Lịch thu hái sắp tới" (đã có trong menu); ảnh bìa còn hai nút Ghi nhật ký và Xem lịch thu hái. Thẻ ứng dụng "Vật tư mua chung" vẫn hiện khi đã cài. Sổ tiền bỏ ba thẻ chuyển, hiện cả ba khối cùng lúc.

Vẫn giữ: nút "Nghe", dự báo thời tiết, đồng ý hoặc tắt tin Zalo, kết nối Telegram, đổi vai, ghi khi mất mạng.

Không làm theo thiết kế ở các chỗ sau:

- Ô tìm kiếm trên thanh trên: nông hộ không được tìm kiếm toàn hợp tác xã.
- Mục "Tài khoản" trong thanh bên: vẫn mở từ menu tài khoản.
- Các ô "Tên thuốc, Liều lượng, Lượng nước, Thời gian cách ly" gõ tay: giữ `PesticidePicker`, mức cách ly sàn và các trường hiện có của từng hoạt động.
- Nút "Đổi mật khẩu", nhiều ảnh minh chứng, ô tìm nhật ký, ảnh trong bản tin, ảnh lịch sử chẩn đoán: chỉ hiện khi mã hiện tại đã có.
- Mọi tên người, số tiền, giá, ngày, tên phẩm cấp và ảnh trong thiết kế là minh họa.

Bổ sung dữ liệu đã có sẵn mà bộ thiết kế không vẽ (chỉ đọc, không đổi API): phiếu cân có phẩm cấp, đơn giá, kg gộp và phần trăm trừ; Sổ tiền có "Lịch sử ghi sổ"; Tổng quan có thẻ "Tiền búp của tôi" (số dư và ba phiếu gần nhất chưa quyết toán); chi tiết nhật ký có sản lượng búp tươi.

Bù ba chỗ lệch với các đợt trước: nút "Nghe ngày hái" ở Tổng quan (spec GĐ4 §3.6), khối thời tiết ở trang Bản tin, tên lứa trên phiếu cân (phản hồi `/api/ledger/mine` và phiếu cân thêm trường `cycle_season`, không đổi trường cũ). Tên lứa trên nhật ký chưa làm vì danh sách đọc qua Hasura, cần đổi metadata nền tảng.

## 3. Thay đổi

| Đợt | Màn hình | Việc chính |
|---|---|---|
| A | Tổng quan, Sổ tiền, thanh dưới | Điện thoại: ảnh bìa và thời tiết đứng trước giá búp (sửa lỗi thẻ giá nằm trên cùng); giá các phẩm cấp thành cột ngang; thanh dưới là Tổng quan, Nhật ký, Chẩn đoán, Sổ tiền, thứ tự thanh bên giữ nguyên. Sổ tiền: số dư nổi bật, phiếu cân thành bảng rõ cột, vừa 390px. |
| B | Nhật ký, Ghi nhật ký, Lịch thu hái | Danh sách và chi tiết song song; ô hoạt động dễ bấm; form chia khối. Lịch đủ 7 cột ở 390px, không cuộn ngang. |
| C | Chẩn đoán, Cẩm nang, Bản tin, Thông báo, Tài khoản | Bố cục thẻ và cột theo thiết kế, trạng thái trống gọn. |

## 4. Rủi ro và hoàn tác

- Component dùng chung với vai khác (thanh dưới, khung ứng dụng, thông báo, lịch): thay đổi phải giới hạn ở vai nông hộ.
- Hoàn tác: mỗi đợt là một commit riêng, `git revert` được từng đợt.

## 5. Kiểm tra

`npm run lint`, `npx tsc --noEmit`, `npx jest`, `npm run build`; xem hai vòng ở 1440×900 và 390px, sáng và tối.
