<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ1 dự án con 4: Vật tư ứng, Sổ cái xã viên và Quyết toán kỳ có VietQR

> **Trạng thái:** Bản thiết kế (2026-11-28). Nhánh `feat/phase1-value-chain`, làm sau dự án con 3.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §1 (lời hứa 2), §5 GĐ1 mục 4, §6 (vai `accountant`, `farmer`), §7 KPI "chốt kỳ ≤ 30 phút"; [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md) (tiền luôn có người ký); DEV-011.
> **Quyết định của chủ dự án (2026-11-28):**
> - Cấp ứng vật tư ghi nợ cho hộ. Chốt kỳ tự tính `Tiền búp − Nợ vật tư = Thực lĩnh` và xuất phiếu có mã VietQR, dùng lại bộ sinh EMVCo và CRC16 trên nhánh `feat/tea-tour-pro`, commit `b60708fb`.
> - Dữ liệu `farm-supply` là demo, không chuyển. Không xoá mini-app; chỉ ẩn khỏi Kho ứng dụng chuẩn.

## 1. Mục đích

HTX chè cấp phân bón và thuốc cho xã viên trước, rồi trừ vào tiền búp khi quyết toán. Hôm nay việc này là hai cuốn sổ và hai, ba ngày cộng trừ tay.

Dự án con này đưa cả hai dòng tiền vào **một sổ cái chỉ-thêm của từng hộ**. Kế toán chuẩn bị kỳ. Trưởng HTX ký chốt kỳ, vì đây là việc tiền, luôn cần người. Mỗi hộ có phiếu quyết toán in được, có mã VietQR để kế toán chuyển khoản đúng số thực lĩnh.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- G1. Danh mục vật tư của HTX: tên, đơn vị, đơn giá, loại. Loại thuốc gắn được với danh mục thuốc của S1.
- G2. Phiếu cấp ứng: hộ, vật tư, số lượng, đơn giá chép lúc cấp, thành tiền. Có huỷ có lý do khi chưa vào kỳ.
- G3. Sổ cái xã viên chỉ-thêm. Mỗi phiếu cân hợp lệ ghi CÓ tiền búp; mỗi phiếu ứng ghi NỢ; mỗi lần chi trả và mỗi lần chuyển nợ sang kỳ sau đều có dòng. Số dư của một hộ bằng tổng các dòng.
- G4. Kỳ quyết toán:
  - kế toán tạo kỳ (từ ngày, đến ngày) và xem bản nháp tính sẵn từng hộ;
  - trưởng HTX bấm "Chốt kỳ" (có hộp xác nhận), khi đó hệ thống ghi sổ, khoá phiếu cân và phiếu ứng của kỳ, và tạo phiếu quyết toán từng hộ.
- G5. Phiếu quyết toán in được:
  - có bảng phiếu cân, bảng vật tư ứng, nợ kỳ trước, thực lĩnh, nợ chuyển kỳ sau;
  - có mã VietQR khi hộ đã khai tài khoản ngân hàng, nếu không thì ghi "Trả tiền mặt".
- G6. Ghi nhận chi trả: kế toán đánh dấu "Đã trả" kèm hình thức (chuyển khoản hoặc tiền mặt) và mã tham chiếu; hệ thống ghi dòng sổ cái.
- G7. Xã viên có trang "Sổ tiền": số dư hiện tại, phiếu cân, vật tư ứng, các kỳ quyết toán và phiếu của mình. Thuốc hộ đã ứng được xếp lên đầu trong ô chọn thuốc của nhật ký (hoàn tất phần còn treo ở S1).
- G8. Ẩn `farm-supply` khỏi Kho ứng dụng chuẩn (danh sách `MERGED_INTO_CORE` của S3).

**Ngoài phạm vi**
- Cổng thanh toán tự động, đối soát với sao kê ngân hàng.
- Hoá đơn VAT.
- Công nợ khách mua (GĐ3).
- Tồn kho vật tư của HTX: chỉ ghi phiếu ứng, không quản lý nhập kho.

