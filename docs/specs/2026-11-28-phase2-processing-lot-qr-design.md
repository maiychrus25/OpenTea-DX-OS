<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ2: Mẻ sao sấy, Lô từ mẻ, Chứng nhận thật và một Trang QR

> **Trạng thái:** Đã triển khai trên nhánh `feat/phase2-processing-qr` (2026-11-28), chưa phát hành. Bản thiết kế viết ngày 2026-11-28; khác biệt giữa thiết kế và mã nằm ở "Ghi chú sau triển khai" cuối tài liệu.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §1 (lời hứa 3), §3 rào chắn 4 và 5, §5 GĐ2 mục 1–3, §6 (vai `officer`, `manager`, khách mua), §7 KPI "100% lô xuất QR truy ngược về mẻ sao và phiếu cân"; [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md); DEV-009 (gỡ CertificateManager giả ở GĐ0, hẹn làm thật ở GĐ2).
> **Cách duyệt:** chủ dự án giao làm tiếp các giai đoạn theo lộ trình trong đêm 2026-11-28. Các điểm lộ trình chưa nói rõ được quyết trong §7 và cần chủ dự án xem lại.

## 1. Mục đích

Đây là **lời hứa số 3**: tem QR chứng minh lô chè khô đi ra từ phiếu cân búp nào, mẻ sao nào, tỷ lệ thu hồi tươi/khô có hợp lý không, kèm chứng nhận thật còn hiệu lực.

Hiện tại phiếu cân (GĐ1) dừng ở tiền của xã viên. Lô được tạo thẳng từ thửa, không biết búp nào vào lô, khối lượng lô do người gõ tay. Hai trang QR (`/q` và `/lot`) hiện khác nhau, và `/lot` lộ họ tên chủ hộ cùng người ghi nhật ký. Chứng nhận chỉ là danh sách khoá tệp, không có số, nơi cấp hay ngày hết hạn.

GĐ2 nối: **Phiếu cân → Mẻ sao sấy → Tồn chè khô theo hạng → Lô → Tem QR**.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- G1. **Mẻ sao sấy.** Cán bộ KT hoặc trưởng HTX mở mẻ: ngày chế biến, người sao (nghệ nhân), ca, ghi chú. Gom các phiếu cân hợp lệ chưa chế biến vào mẻ. Nhập sản lượng chè khô theo 5 hạng (Đinh, Tôm nõn, Móc câu, Bồm, Cám). Bấm "Hoàn thành mẻ".
- G2. **Cân bằng khối lượng.** Hệ thống tính tỷ lệ `kg búp tươi tịnh / kg chè khô`. Ngoài khoảng chuẩn 4,5–5,0 : 1 thì mẻ chỉ hoàn thành được khi có lời giải trình. Danh sách mẻ đánh dấu mẻ lệch.
- G3. **Tồn chè khô.** Mỗi dòng sản lượng của mẻ đã hoàn thành là tồn kho theo hạng. Phần đã đóng lô bị trừ ra.
- G4. **Đóng lô từ mẻ.** Chọn một hạng, chọn các dòng tồn và số kg lấy từ mỗi dòng. Lô nhận khối lượng bằng tổng số kg đó, nhận các thửa và lứa từ phiếu cân của các mẻ nguồn, và qua kiểm tra cách ly theo từng phiếu cân.
- G5. **Chứng nhận thật.** HTX lưu chứng nhận (VietGAP, OCOP, hữu cơ, khác) có số, tổ chức cấp, ngày cấp, ngày hết hạn và tệp gốc (PDF/ảnh) trong kho SeaweedFS của nền tảng. Khi xuất QR, lô gắn các chứng nhận còn hiệu lực.
- G6. **Một trang QR.** `/q/[lot_code]` là trang duy nhất, có 4 tầng: Vùng trồng, An toàn cách ly, Mẻ sao chế biến, Chứng nhận. `/lot/[lot_code]` chuyển hướng vĩnh viễn sang `/q/...` để tem đã in vẫn quét được. Tem mới mã hoá `/q/...`.
- G7. **Ẩn tên cá nhân.** Mặc định trang công khai không hiện họ tên chủ hộ, người ghi nhật ký hay người sao. Trưởng HTX bật "Hiện tên trên trang truy xuất" trong hồ sơ HTX nếu muốn. Cài đặt áp khi hiển thị, nên cả lô đã xuất trước đó cũng theo.
- G8. **In tem.** Trang in tem QR cho máy in nhiệt: chọn khổ (50×30, 40×30, 60×40 mm) và số tem. Mỗi tem là một trang in. Trình duyệt in thẳng hoặc "Lưu thành PDF".

