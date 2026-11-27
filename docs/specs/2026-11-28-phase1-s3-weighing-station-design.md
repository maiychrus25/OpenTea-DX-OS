<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ1 dự án con 3: Giá búp ngày và Bàn cân có chốt chặn cách ly

> **Trạng thái:** Bản thiết kế (2026-11-28). Nhánh `feat/phase1-value-chain`, làm sau khi dự án con 1 và 2 đã gộp vào nhánh này.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §1 (lời hứa 1), §3 rào chắn 3, §5 GĐ1 mục 3, §6 (vai `manager`, `accountant`, `farmer`); [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md); DEV-011.
> **Quyết định của chủ dự án (2026-11-28):**
> - Giám đốc công bố giá ngày theo phẩm cấp trong 10 giây.
> - Kế toán lập phiếu cân gắn Hộ + Nương + Lứa, có trừ % nước mưa và tạp chất.
> - Khoá đỏ tuyệt đối nếu nương còn trong ngày cách ly.
> - Dữ liệu của `leaf-purchase` là demo, không chuyển sang. Không xoá thư mục mini-app; chỉ ẩn khỏi Kho ứng dụng chuẩn và cập nhật E2E.
> - Bàn cân dùng quy tắc cách ly của nương đang mở (S1 §7.10): mọi lần phun của nương có `entry_date <= D` và `safe_harvest_date > D` đều chặn.

## 1. Mục đích

Đây là **lời hứa số 1** của sản phẩm: không cân búp còn dư lượng thuốc. Bàn cân là chỗ duy nhất búp tươi đi vào HTX. Nếu nương còn trong thời gian cách ly, hệ thống không cho lập phiếu cân thương phẩm, không có nút bỏ qua.

Phiếu cân cũng là đầu vào tiền của xã viên ở dự án con 4 và là đầu vào khối lượng của mẻ sao sấy ở GĐ2.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- G1. Trưởng HTX quản lý danh sách phẩm cấp búp của HTX và công bố giá mỗi ngày bằng một màn hình: giá hôm qua điền sẵn, sửa ô cần sửa, bấm "Công bố giá hôm nay".
- G2. Kế toán lập phiếu cân nhanh:
  - chọn Hộ → Nương (kèm đèn cách ly) → Phẩm cấp (kèm giá hôm nay);
  - nhập kg cân, nhập % trừ nước mưa và tạp chất;
  - hệ thống tính kg tịnh và thành tiền, lưu phiếu và in biên nhận.
- G3. Khoá đỏ: lưu phiếu bị từ chối ở server nếu nương đang trong thời gian cách ly.
- G4. Huỷ phiếu có lý do (khi phiếu chưa vào kỳ quyết toán); có danh sách phiếu theo ngày, theo hộ; tải CSV.
- G5. Xã viên xem giá búp hôm nay trên Tổng quan và xem phiếu cân của hộ mình.
- G6. Đối chiếu nhật ký thu hái: mỗi lứa hiện tổng kg tịnh theo phiếu cân cạnh `fresh_leaf_kg` của nhật ký thu hái, để thấy chênh lệch.
- G7. Ẩn `leaf-purchase` khỏi Kho ứng dụng chuẩn, kèm ghi chú "Đã hợp nhất vào lõi". Ứng dụng chỉ hiện khi `DXOS_LABS` bật.

**Ngoài phạm vi**
- Cấn trừ nợ, quyết toán, chi trả: dự án con 4.
- Mẻ sao sấy, cân bằng khối lượng: GĐ2.
- Cân điện tử nối máy.
- Bàn cân offline.
- Cảnh báo AI "cân vượt định mức diện tích": GĐ4.

**Điều cấm**
- Bất kỳ cách nào lưu được phiếu cân thương phẩm cho nương đang trong thời gian cách ly. Không có cờ bỏ qua, kể cả cho trưởng HTX.
- Sửa số kg, giá hay thành tiền của phiếu đã lưu. Chỉ được huỷ rồi lập phiếu mới.
- Huỷ phiếu đã vào kỳ quyết toán.
- Phiếu không có giá ngày đã công bố.

## 3. Các cách đã cân nhắc

