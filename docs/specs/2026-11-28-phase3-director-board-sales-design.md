<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ3: Bảng điều hành Giám đốc, Bán hàng gắn lô và Báo cáo vụ/năm

> **Trạng thái:** Bản nháp (2026-11-28), chờ chủ dự án chọn ở §7 trước khi viết kế hoạch. Nhánh `feat/phase3-director-sales`, tách từ `feat/phase2-processing-qr`.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §5 GĐ3, §6 (vai `manager`, `accountant`, khách mua), §7 KPI "kiểm tra hàng – tiền – rủi ro mỗi sáng < 60 giây trên 1 màn hình"; §3 `[D]` (dữ liệu chuỗi giá trị đi qua lõi, không giữ bảng cô lập).

## 1. Mục đích

Hết GĐ2, HTX đã có đủ dữ liệu thật về búp tươi, giá ngày, tiền xã viên, tồn chè khô và lô QR. Nhưng trưởng HTX vẫn phải mở sáu màn hình để biết sáng nay có gì.

GĐ3 làm ba việc:
1. một màn hình trả lời 6 câu hỏi buổi sáng;
2. bán hàng (sỉ và lẻ) trừ thẳng vào tồn của từng lô, kèm công nợ của thương lái;
3. báo cáo vụ/năm in được cho Đại hội thành viên.

## 2. Hiện trạng (khảo sát 2026-11-28)

- `/manager/dashboard` có:
  - diện tích và sản lượng dự kiến;
  - số nhật ký chờ duyệt, số lô `READY`;
  - bảng trạng thái thửa;
  - một ô "Chỉ số giá" lấy từ `market_data` (giá chè thế giới).

  Trang này không đọc phiếu cân, giá ngày, sổ cái, mẻ sao hay tồn.
- Mini-app `htx-dashboard` 0.3.1 vẽ nhiều biểu đồ từ Hasura (thửa, nhật ký, lô cũ, cảm biến, bệnh, AI) và mở trong khung iframe tại `/manager/apps/htx-dashboard`. Mini-app này không biết gì về dữ liệu GĐ1–GĐ2.
- `/accountant/dashboard` mới chỉ là một trang trống.
- Mini-app `tea-shop` 0.3.0 có schema riêng `app_tea_shop`:
  - `products.lot_code` là chữ tự gõ, tồn tính bằng số gói và sửa tay;
  - `order_items` không trỏ tới lô;
  - đơn không có trạng thái thanh toán;
  - không gọi lõi.
- `partners` (BUYER, MIDDLEMAN, WAREHOUSE) đã tách theo HTX nhưng không gắn với đơn hay tiền. Lô chỉ có `buyer_name` và `destination` dạng chữ.
- Chưa có báo cáo vụ hay năm. Có các tệp CSV rời: phiếu cân, phiếu ứng, đơn tea-shop, các tab của htx-dashboard.

## 3. Dự án con

### S7 — Bảng điều hành Giám đốc (làm được ngay, không cần quyết thêm)

`/manager/dashboard` trở thành màn hình duy nhất buổi sáng. Phía server có một use case `DirectorBoardUseCase.read(htxProfileId, today)` trả 6 khối. Mỗi khối hỏng riêng (có trạng thái lỗi riêng), không làm hỏng cả trang.

| # | Câu hỏi | Nguồn | Hiển thị | Bấm vào |
|---|---|---|---|---|
| 1 | Hôm nay thu bao nhiêu búp? | `fresh_leaf_tickets` VALID trong ngày Việt Nam | kg tịnh, thành tiền, số phiếu, so với hôm qua | `/manager/leaf-tickets` |
| 2 | Giá thu mua hôm nay? | `daily_leaf_prices` hôm nay theo phẩm cấp | giá từng phẩm cấp; chưa công bố thì hiện nút "Công bố giá hôm nay" | `/manager/leaf-prices` |
| 3 | Phải trả xã viên bao nhiêu? | dòng quyết toán đã chốt chưa trả + phiếu cân chưa quyết toán − phiếu ứng chưa quyết toán, toàn HTX | ba số tách riêng và tổng | `/manager/settlements` |
| 4 | Tồn chè khô theo hạng? | `processing_batch_outputs.kg − Σ lot_batch_sources.kg` của mẻ đã hoàn thành, gộp theo 5 hạng | kg từng hạng | `/manager/processing` |
| 5 | Thương lái còn nợ bao nhiêu? | S8 | tổng phải thu, số đơn quá hạn; trước khi có S8 thì "Chưa có đơn bán sỉ" | S8 |
| 6 | Có gì đỏ? | xem dưới bảng | danh sách cảnh báo có đường dẫn | từng mục |

Cảnh báo đỏ (khối 6):
- nương đang trong thời gian cách ly (quy tắc (a) với D = hôm nay);
- mẻ lệch khoảng chuẩn trong 30 ngày;
- mẻ còn mở quá 2 ngày;
- tồn chè khô quá 60 ngày;
- kỳ quyết toán còn nháp;
- dòng quyết toán chưa trả quá 7 ngày;
- giá hôm nay chưa công bố sau 7 giờ sáng;
- sau khi có S8: đơn sỉ quá hạn thanh toán.

Trang không còn:
- ô "Chỉ số giá" `market_data` (chuyển xuống một liên kết "Giá chè thế giới" ở cuối trang);
- các ô diện tích và sản lượng dự kiến (chuyển sang tab "Phân tích").