**Ngoài phạm vi**
- Cảm biến xưởng (nhiệt độ sao, ẩm sấy): còn đóng băng theo lộ trình §4.
- Chia một phiếu cân cho nhiều mẻ.
- Sửa mẻ đã hoàn thành; mở lại mẻ.
- Đóng gói nhiều bao trong một lô, mã bao riêng.
- Bán hàng trừ tồn theo lô, gian hàng `/htx/[htx_code]`: GĐ3.
- Bản đồ trên trang QR.

**Điều cấm**
- Lô mới xuất được QR mà không truy về mẻ và phiếu cân (trừ khi bật `DXOS_LABS`, xem §7.6).
- Lấy từ một dòng tồn quá số kg còn lại.
- Hoàn thành mẻ lệch khoảng chuẩn mà không có giải trình.
- Huỷ phiếu cân đã vào mẻ; đưa phiếu đã huỷ, phiếu của HTX khác hay phiếu đã ở mẻ khác vào mẻ.
- Trang công khai hiện họ tên người khi HTX chưa bật.
- Gắn vào lô một chứng nhận đã hết hạn hoặc đã thu hồi.

## 3. Các cách đã cân nhắc

| Việc | Cách chọn | Cách khác |
|---|---|---|
| Phiếu vào mẻ | **Cột `processing_batch_id` trên `fresh_leaf_tickets`, ghi bằng lệnh cập nhật có điều kiện** (giống `settlement_id` của S4). Huỷ phiếu kiểm cùng cột đó, nên hai giao dịch chạy song song không lọt. | Bảng nối mẻ–phiếu: lệnh huỷ phiếu phải kiểm một bảng khác, và khi tranh chấp Postgres không đọc lại bảng đó trong cùng câu lệnh, nên vẫn lọt. |
| Hạng chè khô | **Bộ cố định 5 hạng của chè Thái Nguyên** (Đinh, Tôm nõn, Móc câu, Bồm, Cám) theo lộ trình. | Danh mục hạng do từng HTX tạo, như hạng búp ở S3: linh hoạt hơn nhưng chưa ai yêu cầu. |
| Truy lô về phiếu cân | **Lô → nguồn (dòng sản lượng của mẻ, số kg) → mẻ → mọi phiếu cân của mẻ.** Một mẻ trộn búp của nhiều phiếu, nên mọi phiếu của mẻ đều là nguồn của mọi hạng ra từ mẻ. | Gán từng phiếu cho từng hạng: không đúng với thực tế xưởng. |
| Kiểm cách ly của lô | **Theo từng phiếu cân nguồn:** quy tắc (b) của S1 với `H` = ngày cân (ngày Việt Nam), lứa = lứa của phiếu. | Một dòng mỗi thửa với ngày cân muộn nhất: bỏ sót một lần phun được ghi lùi ngày sau khi đã cân. |
| Lưu tệp chứng nhận | **Kho S3 đang chạy của stack (SeaweedFS, dịch vụ `seaweedfs`), qua client `minio` và `MinioDocumentAdapter` sẵn có, khoá `para/<htx_code>/Certificates/...`, tải lên qua server** để kiểm kích thước và loại tệp. Đây chính là SeaweedFS mà lộ trình nêu. | Link tải lên ký sẵn: server không kiểm được tệp. |
| Tem in | **Trang in HTML với `@page` đúng khổ tem.** Trình duyệt in hoặc lưu PDF. | Thư viện tạo PDF (`pdfkit`, `@react-pdf/renderer`): thêm phụ thuộc, mà máy in nhiệt vẫn in từ trình duyệt. |

## 4. Thiết kế

### 4.1. Dữ liệu (migration `20261128160000_processing_batches` và `20261128160100_certificates_and_public_names`)