| Việc | Cách chọn | Cách khác |
|---|---|---|
| Giá | **Bảng giá theo ngày và phẩm cấp. Phiếu chép giá vào phiếu lúc cân.** | Giá đặt trên phẩm cấp như `leaf-purchase`: không có lịch sử giá ngày. Roadmap cần "giá ngày" cho bảng điều hành GĐ3. |
| Chốt cách ly | **Kiểm trong use case tạo phiếu bằng hàm dùng chung của S1** (`blockingSprays(parcelId, asOf)`). | Kiểm ở giao diện: đi vòng được. |
| Phiếu sai | **Huỷ có lý do, phiếu bất biến.** | Cho sửa: mất dấu vết tiền. |

## 4. Thiết kế

### 4.1. Dữ liệu (migration `20261128140000_weighing_station`)

**Bảng `leaf_grades`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id` | khoá ngoại | |
| `name` | String, 1..60 ký tự | |
| `sort_order` | Int, mặc định 0 | |
| `active` | Bool, mặc định true | |
| `created_at`, `updated_at` | | |

Ràng buộc: `@@unique([htx_profile_id, name])`.

**Bảng `daily_leaf_prices`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id` | | |
| `grade_id` | khoá ngoại | |
| `price_date` | Date | ngày theo giờ Việt Nam |
| `price_vnd_per_kg` | Int, 1..10 000 000 | |
| `published_by_id` | | |
| `published_at` | | |
| `updated_at` | | |

Ràng buộc: `@@unique([grade_id, price_date])`. Công bố lại trong cùng ngày thì cập nhật dòng; phiếu đã lập giữ giá đã chép.

