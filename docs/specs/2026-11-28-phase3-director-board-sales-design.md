<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ3: Bảng điều hành Giám đốc, Bán hàng gắn lô và Báo cáo vụ/năm

> **Trạng thái:** Đã triển khai trên nhánh `feat/phase3-director-sales` (2026-11-28), chưa phát hành. Đã duyệt 2026-11-28; chủ dự án chốt cả bốn mục §7 theo khuyến nghị (§8). Khác biệt giữa thiết kế và mã nằm ở "Ghi chú sau triển khai" cuối tài liệu.
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

### S8 — Bán hàng gắn lô và công nợ thương lái

**Dữ liệu trong lõi** (migration `20261128170000_sales`, cả ba bảng có trigger kiểm toán `dxos_audit_row`):

- `sales_orders`:
  - `id`, `htx_profile_id`;
  - `order_no` (duy nhất), dạng `{HTX}-DH-YYYYMMDD-NNN`, đánh số dưới khoá tư vấn;
  - `kind` WHOLESALE|RETAIL;
  - `source` CORE|TEA_SHOP, kèm `external_ref` (mã đơn của tea-shop). (`htx_profile_id`, `source`, `external_ref`) là duy nhất, để gửi lại không tạo đơn thứ hai;
  - `partner_id` (bắt buộc với WHOLESALE, cùng HTX), `customer_name` (lẻ, tuỳ chọn);
  - `ordered_on DATE`;
  - `due_on DATE`: WHOLESALE mặc định `ordered_on + 30`, sửa được; RETAIL để rỗng;
  - `status` CONFIRMED|CANCELLED, `total_vnd BIGINT`, `note`;
  - `created_by_id`, `created_at`, `cancelled_by_id`, `cancelled_at`, `cancel_reason`.
- `sales_order_lines`:
  - `id`, `order_id`, `lot_id`;
  - `net_g INT > 0`: khối lượng bán tính bằng **gam**, để quy đổi chính xác cả gói 250 g;
  - `pack_count`, `pack_net_g`: cùng có hoặc cùng rỗng. Khi có thì `net_g = pack_count × pack_net_g`;
  - `price_vnd_per_kg` (sỉ), `amount_vnd BIGINT ≥ 0`.
- `sales_payments`:
  - `id`, `order_id`, `amount_vnd > 0`, `paid_on DATE`, `method` TRANSFER|CASH, `ref`, `created_by_id`, `created_at`;
  - chỉ thêm dòng: trigger chặn UPDATE, DELETE, TRUNCATE.

**Tồn của lô (một chỗ duy nhất):**
- Lô bán được khi `status = QR_EXPORTED`, cùng HTX, và có khối lượng: `total_weight_kg ?? actual_weight_kg ?? estimated_weight_kg`.
- Sức chứa = khối lượng đó × 1000 g (làm tròn tới gam).
- Còn lại = sức chứa − Σ `net_g` của các dòng thuộc đơn CONFIRMED. Huỷ đơn thì phần đã bán tự quay về tồn.

**Quy tắc:**
1. Tạo đơn trong một giao dịch:
   - khoá các lô theo thứ tự id;
   - mỗi lô phải còn đủ, nếu không thì trả 409 `LOT_STOCK_SHORT` kèm số gam còn lại của từng lô;
   - lô không bán được thì trả 422 `LOT_NOT_SELLABLE`.
2. Thành tiền dòng sỉ = `price_vnd_per_kg × net_g / 1000`, làm tròn nửa lên tới đồng. Dòng lẻ lấy `amount_vnd` do tea-shop gửi (giá gói × số gói, sau khuyến mãi). `total_vnd` = Σ dòng.
3. Thu tiền:
   - chỉ với đơn CONFIRMED;
   - tổng đã thu không vượt `total_vnd`, nếu vượt thì trả 409 `OVERPAYMENT`;
   - ghi dưới khoá dòng đơn.
4. Huỷ đơn:
   - chỉ trưởng HTX huỷ được, và phải có lý do;
   - đơn đã có thu tiền thì không huỷ được (409 `ORDER_HAS_PAYMENTS`).
5. Đổi hạn thanh toán: trưởng HTX hoặc kế toán, khi đơn sỉ còn nợ.
6. Công nợ thương lái chỉ tính trên đơn WHOLESALE CONFIRMED: phải thu = `total_vnd − Σ thu`. Quá hạn khi `due_on < hôm nay` và còn phải thu. Đơn lẻ của tea-shop thanh toán khi giao hàng nên không vào công nợ.
7. Quyền: trưởng HTX và kế toán tạo đơn sỉ, ghi thu, xem công nợ; chỉ trưởng HTX huỷ.