**Migration 1 — mẻ và lô từ mẻ**
- enum `ProcessingBatchStatus`: `OPEN`, `FINISHED`, `CANCELLED`.
- enum `DryTeaGrade`: `DINH`, `TOM_NON`, `MOC_CAU`, `BOM`, `CAM`. Nhãn tiếng Việt nằm ở giao diện.
- Bảng `processing_batches`:
  - `id`, `htx_profile_id`;
  - `batch_code` (duy nhất): `{HTX}-MS-YYYYMMDD-NN` theo ngày chế biến, đánh số dưới khoá tư vấn theo HTX và ngày;
  - `processed_on DATE` (không sau hôm nay), `status` (mặc định `OPEN`), `master_name` (≤ 80), `shift` (≤ 40), `notes` (≤ 500), đều có thể rỗng;
  - `fresh_kg DECIMAL(10,1)`, `dry_kg DECIMAL(10,1)`, `recovery_ratio DECIMAL(5,2)`, `out_of_band BOOLEAN`, `deviation_note` (≤ 500): điền khi hoàn thành;
  - `created_by_id`, `created_at`, `finished_by_id`, `finished_at`, `cancelled_by_id`, `cancelled_at`, `cancel_reason`.
- Bảng `processing_batch_outputs`: `id`, `batch_id`, `grade DryTeaGrade`, `kg DECIMAL(9,1)` (> 0, ≤ 100000), duy nhất (`batch_id`, `grade`).
- `fresh_leaf_tickets.processing_batch_id` (có thể rỗng, khoá ngoại tới `processing_batches`, `ON DELETE RESTRICT`), có chỉ mục.
- Bảng `lot_batch_sources`: `id`, `lot_id`, `output_id` (khoá ngoại tới `processing_batch_outputs`), `kg DECIMAL(9,1)` (> 0), duy nhất (`lot_id`, `output_id`).
- `lots`: thêm `dry_grade DryTeaGrade` (có thể rỗng; lô cũ để rỗng).
- CHECK: `kg > 0` ở outputs và sources; `fresh_kg`, `dry_kg` ≥ 0; `recovery_ratio` > 0.
- Trigger kiểm toán (`dxos_audit_row`) cho `processing_batches`, `processing_batch_outputs`, `lot_batch_sources`: trong migration (có điều kiện như S1) và trong mảng của `platform/postgres/init/03-audit-triggers.sql`.

**Migration 2 — chứng nhận và tên công khai**
- enum `CertificateKind`: `VIETGAP`, `OCOP`, `ORGANIC`, `OTHER`.
- Bảng `htx_certificates`:
  - `id`, `htx_profile_id`, `kind`, `number` (≤ 60), `issuer` (≤ 120), `issued_on DATE`, `expires_on DATE` (≥ `issued_on`), `scope_note` (≤ 200, có thể rỗng: ví dụ "Vùng Tân Cương, 12 ha");
  - `file_key` (trong `para/<htx_code>/Certificates/`), `file_name`, `file_mime`, `file_size`;
  - `created_by_id`, `created_at`, `revoked_at`, `revoked_by_id`, `revoke_reason`.
- Bảng `lot_certificates`: `lot_id`, `certificate_id`, khoá chính kép.
- `htx_profiles.public_show_names BOOLEAN NOT NULL DEFAULT false`.
- Trigger kiểm toán cho `htx_certificates`, `lot_certificates` (`htx_profiles` đã có).

### 4.2. Mẻ sao sấy

- **Phiếu chọn được:** `VALID`, cùng HTX, `processing_batch_id` rỗng, cân trong 30 ngày gần nhất (lọc theo ngày ở danh sách; server không cấm phiếu cũ hơn).
- **Thêm phiếu vào mẻ:** chỉ khi mẻ `OPEN`. Một giao dịch:
  1. khoá dòng mẻ;
  2. `UPDATE fresh_leaf_tickets SET processing_batch_id = mẻ WHERE id IN (...) AND htx_profile_id = HTX AND status = 'VALID' AND processing_batch_id IS NULL`;
  3. nếu số dòng cập nhật khác số phiếu gửi lên thì huỷ cả giao dịch, trả 409 `TICKETS_CHANGED`.