**Điều cấm**
- Chốt kỳ hay ghi chi trả tự động, kể cả qua agent. Chỉ trưởng HTX chốt kỳ; chỉ kế toán hoặc trưởng HTX ghi chi trả.
- Sửa hay xoá dòng sổ cái. Sửa sai bằng dòng điều chỉnh có lý do (chỉ trưởng HTX).
- Một phiếu cân hoặc phiếu ứng nằm trong hai kỳ.
- Thực lĩnh âm. Phần nợ lớn hơn tiền búp chuyển sang kỳ sau dưới dạng nợ.
- Mã VietQR có số tiền khác thực lĩnh của phiếu.

## 3. Các cách đã cân nhắc

| Việc | Cách chọn | Cách khác |
|---|---|---|
| Ghi tiền | **Sổ cái chỉ-thêm (`member_ledger_entries`) cộng bảng kỳ và dòng quyết toán.** Số dư luôn tính từ sổ. | Chỉ lưu tổng trên kỳ: mất dấu vết từng khoản, không đối chiếu được với xã viên. |
| Nợ vượt tiền búp | **Chuyển sang kỳ sau** (một cặp dòng: ghi giảm ở kỳ này, ghi nợ đầu kỳ sau). | Thực lĩnh âm: không trả được tiền âm, dễ hiểu nhầm. |
| VietQR | **Chuyển `vietqr.py` sang TypeScript trong `domain/payment/vietqr.ts`**, giữ nguyên véc-tơ kiểm thử gốc. Ảnh QR sinh bằng thư viện QR mà web đang dùng cho tem lô. | Gọi mini-app Python: lõi phụ thuộc mini-app, trái ADR 0005. |
| Ai chốt | **Kế toán chuẩn bị, trưởng HTX chốt.** Hai người, đúng Luật HTX và rào chắn 5. | Kế toán tự chốt: một người vừa lập vừa duyệt tiền. |

## 4. Thiết kế

### 4.1. Dữ liệu (migration `20261128150000_member_ledger`)

**Cột thêm vào `households`** (thông tin cá nhân; chỉ trưởng HTX và kế toán xem và sửa):
- `bank_bin String?`: 6 chữ số, phải nằm trong danh sách ngân hàng của `vietqr.ts`.
- `bank_account String?`: 6..19 chữ số.
- `bank_account_name String?`: tối đa 60 ký tự.

**Bảng `input_items`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id` | khoá ngoại | |
| `name` | String | 1..80 ký tự |
| `unit` | String | 1..20 ký tự, ví dụ kg, bao, chai |
| `unit_price_vnd` | Int | 0..100 000 000 |
| `kind` | `FERTILIZER`, `PESTICIDE` hoặc `OTHER` | |
| `pesticide_product_id` | String?, khoá ngoại tới `pesticide_products` | chỉ khi `PESTICIDE` |
| `active` | Bool | |
| `created_at`, `updated_at` | | |

Ràng buộc: `@@unique([htx_profile_id, name])`.

**Bảng `input_advances`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id` | | |
| `advance_no` | String, unique | `{HTX}-VT-{YYYYMMDD}-{NNN}`, cấp như số phiếu cân |
| `household_id`, `item_id` | khoá ngoại | |
| `quantity` | Decimal(9,2) | > 0 |
| `unit_price_vnd` | Int | chép từ vật tư |
| `amount_vnd` | BigInt | |
| `advanced_on` | Date | |
| `status` | `VALID` hoặc `VOIDED` | |
| `void_reason`, `voided_by_id`, `voided_at` | | |
| `settlement_id` | String?, khoá ngoại | |
| `client_id` | String? | |
| `created_by_id`, `created_at` | | |

Ràng buộc: `@@unique([created_by_id, client_id])`.