`htx-dashboard` không gộp mã: nó là tab "Phân tích chi tiết" có liên kết từ bảng, không còn là trang chủ thứ hai.

Kế toán cũng có bảng: `/accountant/dashboard` dùng khối 1, 2, 3 và các cảnh báo về tiền (thay cho trang trống).

KPI: một lần tải dưới 1 giây trên dữ liệu mẫu của một HTX. Đo bằng test hiệu năng của use case trên Postgres thật, với 50.000 phiếu cân.

### S8 — Bán hàng gắn lô và công nợ thương lái (cần quyết §7.1–§7.3)

Mục tiêu:
- mỗi dòng bán (sỉ hoặc lẻ) trỏ tới một lô `QR_EXPORTED`;
- tồn của lô = khối lượng lô − tổng kg đã bán, không bán quá tồn;
- đơn sỉ gắn với một `Partner` của HTX, có hạn thanh toán, có các lần thu tiền;
- công nợ = tổng đơn − tổng đã thu.

Dữ liệu đề xuất (lõi):
- `sales_orders`: `partner_id`, `kind` WHOLESALE|RETAIL, số đơn, ngày, hạn thanh toán, trạng thái;
- `sales_order_lines`: `lot_id`, kg, đơn giá, thành tiền;
- `sales_payments`: số tiền, ngày, phương thức, người ghi, chỉ thêm dòng.

Mọi bảng đều có trigger kiểm toán. Chữ ký người: chỉ trưởng HTX hoặc kế toán ghi thu tiền; giảm giá và xoá nợ cần trưởng HTX.

### S9 — Báo cáo vụ/năm cho Đại hội thành viên (làm sau S7, phần bán hàng chờ S8)

- Trang `/manager/reports/[period]`, với kỳ là một vụ (theo `season_label`) hoặc một năm dương lịch, đọc trực tiếp từ dữ liệu. Các phần:
  - thành viên và diện tích;
  - búp tươi thu mua theo tháng (kg, tiền);
  - đã trả xã viên và nợ vật tư;
  - chế biến (số mẻ, tỷ lệ bình quân, số mẻ lệch);
  - lô và chứng nhận;
  - bán hàng và công nợ (sau S8);
  - an toàn cách ly (số lần bị chặn ở bàn cân nếu có ghi log, số phiếu phun).
- In ra bằng trang HTML đúng khổ A4, trình duyệt "Lưu thành PDF" như tem của GĐ2. Có thêm CSV cho từng bảng.

## 4. Thứ tự đề xuất

1. S7 trước: dùng dữ liệu đã có, chỉ đọc, ít rủi ro, trả lời ngay KPI 60 giây.
2. S9 phần không bán hàng.
3. S8 sau khi anh chọn ở §7.
4. S9 phần bán hàng.

## 5. Ràng buộc

- Như GĐ1–GĐ2: số tiền là BigInt, kg là số nguyên phần mười, ngày là ngày Việt Nam.
- Không thêm phụ thuộc.
- Mọi route theo mẫu `withErrorHandler` + zod + `requireTenant`.
- Không gửi số tài khoản hay tên xã viên ra trang công khai.

## 6. Kiểm chứng

- S7:
  - test use case cho từng khối và từng cảnh báo;
  - test hiệu năng trên Postgres;
  - hai vòng giao diện (desktop, mobile, sáng, tối);
  - đo thời gian tải trang.
- S8:
  - test tranh chấp trên Postgres (hai đơn cùng lấy tồn một lô; thu tiền song song);
  - bất biến: công nợ = Σ đơn − Σ thu.
- S9: so số liệu báo cáo với tổng của từng bảng nguồn.

## 7. Cần chủ dự án quyết

1. **Bán sỉ đặt ở đâu?**
   - **(Khuyến nghị) Lõi:** bảng `sales_*` trong lõi và màn hình "Bán hàng" cho trưởng HTX và kế toán. Lý do: đây là tiền và tồn của lô, nên theo §3 `[D]` của lộ trình phải nằm trong lõi có kiểm toán.
   - Hoặc mở rộng mini-app `tea-shop`.
2. **Bán lẻ của `tea-shop` nối với lô thế nào?**
   - **(Khuyến nghị)** `tea-shop` giữ gian hàng lẻ. Mỗi sản phẩm chọn một lô `QR_EXPORTED` của HTX qua Core Action API. Mỗi đơn lẻ đã xác nhận gọi lõi để trừ tồn lô, và lõi ghi một `sales_order` loại RETAIL. Như vậy tồn lô chỉ có một chỗ.
   - Hoặc để `tea-shop` giữ tồn riêng và chỉ lưu `lot_code`: dễ hơn nhưng tồn lô sai khi bán cả sỉ lẫn lẻ.
3. **Hạn thanh toán và nhắc nợ:**
   - mặc định 30 ngày, sửa được theo đơn;
   - nhắc nợ chỉ hiện trên bảng điều hành, không tự gửi tin cho thương lái, vì đó là kênh Zalo ở GĐ4.
4. **Bảng điều hành thay hẳn trang chủ hiện tại** (bỏ ô giá thế giới và các ô diện tích ở đầu trang) theo bảng vai §6 của lộ trình. Anh đồng ý thì em làm S7 ngay.