- **Bỏ phiếu khỏi mẻ:** chỉ khi mẻ `OPEN`. Đặt lại `processing_batch_id` rỗng.
- **Sản lượng:** `PUT` thay cả bộ dòng sản lượng khi mẻ `OPEN`. Mỗi hạng tối đa một dòng.
- **Hoàn thành:**
  - Cần ít nhất 1 phiếu và 1 dòng sản lượng.
  - `fresh_kg` = tổng `net_kg` các phiếu; `dry_kg` = tổng kg sản lượng; `recovery_ratio` = `fresh_kg / dry_kg` làm tròn 2 chữ số (nửa lên).
  - Ngoài khoảng [4,50; 5,00] thì `out_of_band = true`, và phải có `deviation_note` dài ít nhất 10 ký tự, nếu không trả 422 `DEVIATION_NOTE_REQUIRED` cùng tỷ lệ.
  - Sau khi hoàn thành, mẻ và các dòng sản lượng không đổi nữa.
- **Huỷ mẻ:** chỉ khi `OPEN`, cần lý do. Mọi phiếu của mẻ được trả lại (`processing_batch_id` rỗng).
- **Huỷ phiếu cân (sửa S3):** điều kiện huỷ thêm `processing_batch_id IS NULL`. Phiếu đã vào mẻ trả 409 `TICKET_IN_BATCH` "Phiếu đã vào mẻ sao {batch_code}. Bỏ phiếu khỏi mẻ trước khi huỷ."
- **Quyết toán (S4) không đổi:** phiếu vào mẻ vẫn được quyết toán bình thường. Hai việc độc lập: tiền của xã viên và khối lượng của xưởng.

### 4.3. Tồn chè khô và đóng lô

- **Tồn của một dòng sản lượng** = `kg` − tổng `lot_batch_sources.kg` của dòng đó. Chỉ dòng của mẻ `FINISHED` mới là tồn.
- **Đóng lô** (`POST /api/lots/from-batches`): officer hoặc manager. Một giao dịch:
  1. Khoá các dòng sản lượng được chọn (`FOR UPDATE`).
  2. Mọi dòng phải cùng HTX, cùng hạng với lô, của mẻ `FINISHED`, và mỗi số kg lấy phải ≤ tồn. Sai thì trả 409 `STOCK_CHANGED` kèm tồn mới.
  3. Lấy mọi phiếu cân `VALID` của các mẻ nguồn. Với từng phiếu, đọc nhật ký phun của thửa và gọi `lotLineBlock(entries, H = ngày cân, cycle = lứa của phiếu)`. Phiếu nào bị chặn thì trả 422 `WITHDRAWAL_NOT_PASSED` kèm mã thửa, ngày cân và ngày an toàn.
  4. Tạo lô:
     - `commodity` "Chè";
     - `dry_grade`, `quality_grade` = nhãn tiếng Việt của hạng;
     - `harvest_date` = ngày cân muộn nhất trong các phiếu nguồn;
     - `packaging_date` = hôm nay;
     - `total_weight_kg` = `estimated_weight_kg` = tổng kg lấy;
     - `packaging_type`, `destination`, `buyer_name` nếu có;
     - `status` `READY`.
  5. Ghi `lot_batch_sources`. Ghi `lot_parcels` một dòng cho mỗi thửa có phiếu nguồn, với `cycle_id` = lứa của phiếu muộn nhất của thửa đó.
  6. Mã lô theo dạng hiện có `{htx}-CHE-YYYYMMDD-NNN`, nhưng đánh số dưới khoá tư vấn (sửa lỗi đếm-rồi-cộng của `PrismaLotRepository.create`, dùng cho cả đường cũ).
- **Đường tạo lô cũ** (`POST /api/lots` với `parcel_ids` và thao tác chat `lot-create`): chỉ chạy khi `DXOS_LABS` bật, như các tính năng đóng băng khác. Tắt thì trả 404 `NOT_FOUND`.
- **Xuất QR** (`ExportQrUseCase`):
  - Lô phải có ít nhất một nguồn mẻ, trừ khi `DXOS_LABS` bật. Không có thì trả 422 `LOT_WITHOUT_BATCH`.
  - Với lô từ mẻ, kiểm cách ly theo từng phiếu nguồn như bước 3, thay cho kiểm "mỗi thửa có lứa đã thu hoạch".
  - Lô không nguồn (đường cũ, khi `DXOS_LABS` bật) giữ kiểm như hiện tại.
  - Nhận `certificate_ids` (tuỳ chọn). Mỗi id phải cùng HTX, chưa thu hồi và `expires_on` ≥ hôm nay, sai thì 422 `CERTIFICATE_NOT_VALID`. Không gửi thì gắn mọi chứng nhận còn hiệu lực của HTX.
  - Ghi `lot_certificates`, và thêm `file_key` của chúng vào `certificate_keys` để route tải chứng nhận công khai hiện có tiếp tục chạy.
  - Ảnh QR mã hoá `${base}/q/${lot_code}`.