**Bảng điều hành:**
- Khối 5 hiện tổng phải thu, số đơn và số tiền quá hạn, và 3 thương lái nợ nhiều nhất.
- Thêm cảnh báo `ORDERS_OVERDUE`: "{n} đơn bán sỉ quá hạn thanh toán" → `/manager/sales?overdue=1`.
- Không gửi tin ra ngoài.

**tea-shop 0.4.0 nối với lõi (Core Action API):**
- APISIX thêm route nội bộ `/api/internal/apps/*` chỉ trên cổng 9081 (mạng của mini-app):
  - kiểm token người dùng (openid-connect) rồi gắn `X-Dxos-Gateway`;
  - web kiểm lại bearer qua Keycloak và lấy HTX, vai từ token, như mẫu `internal-staff`.
- Sản phẩm thêm `lot_id` (lô của lõi) và `pack_net_g` (trọng lượng tịnh mỗi gói, gam). Cả hai bắt buộc khi gắn lô. Lô chọn từ `GET /api/internal/apps/sales/sellable-lots`.
- Khi trưởng HTX bấm xác nhận đơn (NEW → CONFIRMED), tea-shop gọi `POST /api/internal/apps/sales/retail-orders`, gửi `external_ref` = mã đơn tea-shop, mỗi dòng có lô, số gói, gam/gói và thành tiền, kèm token của chính người bấm.
  - Lõi trả 409 `LOT_STOCK_SHORT` thì không xác nhận, và báo "Lô … chỉ còn … kg".
  - Lõi không trả lời thì cũng không xác nhận, và báo thử lại.
- Huỷ một đơn đã xác nhận thì gọi `POST /api/internal/apps/sales/retail-orders/{external_ref}/cancel`.
- Số gói tồn riêng của tea-shop vẫn là giới hạn của gian hàng, còn kg của lô chỉ nằm trong lõi.

### S9 — Báo cáo vụ/năm cho Đại hội thành viên

- Kỳ báo cáo là một năm dương lịch hoặc một khoảng ngày tự chọn (một vụ). Trang `/manager/reports` cho chọn kỳ. Trang `/manager/reports/view?from=&to=` dựng báo cáo khổ A4 để in hoặc "Lưu thành PDF" bằng trình duyệt. Kế toán xem được báo cáo.
- `SeasonReportUseCase.read(htxProfileId, from, to)` trả 7 phần, mọi số đều tính thẳng từ dữ liệu:
  1. Thành viên: số hộ, số thửa, diện tích.
  2. Thu mua búp: theo tháng (kg tịnh, tiền, số phiếu) và theo phẩm cấp.
  3. Tiền xã viên: số kỳ đã chốt, đã chi trả, còn phải trả cuối kỳ, vật tư đã ứng.
  4. Chế biến: số mẻ, kg tươi vào, kg khô ra, tỷ lệ bình quân, số mẻ lệch, kg khô theo hạng.
  5. Lô và chứng nhận: số lô, số lô đã xuất QR, kg; chứng nhận còn hiệu lực cuối kỳ.
  6. Bán hàng: doanh thu sỉ và lẻ, kg bán, phải thu cuối kỳ, 10 thương lái lớn nhất.
  7. An toàn: số lần phun đã duyệt, số thửa được nghiệm thu đạt cách ly.
- Mỗi phần có một tệp CSV tải riêng: `GET /api/reports/season.csv?from=&to=&section=`.
- Không thêm thư viện PDF.

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

## 8. Quyết định của chủ dự án (2026-11-28, sáng)

Chủ dự án chốt cả bốn mục ở §7 theo khuyến nghị:
1. Bán sỉ và sổ thu tiền nằm trong lõi, có trigger kiểm toán, mở cho trưởng HTX và kế toán.
2. tea-shop giữ gian hàng lẻ. Sản phẩm gắn một lô `QR_EXPORTED`; khi xác nhận đơn, tea-shop gọi Core Action API để ghi đơn RETAIL và trừ tồn lô ở một chỗ. Sản phẩm phải có trọng lượng tịnh mỗi gói để quy đổi chính xác sang kg của lô.
3. Hạn thanh toán mặc định 30 ngày, sửa được theo đơn. Quá hạn hiện cảnh báo đỏ trên bảng điều hành, không tự gửi tin ra ngoài.
4. Bảng điều hành sáu khối (S7) thay hẳn trang chủ `/manager/dashboard`.