**Bảng `settlement_periods`**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id` | | |
| `code` | String, unique | `{HTX}-QT-{YYYYMMDD đến ngày}` |
| `date_from`, `date_to` | Date | |
| `status` | `DRAFT` hoặc `CLOSED` | |
| `created_by_id`, `created_at` | | |
| `closed_by_id`, `closed_at` | | |

Các kỳ của cùng một HTX không được chồng ngày lên nhau; kiểm tra trong use case dưới khoá `pg_advisory_xact_lock` theo HTX.

**Bảng `member_settlements`** (một dòng cho mỗi hộ có phát sinh trong kỳ, chỉ tạo lúc chốt)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `period_id`, `household_id` | | |
| `leaf_net_kg` | Decimal(10,1) | |
| `leaf_amount_vnd`, `advances_vnd`, `debt_in_vnd` | BigInt | |
| `payable_vnd` | BigInt | `max(0, leaf − advances − debt_in)` |
| `debt_out_vnd` | BigInt | `max(0, advances + debt_in − leaf)` |
| `paid_at` | DateTime? | |
| `paid_by_id` | | |
| `payment_method` | `TRANSFER` hoặc `CASH`, nullable | |
| `payment_ref` | String? | |

Ràng buộc: `@@unique([period_id, household_id])`.

**Bảng `member_ledger_entries`** (chỉ thêm)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | cuid | |
| `htx_profile_id`, `household_id` | | |
| `entry_type` | xem dưới | |
| `amount_vnd` | BigInt | dương là HTX nợ hộ, âm là hộ nợ HTX |
| `ticket_id`, `advance_id`, `settlement_id` | String? | |
| `note` | String? | |
| `created_by_id`, `created_at` | | |

`entry_type` nhận một trong các giá trị: `LEAF_CREDIT`, `INPUT_DEBIT`, `PAYOUT`, `ADJUSTMENT`. Dòng chuyển nợ đã bỏ, xem §7.1.

Index `(household_id, created_at)`.

**Ràng buộc dữ liệu và kiểm toán:**
- Migration thêm khoá ngoại `fresh_leaf_tickets.settlement_id` tới `member_settlements(id)` (cột đã có từ S3).
- Migration thêm trigger `BEFORE UPDATE OR DELETE` trên `member_ledger_entries` để từ chối mọi sửa và xoá (append-only ở tầng CSDL, giống cách `audit.events` tự bảo vệ).
- Kiểm toán: mọi bảng mới vào mảng `03-audit-triggers.sql` và có trigger trong migration.

### 4.2. Ghi sổ

- **Phiếu cân:** sổ chỉ được ghi lúc chốt kỳ. Trước đó số dư "tạm tính" gồm sổ cộng các phiếu chưa chốt; sổ không ghi theo từng phiếu, để phiếu huỷ trước kỳ không phải sinh dòng đảo.
- **Chốt kỳ** (`CloseSettlementPeriodUseCase`, vai `manager`, một transaction):
  1. Kỳ ở trạng thái `DRAFT` và thuộc HTX.
  2. Lấy phiếu cân `VALID` có `settlement_id` rỗng và `weighed_at` trong kỳ (theo ngày Việt Nam). Lấy phiếu ứng `VALID` có `settlement_id` rỗng và `advanced_on` trong kỳ.
  3. Với mỗi hộ có phát sinh: `debt_in` = tổng `debt_out` của dòng quyết toán gần nhất trước đó của hộ mà chưa được kéo sang. Tính `payable` và `debt_out`.
  4. Ghi `member_settlements`, gắn `settlement_id` cho phiếu, rồi ghi sổ:
     - `LEAF_CREDIT +leaf`;
     - `INPUT_DEBIT −advances`;
     - nếu `debt_in > 0`: `DEBT_CARRY_IN −debt_in`;
     - nếu `debt_out > 0`: `DEBT_CARRY_OUT +debt_out`, để số dư kỳ này về đúng `payable`.
  5. Đặt kỳ `CLOSED`, ghi `closed_by_id`, gắn `dxos.actor`.

  Chốt hai lần thì lần sau trả 409 `PERIOD_CLOSED`, không ghi gì thêm.

  Bất biến được kiểm bằng test: sau khi chốt, số dư sổ của mỗi hộ, gồm các dòng của kỳ, bằng `payable_vnd`.
- **Ghi chi trả** (`RecordPayoutUseCase`, vai `accountant` hoặc `manager`):
  - Dòng quyết toán chưa trả và `payable > 0`.
  - Thân request: `{ method, ref? }`.
  - Ghi `PAYOUT −payable` và đặt `paid_at`. Ghi hai lần thì trả 409.
- **Điều chỉnh** (`ADJUSTMENT`, chỉ `manager`): số tiền khác 0, lý do 5..200 ký tự. Dùng để sửa sai sau khi đã chốt.

### 4.3. VietQR

- **`apps/web/src/domain/payment/vietqr.ts`:** chuyển nguyên `BANKS` (21 ngân hàng), `bankByBin`, `crc16` và `payload` từ `vietqr.py` của `b60708fb`.
- **Test giữ véc-tơ gốc:**
  - `payload("970405","8600201001234",500000,"TOUR K7M2QX9A")` bằng chuỗi `VECTOR` của `test_vietqr.py`;
  - `crc16("123456789") === "29B1"`;
  - các trường hợp sai đều bị từ chối.
- **Nội dung chuyển khoản:** `QT {mã kỳ rút gọn} {4 ký tự cuối id hộ}`, chỉ ký tự ASCII, tối đa 25.
- **Ảnh QR:** sinh ở server bằng thư viện QR mà `ExportQrUseCase` đang dùng, trả dạng data URL trên trang phiếu.

### 4.4. API (`withErrorHandler`, zod, envelope, phân quyền theo HTX)

| Phương thức | Đường dẫn | Vai | Ghi chú |
|---|---|---|---|
| GET | `/api/input-items` | manager, accountant, officer | |
| POST | `/api/input-items` | manager, accountant | |
| PUT | `/api/input-items/[id]` | manager, accountant | |
| POST | `/api/input-advances` | accountant, manager | |
| GET | `/api/input-advances?household_id=&from=&to=&status=&cursor=` | accountant, manager, officer | |
| POST | `/api/input-advances/[id]/void` | accountant, manager | |
| GET | `/api/input-advances/export.csv` | | |
| POST | `/api/settlements` | accountant, manager | `{ date_from, date_to }`, tạo kỳ `DRAFT` |
| GET | `/api/settlements` | | |
| GET | `/api/settlements/[id]` | | kỳ `DRAFT`: bản tính tạm từng hộ; kỳ `CLOSED`: dòng quyết toán |
| POST | `/api/settlements/[id]/close` | **manager** | |
| POST | `/api/settlements/[id]/lines/[lineId]/payout` | accountant, manager | `{ method, ref? }` |
| GET | `/api/settlements/[id]/lines/[lineId]/slip` | | dữ liệu phiếu cùng QR |
| POST | `/api/ledger/adjustments` | manager | |
| GET | `/api/ledger/mine` | farmer | số dư, các dòng sổ, phiếu chưa chốt |
| PUT | `/api/households/[id]/bank` | manager, accountant | |

Ngoài ra: route `GET /api/pesticides` (S1) với nông dân xếp lên đầu các thuốc mà hộ đã được ứng trong 180 ngày (qua `input_items.pesticide_product_id`), rồi tới thuốc hộ đã dùng.

### 4.5. Giao diện

**Kế toán**
- "Vật tư":
  - danh mục vật tư;
  - form cấp ứng nhanh: chọn hộ, vật tư, số lượng; thành tiền tính ngay; nút "Ghi phiếu ứng";
  - danh sách hôm nay, có huỷ.
- "Quyết toán":
  - danh sách kỳ, nút tạo kỳ;
  - trang kỳ `DRAFT`: bảng từng hộ gồm kg búp, tiền búp, vật tư, nợ kỳ trước, thực lĩnh, nợ chuyển; tổng cuối bảng; dòng "Chờ trưởng HTX chốt";
  - trang kỳ `CLOSED`: thêm cột trạng thái trả, nút "Phiếu" và nút "Ghi đã trả".
- "Phiếu quyết toán" (`/accountant/settlements/[id]/slip/[lineId]`, bản in A5): thông tin HTX, hộ, kỳ, hai bảng chi tiết, thực lĩnh chữ to, mã VietQR với tên ngân hàng và số tài khoản (che bớt), chỗ ký "Người nhận" và "Kế toán".

**Trưởng HTX**
- Cùng các trang trên.
- Trang kỳ `DRAFT` có nút "Chốt kỳ". Hộp xác nhận ghi: "Chốt kỳ {mã}: {n} hộ, tổng thực lĩnh {x} đ. Sau khi chốt không sửa được phiếu cân và phiếu ứng trong kỳ."
- Trang hộ có phần "Tài khoản nhận tiền": chọn ngân hàng từ danh sách, số tài khoản, tên chủ tài khoản.

**Xã viên**
- "Sổ tiền" (`/farmer/ledger`):
  - số dư lớn ở đầu: "HTX đang nợ bạn {x} đ" hoặc "Bạn đang nợ HTX {x} đ";
  - các tab Phiếu cân / Vật tư ứng / Quyết toán;
  - nút xem phiếu quyết toán của mình, không có nút "Ghi đã trả".
- Bottom nav thêm tab "Sổ tiền", đúng tab 2 "Phiếu cân & Công nợ" trong roadmap §6.

**Menu**
- Kế toán: Bàn cân, Phiếu cân, Vật tư, Quyết toán.
- Trưởng HTX: thêm Vật tư, Quyết toán.
- Xã viên: Sổ tiền. "Phiếu cân của tôi" của S3 trở thành một tab trong Sổ tiền.

## 5. Ràng buộc

- Tiền là số nguyên VND (BigInt). Kg là Decimal. Không dùng số thực cho tiền.
- Ngày theo giờ Việt Nam.
- Thông tin tài khoản ngân hàng không gửi ra Telegram, agent hay log.
- Agent không có quyền đọc các bảng mới trong Hasura (không thêm metadata).
- Theo quy tắc `AGENTS.md`: sáng và tối, 390 px, bàn phím, in đẹp ở khổ A5 và 80 mm.

## 6. Kiểm chứng

- **Test đơn vị:**
  - VietQR theo véc-tơ gốc;
  - công thức chốt (tiền búp lớn hơn nợ, nhỏ hơn nợ, có nợ kỳ trước, kỳ không phát sinh);
  - bất biến số dư bằng thực lĩnh;
  - chốt hai lần; chi trả hai lần;
  - huỷ phiếu đã chốt (S3 và S4);
  - kỳ chồng ngày;
  - sổ cái không sửa và xoá được (trigger, kiểm trên CSDL thật trong bước migration);
  - phân quyền: kế toán không chốt được kỳ; HTX khác trả 404; nông dân chỉ thấy sổ của hộ mình.
- **Migration** trên bản sao CSDL 1.17.0 sau S1 đến S3.
- **Giao diện:** hai vòng, gồm luồng ứng vật tư → cân búp → tạo kỳ → chốt → phiếu VietQR → ghi đã trả → nông dân thấy số dư về 0.
- **KPI:** đo thời gian từ mở trang kỳ đến in xong phiếu của 20 hộ mẫu; mục tiêu ≤ 30 phút, ghi lại số đo.

## 7. Quyết định bổ sung sau lượt đọc thử (ràng buộc, thay cho chỗ mâu thuẫn ở §4.1 và §4.2)

1. **Sổ cái tự mang nợ sang kỳ sau. Bỏ hai loại dòng `DEBT_CARRY_OUT` và `DEBT_CARRY_IN`.** `entry_type` chỉ còn `LEAF_CREDIT`, `INPUT_DEBIT`, `PAYOUT`, `ADJUSTMENT`. Quy ước dấu: dương là HTX nợ hộ, âm là hộ nợ HTX.
2. **Công thức chốt cho mỗi hộ có phiếu cân hoặc phiếu ứng trong kỳ:**
   - `L` = tiền búp của kỳ; `A` = tiền vật tư ứng của kỳ.
   - `outstanding` = số dư sổ của hộ trước khi chốt, trừ đi tổng `payable_vnd` của các dòng quyết toán cũ chưa trả. Đây là phần nợ hoặc phần có còn lại, kể cả từ điều chỉnh.
   - `net = L − A + outstanding`; `payable_vnd = max(0, net)`; `debt_out_vnd = max(0, −net)`; `debt_in_vnd = max(0, −outstanding)` (chỉ để hiển thị).
   - Sổ ghi đúng hai loại dòng: `LEAF_CREDIT +L` (nếu `L > 0`) và `INPUT_DEBIT −A` (nếu `A > 0`).
   - **Bất biến** (có test): sau khi chốt, số dư sổ của hộ trừ tổng `payable` của mọi dòng chưa trả bằng `−debt_out_vnd` của dòng vừa chốt.
   - Hộ còn nợ mà kỳ này không phát sinh gì thì không có dòng quyết toán; nợ vẫn nằm trong sổ và được trừ ở kỳ đầu tiên hộ có phát sinh.
3. **Chi trả:**
   - Chỉ cho dòng có `payable_vnd > 0`. Ghi `PAYOUT −payable`.
   - Dòng có `payable = 0` hiện "Không có khoản chi trả" và không có nút ghi trả.
   - Phương thức `TRANSFER` vẫn chọn được khi hộ chưa khai tài khoản (chuyển bằng cách khác); khi đó phiếu không có QR.
4. **Kỳ quyết toán liền nhau, không hở:**
   - Kỳ mới phải bắt đầu đúng ngày sau `date_to` của kỳ gần nhất của HTX. Kỳ đầu tiên phải bắt đầu không muộn hơn ngày của phiếu cân hoặc phiếu ứng `VALID` chưa quyết toán sớm nhất; nếu không thì trả 422 "Còn phiếu trước ngày bắt đầu kỳ."
   - `date_to` không được sau hôm nay (ngày Việt Nam). Chỉ một kỳ `DRAFT` mỗi HTX.
   - Phiếu ứng, giống phiếu cân, chỉ huỷ được khi `settlement_id` rỗng.
5. **Chốt kỳ với số liệu cũ:** `POST /close` gửi kèm `expected_household_count` và `expected_payable_total_vnd` mà hộp xác nhận đã hiện. Nếu số tính lại khác thì trả 409 `PERIOD_CHANGED` cùng số mới, giao diện hiện lại hộp xác nhận.
6. **Người chốt:** chỉ vai hoạt động `manager` được chốt kỳ. Cùng một người giữ cả hai vai vẫn được chuẩn bị rồi chốt; người tạo kỳ và người chốt đều được ghi lại. Đây là chữ ký người theo rào chắn 5, không bắt buộc hai người khác nhau.
7. **Thông tin ngân hàng:**
   - Trưởng HTX và kế toán thấy đủ số tài khoản trên phiếu để chuyển tiền; xã viên thấy phiếu của mình với số tài khoản che, chỉ còn 4 số cuối.
   - Bảng `households` đã được kiểm toán, nên ba cột mới cũng vào `audit.events`, như họ tên và số điện thoại đang có. Đây là kho kiểm toán nội bộ có kiểm soát, chấp nhận được.
   - Các cột này không được gửi ra Telegram, agent hay log ứng dụng.
8. **Xã viên có nhiều hộ:** các route `mine` trả dữ liệu của mọi hộ gắn với tài khoản, gộp theo hộ.