### 4.4. Chứng nhận

- Tải lên qua `POST /api/certificates` (`multipart/form-data`: `file` + các trường). Chỉ `application/pdf`, `image/jpeg`, `image/png`, kiểm cả byte đầu tệp. Tối đa 10 MB (§2.1). Server ghi bằng `MinioDocumentAdapter.uploadDocument` vào `para/<htx_code>/Certificates/<uuid>-<tên đã làm sạch>`.
- Manager và officer thêm. Chỉ manager thu hồi (có lý do). Không xoá; chứng nhận đã gắn vào lô vẫn hiện trên trang QR với trạng thái mới.
- Trạng thái hiển thị tính lúc xem:
  - "Đã thu hồi" khi `revoked_at` có giá trị;
  - "Đã hết hạn" khi hôm nay > `expires_on`;
  - "Còn hiệu lực đến dd/mm/yyyy" trong các trường hợp còn lại.

### 4.5. Trang QR `/q/[lot_code]`

`LotTraceData` thêm ba khối (tất cả có thể rỗng để đọc được ảnh chụp cũ):
- `batches[]`: `batch_code`, `processed_on`, `master_name`, `fresh_kg`, `dry_kg`, `recovery_ratio`, `out_of_band`, `kg_in_lot`, `grade`, `ticket_count`, `parcel_codes[]`.
- `intake[]`: mỗi phiếu nguồn một dòng `{ parcel_code, cycle_label, weighed_on, net_kg, safe_on }`. Không có tên hộ, không có mã phiếu.
- `certificates[]`: `{ id, kind, number, issuer, issued_on, expires_on, file_key }`.

Bốn tầng hiển thị:
1. **Vùng trồng:** tên HTX, các thửa (mã, diện tích, lứa).
2. **An toàn cách ly:** "Đạt" khi mọi phiếu nguồn đã qua ngày an toàn. Có bảng ngày cân và ngày an toàn từng thửa, và dòng thời gian nhật ký đã duyệt như hiện nay.
3. **Mẻ sao chế biến:** mã mẻ, ngày, kg tươi vào, kg khô ra, tỷ lệ (đánh dấu nếu lệch), phần kg của lô. Có câu "Lô {kg} kg hạng {hạng} lấy từ {n} mẻ, {m} phiếu cân."
4. **Chứng nhận:** loại, số, nơi cấp, hiệu lực tính lúc xem (§4.4), nút tải tệp qua route công khai hiện có.

Thêm vào đó:
- **Tên người** (`household_name`, `performed_by`, `master_name`) chỉ hiện khi `public_show_names` của HTX bật; ẩn ngay lúc dựng trang, kể cả với ảnh chụp cũ.
- Khối "Kiểm chứng AI" của `/lot` (M14) chuyển sang `/q`.
- `/lot/[lot_code]` trả chuyển hướng 308 tới `/q/[lot_code]`.

### 4.6. API (`withErrorHandler`, zod `.strict()`, phong bì `{data}` / `{error:{code,message}}`, phân quyền theo HTX)