## Ghi chú sau triển khai

Mã là nguồn cuối cùng. Phần dưới liệt kê chỗ mã khác thân đặc tả (đã tính §8).

1. **Bảng điều hành không có route API và nhận thêm vai.** `DirectorBoardUseCase.read(htxProfileId, now, role)` nhận thời điểm và vai (`manager` hoặc `accountant`) thay vì chỉ `today`; hai trang dashboard đọc thẳng ở máy chủ. Kế toán thấy khối 1, 2, 3, 5 và bốn cảnh báo về tiền (`ORDERS_OVERDUE`, `SETTLEMENT_DRAFT`, `UNPAID_LINES`, `PRICE_NOT_PUBLISHED`); khối tồn chè khô chỉ có với trưởng HTX.
2. **Cách đếm cảnh báo.** "Mẻ còn mở quá 2 ngày" đếm mẻ `OPEN` có ngày chế biến cách hôm nay từ 3 ngày; "tồn chè khô quá 60 ngày" đếm dòng tồn có ngày chế biến cách hôm nay từ 61 ngày; "kỳ quyết toán còn nháp" chỉ nêu kỳ nháp mới nhất (`count` luôn 1); "chưa trả quá 7 ngày" tính từ `closed_at` trước 00:00 giờ Việt Nam của ngày cách hôm nay 7 ngày. Cảnh báo giá không hiện khi khối giá hỏng, và cảnh báo quá hạn không hiện khi khối công nợ hỏng.
3. **Thu tiền không bị chặn trên đơn lẻ.** §3 quy tắc 3 chỉ nói thu tiền trên đơn `CONFIRMED`; mã không kiểm loại đơn, nên `POST .../payments` cũng chạy trên đơn `RETAIL` (đơn lẻ vẫn không vào công nợ).
4. **Ngày đặt của đơn lẻ.** Thân `POST /api/internal/apps/sales/retail-orders` chấp nhận `ordered_on` nhưng mã bỏ qua và luôn đặt hôm nay.
5. **Thêm ràng buộc CSDL ngoài đặc tả:** `total_vnd >= 0`, `due_on >= ordered_on`, `kind` (sỉ phải có `partner_id`, lẻ không có `due_on`), `amount_vnd >= 0` ở dòng, công thức gói `net_g = pack_count × pack_net_g`.
6. **`PATCH /api/sales/orders/[id]` kiểm kỹ hơn §3 quy tắc 5.** Hạn trước ngày đặt trả 400 `VALIDATION_ERROR`; đơn lẻ trả 422 `NOT_WHOLESALE`; đơn đã huỷ trả 409 `ORDER_CANCELLED`; đơn đã thu đủ trả 409 `ORDER_PAID`.
7. **`LOT_STOCK_SHORT` chỉ liệt kê lô thiếu.** Trường `error.stock` chứa các lô không đủ (`lot_id`, `remaining_g`), không phải mọi lô của đơn như quy tắc 1 viết.
8. **Huỷ đơn lẻ lần hai.** `POST .../retail-orders/[external_ref]/cancel` cho đơn đã huỷ trả đúng đơn đó (200), không phải 409 `ORDER_CANCELLED`; lý do tuỳ chọn, thiếu thì là "Huỷ từ gian hàng".
9. **Route Core Action API có thêm giới hạn** 120 yêu cầu mỗi phút theo header `Authorization` (429) ở APISIX. Web kiểm `azp` của token bằng `KEYCLOAK_CLIENT_ID` (mặc định `nextjs-web`), từ chối token vai dịch vụ, và chỉ nhận vai `manager`.
10. **Báo cáo, phần "An toàn".** Số "thửa được nghiệm thu đạt cách ly" mã đếm là số lứa có `parcel_crop_cycles.harvested_at` trong kỳ (`harvests_approved`), không đếm lần bấm nghiệm thu. Phần "Thành viên" tính tại thời điểm xem, không theo kỳ.
11. **Phần "Bán hàng" của báo cáo** (§3 S9 mục 6) được nối bằng nhiệm vụ R2 của kế hoạch, ở commit riêng sau commit đầu của báo cáo. Khi phần này chưa có số liệu, mã trả `sales: null` và `GET /api/reports/season.csv?section=sales` trả 503 `SECTION_UNAVAILABLE`.
12. **Tệp CSV báo cáo.** Mỗi phần một bảng; phần hỏng hoặc không có bảng xuất trả 503 `SECTION_UNAVAILABLE`, không trả tệp rỗng.