**Bảng `fresh_leaf_tickets`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id` | | |
| `ticket_no` | String, unique | `{HTX_CODE}-PC-{YYYYMMDD}-{NNN}`; NNN đếm theo HTX và ngày, cấp dưới khoá `pg_advisory_xact_lock` |
| `household_id`, `parcel_id` | khoá ngoại | |
| `cycle_id` | khoá ngoại, cho phép rỗng | lứa theo §7.3 |
| `grade_id` | khoá ngoại | |
| `weighed_at` | DateTime | |
| `gross_kg` | Decimal(7,1), > 0, ≤ 5000 | |
| `deduction_pct` | Decimal(4,1), 0..30 | |
| `net_kg` | Decimal(7,1) | `round(gross_kg × (1 − deduction_pct/100), 1)` |
| `price_vnd_per_kg` | Int | chép từ giá ngày |
| `amount_vnd` | BigInt | `round(net_kg × price_vnd_per_kg)` |
| `status` | `VALID` hoặc `VOIDED` | |
| `void_reason`, `voided_by_id`, `voided_at` | | |
| `created_by_id`, `created_at` | | |
| `settlement_id` | String?, nullable | dự án con 4 gắn khoá ngoại; S3 tạo cột rỗng |

**Kiểm toán:** thêm cả ba bảng vào mảng của `03-audit-triggers.sql` và gắn trigger ngay trong migration.

**Seed:** HTX TC có ba phẩm cấp mẫu "Loại 1 (1 tôm 2 lá)", "Loại 2", "Loại 3". Seed không tạo giá hay phiếu, vì đó là số liệu vận hành, không được bịa.

### 4.2. Miền và use case

- **`domain/weighing/ticket-math.ts`:** `computeTicket({ grossKg, deductionPct, priceVndPerKg }) → { netKg, amountVnd }` (hàm thuần, có test làm tròn).
- **`PublishDailyPricesUseCase`** (vai `manager`): nhận danh sách `{ grade_id, price_vnd_per_kg }` cho **hôm nay theo giờ Việt Nam**. Upsert từng dòng. Phẩm cấp phải thuộc HTX và đang dùng.
- **`CreateFreshLeafTicketUseCase`** (vai `accountant` và `manager`), làm theo thứ tự:
  1. Hộ thuộc HTX; nương thuộc hộ; nương không ở trạng thái `DRAFT`.
  2. **Chốt cách ly:** `blockingSprays(parcelId, asOf = weighed_at)`. Nếu có lần phun chặn thì trả 409 `PARCEL_IN_WITHDRAWAL`, kèm `safe_from` là ngày `safe_harvest_date` lớn nhất. Thông điệp: "Nương {mã} còn trong thời gian cách ly đến {dd/MM/yyyy}. Không được cân búp thương phẩm."
  3. Giá hôm nay của phẩm cấp phải có. Nếu không có thì trả 409 `NO_PRICE_TODAY`, thông điệp "Chưa công bố giá hôm nay cho phẩm cấp này."
  4. Tính toán, cấp số phiếu, lưu trong một transaction và gắn `dxos.actor`.

  Không có tham số nào bỏ qua được bước 2.
- **`VoidFreshLeafTicketUseCase`** (vai `accountant` và `manager`):
  - Lý do 3..200 ký tự.
  - Chỉ huỷ được phiếu `VALID` có `settlement_id` rỗng; ngược lại trả 409 `TICKET_SETTLED`.
- **Đọc:**
  - danh sách phiếu theo ngày, hộ, nương, lứa, trạng thái (`manager`, `accountant`, `officer`);
  - phiếu của hộ mình (`farmer`);
  - giá hôm nay (mọi vai trong HTX);
  - tổng kg tịnh theo lứa cạnh `fresh_leaf_kg` của nhật ký thu hái cùng lứa (`manager`, `officer`).

### 4.3. API (`withErrorHandler`, zod, envelope)

| Phương thức | Đường dẫn | Vai | Ghi chú |
|---|---|---|---|
| GET | `/api/leaf-grades` | manager, accountant, officer, farmer | |
| POST | `/api/leaf-grades` | manager | |
| PUT | `/api/leaf-grades/[id]` | manager | đổi tên, thứ tự, bật/tắt |
| GET | `/api/leaf-prices/today` | mọi vai trong HTX | `{ date, prices: [{ grade_id, grade_name, price_vnd_per_kg, yesterday_vnd_per_kg }] }` |
| PUT | `/api/leaf-prices/today` | manager | `{ prices: [{ grade_id, price_vnd_per_kg }] }` |
| GET | `/api/parcels/[id]/withdrawal-status?at=` | accountant, manager, officer | `{ blocked, safe_from }`; dùng cho đèn của bàn cân |
| POST | `/api/leaf-tickets` | accountant, manager | `{ household_id, parcel_id, grade_id, gross_kg, deduction_pct, client_id? }` |
| GET | `/api/leaf-tickets?date=&household_id=&status=&cursor=` | | phân trang 50 |
| GET | `/api/leaf-tickets/[id]` | | |
| POST | `/api/leaf-tickets/[id]/void` | accountant, manager | `{ reason }` |
| GET | `/api/leaf-tickets/export.csv?from=&to=` | manager, accountant | chặn công thức như các CSV đang có |
| GET | `/api/leaf-tickets/mine` | farmer | |

`client_id` chống trùng theo người lập, như nhật ký ở S1. Mọi route mới có dòng trong `tenant-isolation.test.ts` và bảng `coverage.ts` của Telegram.

### 4.4. Giao diện

- **`/manager/leaf-prices` "Giá thu mua":**
  - Bảng phẩm cấp với ô giá hôm nay (điền sẵn giá hôm qua) và nút lớn "Công bố giá hôm nay". Sau khi công bố hiện "Đã công bố lúc HH:mm".
  - Có phần "Phẩm cấp búp" để thêm, đổi tên, ẩn.
  - Mục tiêu: công bố xong trong 10 giây khi giá không đổi, tức là một lần bấm.
- **`/accountant/weighing` "Bàn cân":** một biểu mẫu dọc, dùng tốt trên máy tính bảng và điện thoại.
  - **Hộ:** ô tìm theo tên hoặc số điện thoại.
  - **Nương:** các nương của hộ, mỗi nương có đèn. Xanh "Đã qua cách ly". Đỏ "Còn cách ly đến dd/MM", khi đó nút lưu bị khoá và có dòng giải thích.
  - **Phẩm cấp:** kèm giá hôm nay. Phẩm cấp chưa có giá thì không chọn được, kèm dòng "Chưa công bố giá".
  - **Số liệu:** kg cân; % trừ (mặc định 0, các nút nhanh 0, 2, 5, 10); kg tịnh và thành tiền tính ngay.
  - Bấm "Lưu phiếu" thì mở biên nhận in được (`/accountant/weighing/[id]/print`, khổ in nhiệt 80 mm, dùng `@media print`) và reset form để cân hộ tiếp theo.
  - Bên cạnh: "Phiếu hôm nay" với tổng kg và tổng tiền, nút huỷ (hộp nhập lý do).
- **`/manager/leaf-tickets` và `/accountant/leaf-tickets` "Phiếu cân":** lọc theo ngày, hộ, trạng thái; tải CSV.
- **Tổng quan nông dân:** thẻ "Giá búp hôm nay" (giá các phẩm cấp, hoặc "HTX chưa công bố giá hôm nay").
- **`/farmer/leaf-tickets` "Phiếu cân của tôi":** danh sách phiếu (số phiếu, ngày, nương, kg tịnh, thành tiền, trạng thái).
- **Đối chiếu thu hái:** ở lịch thu hái của cán bộ và trưởng HTX, chi tiết một lứa đã hái hiện "Cân thực tế {x} kg / Nhật ký {y} kg".
- **Menu:**
  - Trưởng HTX: "Giá thu mua", "Phiếu cân".
  - Kế toán: "Bàn cân", "Phiếu cân".
  - Nông dân: "Phiếu cân".

### 4.5. Ẩn `leaf-purchase`

Kho ứng dụng có danh sách `MERGED_INTO_CORE = ['leaf-purchase', 'farm-supply']`:
- Khi `DXOS_LABS` tắt, các app này không hiện trong danh sách cài, không hiện ở menu mini-app, và trang chi tiết ghi "Đã hợp nhất vào lõi". `farm-supply` sẽ do S4 dùng.
- Mã mini-app, `smoke-apps.sh` và CI giữ nguyên; các bước kiểm tra trong CI chạy với `DXOS_LABS=1`.
- E2E nào giả định thấy `leaf-purchase` trong cửa hàng ở chế độ chuẩn thì sửa lại.

## 5. Ràng buộc

- Tiền là số nguyên VND, BigInt khi cộng dồn. Kg là Decimal một chữ số thập phân. Không dùng số thực cho tiền.
- Ngày theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), như các chỗ tính ngày đang có.
- Theo quy tắc `AGENTS.md`: token màu, sáng và tối, 390 px, bàn phím, không `style` nội dòng.

## 6. Kiểm chứng

- **Test đơn vị:**
  - `computeTicket` (làm tròn ở biên).
  - Chốt cách ly:
    - nương có lần phun còn hạn: 409, không có dòng nào được ghi;
    - phun hôm nay với `entry_date = D`: chặn;
    - hết hạn đúng ngày D: cho cân;
    - lần phun của lứa trước còn hạn: chặn.
  - Thiếu giá: 409.
  - Số phiếu tăng dần và không trùng khi tạo đồng thời.
  - Huỷ phiếu đã quyết toán: 409.
  - Phân quyền: nông dân không tạo được phiếu; HTX khác trả 404.
  - Công bố giá là upsert.
  - Ẩn mini-app khi `DXOS_LABS` tắt.
- **Giao diện:** hai vòng, gồm luồng cân một hộ đến in biên nhận, đèn đỏ khoá lưu, công bố giá, phiếu của nông dân.

## 7. Quyết định bổ sung sau lượt đọc thử (ràng buộc, thay cho chỗ mâu thuẫn ở trên)

1. **Chốt cách ly ở bàn cân.** Quy tắc nương đang mở của S1 §7.10, với D là ngày cân:
   - Nhật ký `PENDING_APPROVAL`, `APPROVED` và `REQUEST_CHANGES` đều chặn; chỉ `DRAFT` và `REJECTED` không tính.
   - Lần phun có `entry_date` sau D (ghi trước cho ngày tương lai) không chặn hôm nay.
   - So sánh theo **ngày lịch giờ Việt Nam**: chặn khi ngày của `safe_harvest_date` lớn hơn ngày D. Đúng ngày hết cách ly thì được cân, khớp quy tắc của A1.
2. **`weighed_at`** do server đặt bằng giờ hiện tại; không có trường lùi ngày. "Hôm nay" của giá là ngày Việt Nam của `weighed_at`.
3. **Lứa của phiếu cân:**
   - Nếu nương có lứa mở thì lấy lứa mở.
   - Nếu không có lứa mở thì lấy lứa vừa đóng gần nhất.
   - Nếu nương không có lứa nào (dữ liệu cũ) thì `cycle_id` rỗng; vì thế `fresh_leaf_tickets.cycle_id` cho phép rỗng.
   - Không tự tạo lứa khi cân.
4. **Tranh chấp đồng thời.** Transaction tạo phiếu khoá dòng nương (`SELECT ... FROM parcels WHERE id = $1 FOR UPDATE`) trước khi kiểm cách ly. Transaction tạo nhật ký ở S1 (`PrismaJournalRepository.create`) cũng khoá đúng dòng nương đó trước khi ghi, để một lần phun và một phiếu cân của cùng nương không đi lọt nhau.
5. **Trưởng HTX được tạo phiếu** với vai hoạt động `manager`, như bảng ở §4.3.