| Route | Vai | Ghi chú |
|---|---|---|
| `GET /api/processing-batches?status=&from=&to=` | officer, manager | Danh sách mẻ, mới nhất trước |
| `POST /api/processing-batches` | officer, manager | `{ processed_on, master_name?, shift?, notes? }`; 201 |
| `GET /api/processing-batches/[id]` | officer, manager | Mẻ, phiếu, sản lượng, tổng tươi/khô và tỷ lệ tạm tính |
| `GET /api/processing-batches/available-tickets?from=&to=` | officer, manager | Phiếu chọn được (§4.2) |
| `POST /api/processing-batches/[id]/tickets` | officer, manager | `{ ticket_ids: string[1..200] }`; 409 `TICKETS_CHANGED`, 409 `BATCH_NOT_OPEN` |
| `DELETE /api/processing-batches/[id]/tickets/[ticketId]` | officer, manager | 409 `BATCH_NOT_OPEN` |
| `PUT /api/processing-batches/[id]/outputs` | officer, manager | `{ outputs: [{ grade, kg }] }` (0..5, hạng không trùng) |
| `POST /api/processing-batches/[id]/finish` | officer, manager | `{ deviation_note? }`; 422 `BATCH_EMPTY`, 422 `DEVIATION_NOTE_REQUIRED` |
| `POST /api/processing-batches/[id]/cancel` | officer, manager | `{ reason }` (3..200) |
| `GET /api/dry-stock?grade=` | officer, manager | Dòng tồn > 0 |
| `POST /api/lots/from-batches` | officer, manager | `{ grade, sources: [{ output_id, kg }], packaging_type?, destination?, buyer_name? }`; 201; 409 `STOCK_CHANGED`, 422 `WITHDRAWAL_NOT_PASSED` |
| `GET /api/certificates` | officer, manager | Mọi chứng nhận của HTX kèm trạng thái |
| `POST /api/certificates` | officer, manager | multipart; 201; 400 `FILE_TOO_LARGE`, 400 `FILE_TYPE` |
| `GET /api/certificates/[id]/file` | officer, manager | 302 tới link ký sẵn 1 giờ |
| `POST /api/certificates/[id]/revoke` | manager | `{ reason }` |
| `PUT /api/htx/public-settings` | manager | `{ public_show_names: boolean }` |
| `POST /api/lots/[id]/export-qr` | officer, manager | thêm `certificate_ids?`; 422 `LOT_WITHOUT_BATCH`, 422 `CERTIFICATE_NOT_VALID` |

Mọi route mới vào nhóm `miniApp` của bảng phủ Telegram (`application/telegram/coverage.ts`), như S4.

### 4.7. Giao diện

- **Cán bộ KT và trưởng HTX: "Xưởng sao sấy"** (`/officer/processing`, `/manager/processing`), thêm vào menu nhóm "Vận hành":
  - danh sách mẻ có trạng thái, tỷ lệ, cờ lệch;
  - nút "Mở mẻ mới";
  - trang mẻ có ba khối:
    - phiếu cân (chọn từ danh sách chọn được, lọc theo ngày, xem tổng kg);
    - sản lượng theo 5 hạng;
    - tỷ lệ tạm tính và đèn khoảng chuẩn;
  - nút "Hoàn thành mẻ", với ô giải trình bắt buộc khi lệch;
  - nút "Huỷ mẻ".
- **Lô hàng** (`/officer/lots`, `/manager/lots`):
  - nút "Đóng lô từ mẻ" mở một bước: chọn hạng → bảng tồn (mẻ, ngày, tồn) với ô kg điền sẵn bằng tồn → thông tin đóng gói → tạo;
  - nút tạo lô cũ chỉ hiện khi `DXOS_LABS` bật;
  - trang lô hiện nguồn mẻ, chứng nhận khi xuất, và nút "In tem".
- **Chứng nhận** (`/manager/certificates`, `/officer/certificates`): danh sách, thêm (tệp + trường), thu hồi (manager).
- **Hồ sơ HTX** (`/manager/profile`): công tắc "Hiện tên người trên trang truy xuất công khai", mặc định tắt.
- **In tem** (`/officer/lots/[lot_code]/labels`, `/manager/lots/[lot_code]/labels`):
  - chọn khổ và số tem (1..500);
  - mỗi tem có QR, mã lô, "Chè {hạng}", khối lượng lô, tên HTX;
  - `@page { size: <khổ>; margin: 0 }`, mỗi tem một trang.
- **Trang QR công khai** `/q/[lot_code]`: 4 tầng §4.5, rõ trên điện thoại, cả sáng và tối.

## 5. Ràng buộc

- Mọi phép tính kg dùng số nguyên phần mười (BigInt hoặc số nguyên) như `ticket-math.ts`. Không cộng số thực.
- Mọi so sánh ngày dùng ngày Việt Nam (`vnDayOf`, `vnDayStart`).
- Không thêm phụ thuộc mới. Dùng `qrcode` và `minio` đã có.
- Không gửi họ tên, số điện thoại hay tài khoản ra trang công khai khi `public_show_names` tắt.
- Theo `docs/rules-and-limits.md` §5 (TypeScript strict, CSS module, lỗi theo mẫu).

## 6. Kiểm chứng

- Kiểm thử đơn vị:
  - tỷ lệ và khoảng chuẩn (4,49 / 4,50 / 5,00 / 5,01);
  - tồn kho;
  - kiểm cách ly theo từng phiếu, kể cả trường hợp một lần phun ghi lùi ngày sau khi đã cân;
  - mã mẻ và mã lô.
- Kiểm thử route cho mọi mã lỗi ở §4.6 và mọi vai bị từ chối.
- Kiểm thử Postgres thật (như S4) cho bốn trường hợp tranh chấp:
  - huỷ phiếu song song với thêm phiếu vào mẻ;
  - hai lô cùng lấy một dòng tồn;
  - hai lô cùng đánh số trong một ngày;
  - xuất QR khi chứng nhận vừa bị thu hồi.
- Hai vòng giao diện (desktop và mobile, sáng và tối) cho các trang mới và `/q`. Luồng đủ: cân 3 phiếu → mẻ → hoàn thành (một lần lệch có giải trình) → đóng lô → thêm chứng nhận → xuất QR → quét `/q` → `/lot` chuyển hướng → in tem.

## 7. Quyết định trong đêm (cần chủ dự án xem lại)

1. **Phiếu vào mẻ nguyên phiếu.** Không chia phiếu. Lý do: một phiếu là một lần cân của một hộ, thường dưới vài trăm kg. Chia phiếu cần bảng phân bổ và quy tắc làm tròn mà chưa ai yêu cầu.
2. **Bộ 5 hạng cố định** (Đinh, Tôm nõn, Móc câu, Bồm, Cám) như lộ trình. HTX cần hạng khác thì làm thành danh mục theo HTX ở bản sau.
3. **Khoảng chuẩn 4,50–5,00 : 1** cố định trong mã (`RECOVERY_BAND`). Lệch thì vẫn cho hoàn thành nếu có giải trình, đúng KPI "độ lệch không giải trình". Cấu hình theo HTX để sau.
4. **Mẻ đã hoàn thành là cuối.** Sai thì huỷ được khi còn `OPEN`. Mở lại mẻ đã hoàn thành để sau, khi có ca thật.
5. **Phiếu trong mẻ không huỷ được** (409 `TICKET_IN_BATCH`); phải bỏ phiếu khỏi mẻ đang mở trước.
6. **Đóng băng đường tạo lô cũ** sau `DXOS_LABS` ("Freeze, don't delete" như GĐ0), và xuất QR cần nguồn mẻ. Đây là thay đổi hành vi có chủ đích để đạt DoD "100% lô xuất QR truy về mẻ và phiếu cân":
   - lô `READY` cũ không có nguồn sẽ không xuất QR được nữa khi `DXOS_LABS` tắt;
   - lô đã xuất trước đó vẫn hiện bình thường.

   Nếu anh muốn giữ đường cũ mở thì chỉ cần bỏ cổng `DXOS_LABS` ở hai route.
7. **Kiểm cách ly theo từng phiếu nguồn** với ngày cân là `H` (quy tắc (b) của S1). Lý do ở §3.
8. **Dùng kho S3 đang chạy.** Stack đã chạy SeaweedFS (dịch vụ `seaweedfs`) và web gọi vào qua client `minio`, nên chứng nhận nằm trên SeaweedFS như lộ trình viết, không thêm dịch vụ. Các tên `MINIO_*` trong mã là tên cũ của client, không phải một dịch vụ MinIO.
9. **Tên người ẩn mặc định, áp lúc hiển thị** (cả lô cũ). Tên nghệ nhân sao chè tính là tên người.
10. **Không thêm thư viện PDF.** Tem in từ trang HTML đúng khổ, "Lưu thành PDF" bằng trình duyệt.
11. **Quyền:** officer và manager làm mẻ, lô, chứng nhận (bảng vai §6 của lộ trình ghi Cán bộ KT "Lập Mẻ sao sấy & Đóng lô in tem QR"). Kế toán không vào xưởng. Chỉ manager thu hồi chứng nhận và bật hiện tên.

## Ghi chú sau triển khai

Mã là nguồn cuối cùng. Phần dưới liệt kê chỗ mã khác thân đặc tả (đã tính các quyết định ở mục 7).

1. **Lỗi 422 có mã riêng (`UnprocessableError`).** Mã `BATCH_EMPTY`, `DEVIATION_NOTE_REQUIRED`, `WITHDRAWAL_NOT_PASSED`, `GRADE_MISMATCH`, `LOT_WITHOUT_BATCH` và `CERTIFICATE_NOT_VALID` nằm ở trường `error.code`, cạnh `message` và các trường chi tiết (`recovery_ratio`, `parcel_code`, `weighed_on`, `safe_on`, `certificate_ids`). Riêng ở xuất QR, `WITHDRAWAL_NOT_PASSED` trước đây chỉ là tiền tố của thông điệp `DOMAIN_ERROR`; nay là mã thật. Các lỗi xuất QR khác (lô đã xuất, không ở `READY`, không có thửa) vẫn là 422 `DOMAIN_ERROR`.
2. **`GRADE_MISMATCH` tách khỏi `STOCK_CHANGED`.** Mục 4.3 bước 2 gộp mọi sai lệch của dòng tồn vào 409 `STOCK_CHANGED`. Mã chỉ dùng 409 `STOCK_CHANGED` (kèm `error.stock`) khi dòng không thuộc HTX, mẻ chưa `FINISHED`, kg lấy lớn hơn tồn còn lại, hoặc các mẻ nguồn không có phiếu cân; dòng khác hạng với lô trả 422 `GRADE_MISMATCH`.
3. **Ghi chú lệch quá ngắn là 400.** `deviation_note` được kiểm bằng zod (10 đến 500 ký tự sau khi cắt khoảng trắng), nên ghi chú ngắn hơn 10 ký tự trả 400 `VALIDATION_ERROR`. 422 `DEVIATION_NOTE_REQUIRED` chỉ trả khi tỷ lệ lệch mà không gửi ghi chú.
4. **Chuyển hướng `/lot` nằm ở `next.config.js`.** Thư mục `app/lot` đã xoá; `redirects()` trả 308 (`permanent: true`) từ `/lot/:lot_code` sang `/q/:lot_code`, thay vì một trang `/lot/[lot_code]` tự chuyển hướng (mục 4.5).
5. **`lot_certificates` có `id` riêng.** Mục 4.1 viết khoá chính kép; mã dùng `id` TEXT làm khoá chính và khoá duy nhất `(lot_id, certificate_id)`, vì `audit.capture_row()` lấy khoá hàng từ cột `id`.
6. **Chứng nhận trên trang QR đọc trực tiếp.** Khối `certificates[]` của dữ liệu truy xuất có thêm `revoked_at`, và được đọc từ cơ sở dữ liệu lúc dựng trang chứ không từ ảnh chụp lúc xuất, nên thu hồi sau khi xuất hiện ngay. Trạng thái hiển thị vẫn tính lúc xem; `file_key` vẫn được thêm vào `certificate_keys` khi xuất.
7. **Trang in tem.** `/officer/lots/[lot_code]/labels` chỉ cho vai `officer` và `/manager/lots/[lot_code]/labels` chỉ cho vai `manager` (vai khác về `/login`); khổ tem là 50×30, 40×30 hoặc 60×40 mm, 1 đến 500 tem.
8. **Route đọc cài đặt tên công khai.** Có thêm `GET /api/htx/public-settings` (`manager`, `officer`); mục 4.6 chỉ liệt kê `PUT`.
9. **Lỗi thu hồi và huỷ phiếu.** Thu hồi chứng nhận đã thu hồi trả 409 `CERTIFICATE_REVOKED`; huỷ phiếu cân đã vào mẻ trả 409 `TICKET_IN_BATCH` kèm mã mẻ.
10. **Danh sách lô.** `GET /api/lots` nhận thêm `visibility=published` (lô `READY` và `QR_EXPORTED`). Danh sách mẻ trả tối đa 200 mẻ, danh sách phiếu chọn được tối đa 500 phiếu.
11. **Đường tạo lô cũ khi `DXOS_LABS` tắt.** `POST /api/lots` trả 404 `NOT_FOUND` ("Tính năng này chưa mở."); thao tác chat `lot-create` trả "Tạo lô từ thửa đã chuyển sang Đóng lô từ mẻ.".
