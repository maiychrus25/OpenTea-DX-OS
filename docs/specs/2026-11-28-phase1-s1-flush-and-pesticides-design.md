<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ1 dự án con 1: Lứa hái chè và Danh mục thuốc BVTV

> **Trạng thái:** Bản thiết kế (2026-11-28). Nhánh `feat/phase1-value-chain`.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §3 `[P]` rào chắn 1 và 2, §5 GĐ1 mục 1 và 2; [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md); DEV-010, DEV-015.
> **Quyết định của chủ dự án (2026-11-28):**
> - Phạm vi gồm: gắn `cycle_id`; tự mở lứa mới khi chăm sóc sau hái; thêm `PRUNING` (Đốn chè); hàng đợi offline cho nhật ký; nút "Sửa lại" khi `REQUEST_CHANGES`; nút "Nghiệm thu đạt cách ly" trên web; cán bộ kê đơn ở `/officer/diseases` chọn thuốc từ danh mục, tự tạo nháp nhật ký phun và khoá thời gian cách ly.
> - Danh mục khởi đầu là đúng các thuốc trong bảng tra cán bộ của PR #99 (Hướng dẫn 528 Chi cục TT&BVTV Thái Nguyên, đối chiếu TT 75/2025/TT-BNNMT), không thêm tên nào.
> - Thời gian cách ly mặc định theo nhóm: thuốc vi sinh hoặc thảo mộc sàn 7 ngày; thuốc hoá học hoặc kháng sinh sàn 14 ngày. Mọi dòng mặc định gắn cờ "Mức sàn mặc định — cần đối chiếu nhãn thực tế".
> - Cán bộ kỹ thuật và trưởng HTX sửa được số ngày theo nhãn thuốc thật tại kho HTX; `platform_admin` sửa được danh mục chung (dự án con 2).
> - Nông dân chọn thuốc thì số ngày cách ly tự điền và không hạ được thấp hơn sàn. Thuốc ngoài danh mục ("Thuốc khác") bị khoá sàn 14 ngày và chờ cán bộ duyệt.
> - Mọi bảng mới có trigger kiểm toán.

## 1. Mục đích

Chè hái 7 đến 9 lứa mỗi năm. Hôm nay nhật ký, lịch thu hái và lô hàng chỉ biết "nương", không biết "lứa". Hệ quả:

- Lần phun chăm sóc cho lứa sau chặn luôn việc nghiệm thu, tạo lô và xuất QR của lứa vừa hái.
- Số ngày cách ly do người ghi tự gõ. Riêng form của cán bộ không có ô này, nên một lần phun do cán bộ ghi được lưu mà không có ngày cách ly.

Dự án con này dựng **rào chắn 1 (lứa hái)** và **rào chắn 2 (danh mục thuốc)** của roadmap. Đây là nền cho chốt chặn ở bàn cân của dự án con 3.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- **G1. Lứa hái:** mỗi nhật ký và mỗi dòng lô gắn đúng một lứa. Ghi chăm sóc sau khi hái thì tự mở lứa mới. Có thêm hoạt động "Đốn chè".
- **G2. Cách ly theo lứa:** nghiệm thu thu hoạch, tạo lô, xuất QR, lịch thu hái và hai agent chỉ tính các lần phun **của lứa đó**.
- **G3. Danh mục thuốc:** có danh mục; số ngày cách ly không bao giờ thấp hơn mức sàn. Server ép luật này trên mọi kênh ghi nhật ký: web của nông dân, web của cán bộ, Telegram, kê đơn.
- **G4. Nông dân sửa lại được** nhật ký bị trả về (`REQUEST_CHANGES` hoặc `REJECTED`), đổi được cả thuốc, liều và ngày cách ly, rồi gửi lại.
- **G5. Ghi nhật ký offline:** mất mạng vẫn ghi được, có mạng thì tự gửi, không tạo bản trùng.
- **G6. Nút "Nghiệm thu đạt cách ly" trên web** cho cán bộ và trưởng HTX.
- **G7. Cán bộ kê đơn từ danh mục** khi xác nhận ca bệnh. Hệ thống tạo nháp nhật ký phun cho nông hộ; nông hộ xác nhận "Đã phun" thì thời gian cách ly bắt đầu tính.

**Ngoài phạm vi**
- Gợi ý thuốc theo vật tư hộ đã ứng: cần dữ liệu cấp ứng của dự án con 4. Ở dự án con này, thuốc hộ đã dùng gần nhất được xếp lên đầu.
- Trang danh mục chung của `platform_admin`: dự án con 2.
- Bàn cân và chốt chặn khi cân: dự án con 3.
- Đổi tên trạng thái nương `SOWING`.

**Điều cấm**
- Bất kỳ đường ghi nào lưu được lần phun có số ngày cách ly thấp hơn mức sàn, hoặc lần phun không có ngày cách ly.
- Thêm tên thuốc ngoài bảng nguồn vào danh mục khởi đầu. Ghi số ngày cách ly "theo nhãn" khi chưa có ai đối chiếu nhãn.
- Đổi cách tính bằng chứng (hash) của agent mà không sửa đồng thời phía Python và bộ véc-tơ kiểm thử. Tốt nhất là không đổi.
- Làm mất liên kết lứa của dữ liệu cũ. Migration phải gán lứa cho toàn bộ nhật ký và dòng lô đang có.

## 3. Các cách đã cân nhắc

| Việc | Cách chọn | Cách khác |
|---|---|---|
| Gắn lứa | **Cột `cycle_id` (khoá ngoại, cho phép rỗng với dữ liệu cũ) trên `journal_entries` và `lot_parcels`, gán lúc ghi.** | Suy ra lứa theo ngày mỗi lần đọc: chậm, dễ sai ở ranh giới hai lứa, và hiện đã gây lỗi. |
| Tự mở lứa | **Mở lứa lúc ghi nhật ký chăm sóc trên nương chưa có lứa mở**, kể cả khi nhật ký đang chờ duyệt. Lứa là "khung thời gian"; mở sớm không làm sai cách ly. | Chỉ mở khi duyệt: trong lúc chờ, lần phun mới bị gán vào lứa đã hái, khoá lô vừa hái (đúng lỗi đang có). |
| Mức sàn cách ly | **Một hàm miền `resolveWithdrawal` gọi trong use case tạo và sửa nhật ký**, dùng chung cho mọi kênh. | Chỉ kiểm ở form: Telegram và API đi vòng qua được. |
| Danh mục theo HTX | **Danh mục chung (`pesticide_products`) và nhãn theo HTX (`htx_pesticide_labels`).** Số ngày hiệu lực của một HTX là nhãn đã đối chiếu của HTX đó; nếu chưa có thì lấy mức của danh mục chung. | Mỗi HTX một bản sao danh mục: lặp dữ liệu, khó cập nhật khi Bộ đổi danh mục. |
| Offline | **Hàng đợi IndexedDB (`idb-keyval` đã có), khoá chống trùng `client_id`**, theo mẫu `useOfflineSync` của chẩn đoán bệnh. | Background Sync của service worker: phức tạp, Safari không hỗ trợ. |

Các lựa chọn trên là của em; chủ dự án giao cách làm.

## 4. Thiết kế

### 4.1. Dữ liệu (một migration Prisma)

**Enum**
- `ActivityType` thêm `PRUNING`.
- Mới: `PesticideGroup { BOTANICAL, MICROBIAL, BIOLOGICAL, CHEMICAL, ANTIBIOTIC }`.

**Cột mới**
- `journal_entries.cycle_id String?`, khoá ngoại tới `parcel_crop_cycles(id)`, có index.
- `journal_entries.client_id String? @unique` (uuid do máy khách sinh, chống trùng khi gửi lại).
- `lot_parcels.cycle_id String?`, khoá ngoại tới `parcel_crop_cycles(id)`.
- `journal_activities.pesticide_product_id String?`, khoá ngoại tới `pesticide_products(id)`.
- `ParcelCropCycle` thêm quan hệ ngược `journal_entries` và `lot_parcels`.

**Bảng `pesticide_products` (danh mục chung)**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | String, cuid | |
| `trade_name` | String, unique | |
| `active_ingredient` | String | |
| `group` | `PesticideGroup` | |
| `targets` | `String[]` | đối tượng phòng trừ, theo đúng chữ của nguồn |
| `default_phi_days` | Int | mức sàn |
| `phi_needs_label_check` | Boolean, mặc định `true` | |
| `source` | String | trích nguồn |
| `active` | Boolean, mặc định `true` | |
| `created_at`, `updated_at` | DateTime | |

**Bảng `htx_pesticide_labels` (nhãn theo HTX)**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | String, cuid | |
| `htx_profile_id` | String | khoá ngoại |
| `pesticide_product_id` | String | khoá ngoại |
| `label_phi_days` | Int, ≥ 1 | |
| `label_note` | String? | ví dụ số lô thuốc, hạn dùng |
| `verified_by_id` | String | Keycloak sub |
| `verified_at` | DateTime | |
| `created_at`, `updated_at` | DateTime | |

Ràng buộc `@@unique([htx_profile_id, pesticide_product_id])`.

**Dữ liệu khởi đầu**

Migration tự chèn danh mục (`INSERT ... ON CONFLICT (trade_name) DO NOTHING`) để môi trường thật có ngay, không phụ thuộc seed. Có **20 dòng** lấy từ 19 dòng của bảng nguồn; dòng "Daconil 75WP, 500SC" tách thành hai sản phẩm.

- **Nhóm:**
  - Chỉ dùng đúng nhãn ghi trong nguồn: "(thảo mộc)" là `BOTANICAL`, "(vi sinh)" là `MICROBIAL`, "(sinh học)" là `BIOLOGICAL`, "(kháng sinh)" là `ANTIBIOTIC`.
  - Dòng không ghi nhãn là `CHEMICAL`. Như vậy mọi thuốc có Abamectin, Emamectin, Imibenconazole, Propineb, Chlorothalonil là `CHEMICAL`.
  - Vinup (Abamectin + Azadirachtin) có hoạt chất hoá học nên là `CHEMICAL`.
- **Mức sàn:**
  - `BOTANICAL`, `MICROBIAL`, `BIOLOGICAL`: **7** ngày.
  - `CHEMICAL`, `ANTIBIOTIC`: **14** ngày.
- **`targets`:** đúng các cột "x" của bảng sâu hại, hoặc tên bệnh của bảng bệnh. Với bảng khô cành, ghi cả "khô cành, chết ngọn" và cột "đăng ký trên chè cho".
- **`source`:** "Hướng dẫn 528/CCTTBVTV-TTBVTV (21/4/2026), Chi cục TT&BVTV Thái Nguyên; đối chiếu Phụ lục I TT 75/2025/TT-BNNMT" cho bảng sâu hại và bảng khô cành; "Chỉ đạo phòng trừ vụ Xuân 2026, Thái Nguyên" cho bảng phồng lá.
- **Không chèn** "Catex 100WG" và "Antracol 700WG" (mục "Chỗ lệch" của nguồn).

Bản chép bảng nguồn để người làm chép đúng chữ nằm ở phụ lục A.

**Gán lứa cho dữ liệu cũ (cùng migration)**
- Mỗi `journal_entries` được gán lứa của cùng nương có `coalesce(sowed_at, created_at) <= entry_date` lớn nhất. Nếu không có lứa nào như vậy thì gán lứa sớm nhất của nương. Nương không có lứa nào thì để rỗng.
- Mỗi `lot_parcels` được gán lứa của nương có `harvested_at <= lot.harvest_date` lớn nhất. Nếu không có thì gán lứa mới nhất (theo `created_at`).

**Kiểm toán**
- Thêm `pesticide_products` và `htx_pesticide_labels` vào mảng bảng trong `platform/postgres/init/03-audit-triggers.sql`.
- Trong migration cũng gắn trigger `dxos_audit_row` cho hai bảng này (idempotent, cú pháp chép từ migration `20261127190000_app_builder`), để cơ sở dữ liệu đang chạy có ngay.

**Hasura**
- Vai `'*'` tự thấy cột mới sau khi tải lại metadata.
- Vai `agent` được thêm `cycle_id` vào `journal_entries` và `pesticide_product_id` vào `journal_activities`. Sửa `EXPECTED_COLUMNS` trong `platform/tests/test_hasura_agent_permissions.py`.
- Hai bảng danh mục không đưa lên Hasura: web đọc qua Prisma.

### 4.2. Miền: mức sàn cách ly

Hàm thuần trong `apps/web/src/domain/journal/withdrawal-floor.ts`:

```ts
export const CUSTOM_PRODUCT_FLOOR_DAYS = 14
export type ProductFloor = { productId: string; floorDays: number } | null   // null = "Thuốc khác"
export function resolveWithdrawal(input: { floor: ProductFloor; requestedDays: number | null }):
  { ok: true; days: number } | { ok: false; code: 'WITHDRAWAL_BELOW_FLOOR'; floorDays: number }
```

- **Có sản phẩm:** `floorDays` là số ngày hiệu lực của HTX: `label_phi_days` nếu HTX đã đối chiếu nhãn, ngược lại `default_phi_days`.
- **Thuốc khác:** sàn 14.
- **Không gửi số ngày:** lấy đúng mức sàn.
- **Gửi số ngày:** nhỏ hơn sàn thì trả lỗi; bằng hoặc lớn hơn thì nhận.

Áp dụng cho mọi hoạt động `SPRAYING`. Các hoạt động khác giữ nguyên hành vi.

**Use case**
- `CreateJournalEntryUseCase` và `UpdateJournalEntryUseCase` gọi `resolveWithdrawal` trước khi ghi. Lỗi thì trả 422 `WITHDRAWAL_BELOW_FLOOR`, thông điệp "Thời gian cách ly không được thấp hơn {n} ngày (mức sàn của thuốc này)."
- Nếu kênh ghi chỉ gửi tên thuốc (Telegram) mà tên trùng `trade_name` của một sản phẩm đang dùng (không phân biệt hoa thường, bỏ khoảng trắng thừa), hệ thống tự gắn `pesticide_product_id`.

**Cờ "chờ cán bộ duyệt" cho thuốc khác:** nhật ký của nông dân vốn đã `PENDING_APPROVAL` nên không cần trạng thái mới. Nhật ký có thuốc khác hiện nhãn "Thuốc ngoài danh mục" trong danh sách duyệt của cán bộ. Agent A1 coi đây là cảnh báo cần cán bộ xem.

### 4.3. Vòng đời lứa

Hàm `ensureOpenCycle(tx, parcelId, now)` trong `PrismaCropCycleRepository`:
- Trả lứa mở (`harvested_at` rỗng) mới nhất của nương.
- Nếu không có lứa mở: tạo lứa kế tiếp với nhãn `nextHarvestRoundSeason` và `sowed_at = now`; nếu nương đang `HARVESTED` thì chuyển sang `TENDING`.
- Mọi thứ trong cùng một transaction.

**Khi tạo nhật ký** (`PrismaJournalRepository.create`):
- Hoạt động chăm sóc (`FERTILIZING`, `SPRAYING`, `IRRIGATION`, `PRUNING`, `OTHER`): `cycle_id = ensureOpenCycle(...)`.
- `HARVEST`: `cycle_id` là lứa mở mới nhất. Nếu không có lứa mở thì lấy lứa mới nhất theo `created_at`.
- `SOWING`: lứa mở mới nhất, hoặc `ensureOpenCycle`.

**Khi nhật ký được duyệt** (`applyParcelStatus`):
- `HARVEST` đóng **đúng lứa của nhật ký** (`harvested_at = entry_date` nếu đang rỗng) và chuyển nương sang `HARVESTED`. Không còn đóng "lứa mới nhất theo `created_at`".
- `PRUNING` cùng các hoạt động chăm sóc chuyển nương sang `TENDING`, như hiện nay.

**Nút "Bắt đầu lứa mới"** (`startNextRound`) giữ nguyên và an toàn khi gọi nhiều lần. Nếu nương `HARVESTED` đã có một lứa mở (do tự mở) thì chỉ chuyển `TENDING` và trả lứa đó.

### 4.4. Cách ly theo lứa

Quy tắc chung: chỉ tính các lần phun có `cycle_id` bằng lứa đang xét và trạng thái không phải `DRAFT` hay `REJECTED`. Nhật ký cũ có `cycle_id` rỗng vẫn tính theo cả nương, để không nới an toàn với dữ liệu chưa gán lứa.

| Chỗ | Lứa đang xét |
|---|---|
| `ApproveHarvestUseCase` | lứa mở mới nhất của nương; không có lứa mở thì trả lỗi "Nương chưa có lứa đang chăm sóc" |
| `CreateLotUseCase` | lứa của từng dòng lô: lứa có `harvested_at ≤ harvest_date` lớn nhất, ngược lại lứa mở; ghi vào `lot_parcels.cycle_id` |
| `prisma-lot-trace-repository.ts` và `ExportQrUseCase` | `lot_parcels.cycle_id`; bỏ giới hạn "100 nhật ký cũ nhất" bằng cách lọc theo lứa |
| `PrismaCropCycleRepository.getHarvestSchedule` | lứa của sự kiện lịch |
| `platform/agent/.../harvest_ready.py` (A4) | chỉ các lần phun của lứa mở đang xét (lọc `cycle_id` trong truy vấn GraphQL) |
| `platform/agent/.../journal_review.py` (A1) | so với ngày hái của **lứa của chính nhật ký** |

**Không đổi** giá trị đưa vào bằng chứng (hash) của agent. Nếu buộc phải đổi thì sửa đồng thời `platform/agent/dxos_agent/evidence.py` và `fixtures/evidence-vectors*.json`, và ghi rõ trong báo cáo.

### 4.5. API

- **`GET /api/pesticides?target=&q=`** (vai `farmer`, `officer`, `manager`): danh mục đang dùng.
  - Mỗi dòng: `id`, `trade_name`, `active_ingredient`, `group`, `targets`, `floor_days` (hiệu lực của HTX người gọi), `default_phi_days`, `label` (`label_phi_days`, `label_note`, `verified_at` hoặc `null`), `needs_label_check` (`true` khi HTX chưa đối chiếu nhãn **và** danh mục chung còn cờ).
  - Với nông dân, sản phẩm mà hộ đã dùng trong 365 ngày được xếp lên đầu (theo lần dùng gần nhất).
- **`PUT /api/pesticides/[id]/label`** (`officer`, `manager`): `{ label_phi_days: int 1..365, label_note?: string ≤ 200 }`, ghi nhãn của HTX người gọi. `DELETE` cùng đường dẫn thì gỡ nhãn của HTX.
- **`POST /api/journal`:**
  - Mỗi hoạt động thêm `pesticide_product_id?: string`.
  - Thân request thêm `client_id?: uuid`. Nếu `client_id` đã tồn tại **cho cùng người gửi** thì trả 200 kèm nhật ký cũ, không tạo mới. Nếu tồn tại cho người khác thì trả 409.
  - Thêm `activity_type` `PRUNING`.
- **`PUT /api/journal/[id]`:**
  - Ghi được `activities` (thay toàn bộ, tính lại `safe_harvest_date`), `entry_date`, `observation`, ảnh.
  - Không đổi được nương.
  - Thêm `submit?: boolean`: nhật ký `DRAFT` hoặc đang bị trả về, khi `submit = true`, thì chuyển `PENDING_APPROVAL`, xoá `review_note` và `reviewed_by_id`, rồi báo cán bộ (`JOURNAL_SUBMITTED`) như khi tạo.
- **`POST /api/parcels/[id]/approve-harvest`:**
  - Chuyển sang `withErrorHandler` và envelope `{ error: { code, message } }`.
  - Kiểm vai `officer`, `manager` ngay ở route.
- **`PUT /api/officer/diseases/[id]/review`:** thêm `prescription?: { pesticide_product_id: string, dosage?: string ≤ 100 }`, chỉ hợp lệ khi `status = CONFIRMED`.
  - Khi có, cùng một transaction tạo nhật ký `DRAFT`, `SPRAYING`, cho nương của ca bệnh:
    - `cycle_id = ensureOpenCycle`;
    - hoạt động có `pesticide_product_id`, liều, `withdrawal_days = floor`;
    - `submitted_role = OFFICER`, `notes = "Theo kê đơn ca bệnh {mã}"`.
  - Nông hộ nhận thông báo: "Cán bộ kê đơn {thuốc}. Khi phun xong, mở nhật ký nháp và bấm Đã phun."
  - `treatment_recommendation` vẫn lưu nội dung kê đơn dạng chữ.

### 4.6. Giao diện

- **`PesticidePicker`** (component dùng chung) cho form nông dân, form cán bộ và trang kê đơn:
  - Ô tìm, danh sách thuốc có nhóm và `floor_days`, nhãn "Mức sàn mặc định — cần đối chiếu nhãn thực tế" khi `needs_label_check`.
  - Một lựa chọn cuối "Thuốc khác (ngoài danh mục)" mở ô nhập tên và khoá sàn 14.
  - Chọn thuốc thì ô "Số ngày cách ly" tự điền mức sàn. Nhập thấp hơn sàn thì hiện lỗi tại ô và nút gửi bị khoá.
  - Dùng được bằng bàn phím, đủ nhãn, sáng và tối, 390 px.
- **Form nhật ký của nông dân:**
  - Thêm "Đốn chè" vào lựa chọn hoạt động.
  - Thuốc chọn qua `PesticidePicker`.
  - Hàng đợi offline (§4.7).
- **Form nhật ký của cán bộ:** có ô thuốc và số ngày cách ly qua `PesticidePicker` (vá lỗi thiếu ô), và có "Đốn chè".
- **Danh sách nhật ký của nông dân:**
  - Nhật ký `REQUEST_CHANGES` hoặc `REJECTED` có nút "Sửa lại", mở `/farmer/journal/[id]/edit` (form điền sẵn) với nút "Gửi lại".
  - Nhật ký `DRAFT` do cán bộ kê đơn có nút "Đã phun", mở form sửa với ngày phun mặc định hôm nay, rồi gửi `submit`.
- **Nhãn hoạt động:** "Đốn chè" có trong mọi bảng nhãn đang lặp (`journal-prefill.ts`, `FarmerJournalList.tsx`, `JournalForm.tsx`, `JournalList.tsx`, `officer-journal-approval.tsx`, `journal-labels.ts`, `TraceView.tsx`, `q/[lot_code]/page.tsx`, `overview-data.ts`, `map-config.ts`, zod enum, Telegram `journal-create.ts`). Gom về một bảng nhãn dùng chung trong `domain` hoặc `lib` nếu làm được mà không phải sửa rộng; nếu không thì thêm vào từng chỗ.
- **Danh mục thuốc của HTX** `/officer/pesticides` (cán bộ và trưởng HTX; trưởng HTX có mục menu `/manager/pesticides` dùng cùng component):
  - Bảng thuốc: số ngày hiệu lực, nguồn, cờ đối chiếu.
  - Nút "Cập nhật theo nhãn" mở hộp nhập số ngày và ghi chú, kèm câu: "Nhập đúng số ngày cách ly ghi trên nhãn của lô thuốc đang có ở kho HTX."
  - Gỡ nhãn của HTX được.
- **"Nghiệm thu đạt cách ly":**
  - Đặt ở lịch thu hái (`/officer/schedule`, `/manager/schedule`), trong chi tiết sự kiện của lứa đang mở, và ở hồ sơ hộ của cán bộ, cạnh nương đang chăm sóc.
  - Nút chỉ bật khi nương đang `TENDING` và đã qua cách ly. Nếu chưa qua, nút bị khoá và ghi "Còn {n} ngày cách ly (an toàn từ dd/MM/yyyy)".
  - Bấm thì hiện hộp xác nhận: "Xác nhận nương {mã}, lứa {nhãn} đã qua thời gian cách ly và được phép thu hái?"
  - Thành công hay lỗi đều hiện thông báo; danh sách tự tải lại.
- **Kê đơn** (`/officer/diseases/[id]`):
  - Khi bấm Duyệt, có phần "Kê đơn (tuỳ chọn)": `PesticidePicker` lọc theo `targets` chứa từ khoá của chẩn đoán nếu có, và ô liều.
  - Không chọn thuốc thì hành vi như cũ.

### 4.7. Hàng đợi offline cho nhật ký nông dân

- **Lưu khi offline:** hook `useJournalOfflineQueue` theo mẫu `lib/hooks/useOfflineSync.ts`, khoá IndexedDB `journal_offline_queue`.
  - Phần tử gồm `{ client_id, payload, photo?: Blob, created_at, last_error?: string }`.
  - Khi gửi mà mất mạng (`!navigator.onLine` hoặc fetch lỗi mạng), lưu vào hàng đợi và báo "Đã lưu trên máy, sẽ tự gửi khi có mạng."
- **Gửi lại** khi có sự kiện `online` và khi mở trang nhật ký:
  - Tải ảnh qua presign trước, rồi `POST /api/journal` với `client_id`.
  - 2xx: xoá khỏi hàng đợi.
  - 4xx: giữ lại, ghi `last_error`, hiện trong danh sách "Chưa gửi được" kèm nút "Sửa" hoặc "Bỏ".
  - 5xx hoặc lỗi mạng: thử lại lần sau.
  - Không tải lại cả trang.
- **Danh mục thuốc offline:** lần tải gần nhất được giữ trong IndexedDB, để form chọn được thuốc khi mất mạng. Server vẫn là nơi quyết định mức sàn khi gửi.
- Danh sách nhật ký hiện số mục đang chờ gửi.

## 5. Ràng buộc

- **Route:** theo mẫu hiện có (`withErrorHandler`, zod ở tầng route, `requireTenant`, `TenantGuard`, envelope). Mỗi route mới hoặc đổi vai phải có dòng trong `__tests__/api/tenant-isolation.test.ts` và bảng `coverage.ts` của Telegram.
- **Đọc qua gateway:** `GatewayJournalReader` (`ENTRY_FIELDS`, `EntryRow`, `toJournalEntry`) và `JournalPort`/`mapEntry` lộ thêm `cycle_id`, `pesticide_product_id`, `client_id` khi cần.
- **Seed:** `prisma/seed.ts` gán `cycle_id` cho nhật ký mẫu của TC-A3 (3 nhật ký vào lứa trước, 2 vào lứa hiện tại) và gắn sản phẩm danh mục cho 2 lần phun mẫu nếu tên trùng. Không thêm thuốc ngoài danh mục.
- **Quy tắc `AGENTS.md`:** định danh tiếng Anh, token màu, sáng và tối, 390 px, không `style` nội dòng.
- **Commit:** `migration.sql` nay commit bình thường (`.gitignore` đã mở ngoại lệ).

## 6. Kiểm chứng

1. `make test`, `make lint`, `npx tsc --noEmit`, `npx next build`; pytest `platform/agent`, `platform/tests/test_hasura_agent_permissions.py`.
2. Migration chạy trên bản sao CSDL 1.17.0:
   - toàn bộ nhật ký và dòng lô có lứa (trừ nương không có lứa);
   - 20 dòng danh mục;
   - trigger kiểm toán có trên 2 bảng mới.
3. Test bắt buộc:
   - `resolveWithdrawal` (dưới sàn, thiếu số ngày, thuốc khác, nhãn HTX thấp hơn mặc định);
   - mỗi kênh ghi (web, Telegram, kê đơn) bị chặn khi dưới sàn;
   - tự mở lứa khi ghi chăm sóc trên nương `HARVESTED`;
   - lần phun của lứa sau không chặn nghiệm thu, tạo lô, xuất QR của lứa trước; lần phun của cùng lứa vẫn chặn;
   - `client_id` trùng thì không tạo bản thứ hai;
   - "Sửa lại" thay được hoạt động và gửi lại;
   - nháp kê đơn không tính cách ly cho tới khi "Đã phun";
   - agent A4 và A1 theo lứa.
4. Giao diện 2 vòng (1366 px, 390 px, sáng và tối): form nông dân có thuốc, offline (giả lập mất mạng trong Playwright), sửa lại, đã phun; form cán bộ; trang danh mục; nút nghiệm thu; kê đơn.

## 7. Quyết định bổ sung sau lượt đọc thử (ràng buộc, thay cho chỗ mâu thuẫn ở trên)

1. **Nhãn HTX được thấp hơn mức sàn mặc định**, vì chủ dự án cho cán bộ ghi "đúng số ngày cách ly theo nhãn lô thuốc thật". Để tránh gõ nhầm:
   - `label_note` bắt buộc khi `label_phi_days < default_phi_days` (số lô hoặc mô tả nhãn).
   - Giao diện có hộp xác nhận "Thấp hơn mức sàn mặc định {n} ngày. Xác nhận đúng như nhãn?".
   - Mọi thay đổi có trigger kiểm toán.
   - Giới hạn 1..365 giữ nguyên.
2. **Tự mở lứa chỉ tạo lứa, không đổi trạng thái nương.**
   - `ensureOpenCycle` không chuyển `HARVESTED` sang `TENDING`. Trạng thái nương vẫn chỉ đổi khi nhật ký được duyệt (`applyParcelStatus`), như hiện nay.
   - Nhật ký `DRAFT`, kể cả nháp kê đơn, **không** mở lứa và có `cycle_id` rỗng. Lứa được gán lúc gửi (`submit`).
   - Lứa đã mở mà nhật ký sau đó bị từ chối thì vẫn để mở. Lứa chỉ là khung thời gian, không làm sai cách ly.
3. **Gán lứa theo `entry_date`, cùng quy tắc với migration:**
   - Lấy lứa có `coalesce(sowed_at, created_at) <= entry_date` lớn nhất.
   - Nếu lứa đó đã đóng và `entry_date > harvested_at` thì gán lứa mở (`ensureOpenCycle`).
   - Nếu không có lứa nào bắt đầu trước `entry_date` thì gán lứa sớm nhất.
   - Như vậy lần phun ghi bù trước ngày hái vẫn chặn đúng lứa đã hái.
4. **Nương không có lứa nào (dữ liệu cũ):** mọi chỗ kiểm cách ly tính theo cả nương với các nhật ký `cycle_id` rỗng, như hôm nay. `ApproveHarvestUseCase` không báo lỗi khi nương không có lứa mở mà rơi về đường cũ này. Không còn câu lỗi "Nương chưa có lứa đang chăm sóc".
5. **Mọi kênh ghi đi qua cùng use case**, gồm web, Telegram, kê đơn và `apps/hub-mobile` (đang đóng băng, không sửa app).
   - Lần phun không có `pesticide_product_id` (kể cả không có tên thuốc) coi là "Thuốc khác", sàn 14.
   - Thiếu số ngày thì điền 14. Dưới 14 thì trả 422.
   - Telegram `journal-create.ts` thêm `PRUNING`; khi bị 422 thì trả lời đúng thông điệp lỗi.
6. **Nhật ký cũ không bị kiểm lại.** `PUT` chỉ chạy `resolveWithdrawal` khi thân request có `activities`; sửa ghi chú hay ảnh thì không kiểm. `withdrawal_days` và `safe_harvest_date` được chốt lúc ghi; đổi nhãn sau đó không tính lại nhật ký cũ.
7. **Quyền sửa và gửi:**
   - Nông dân sửa và gửi được nhật ký thuộc hộ mình, bất kể ai tạo; quy tắc `UpdateJournalEntryUseCase` hiện có đã kiểm hộ.
   - Khi nông dân gửi một nháp kê đơn ("Đã phun"), `submitted_by_id` và `submitted_role` đổi thành của nông dân (người xác nhận đã phun), `performed_by` là tên nông dân, ghi chú kê đơn giữ nguyên.
   - Cán bộ vẫn sửa được như hiện nay.
8. **Chống trùng:** khoá duy nhất là `@@unique([submitted_by_id, client_id])` chứ không phải `client_id` toàn cục. Trùng của chính người gửi thì trả 200 với nhật ký cũ; không còn mã 409.
9. **Migration và Hasura:**
   - Tách hai migration: migration thứ nhất chỉ `ALTER TYPE "ActivityType" ADD VALUE 'PRUNING'`; migration thứ hai làm phần còn lại.
   - Vai `agent` của Hasura chỉ cần thêm cột `cycle_id` để lọc, không cần quan hệ mới.

## 8. Phần để người làm tự quyết

- Tên component và hook.
- Cách gom bảng nhãn hoạt động.
- Câu chữ trạng thái trống và lỗi phụ.
- Cách chia commit.

## Phụ lục A — Bảng nguồn (chép nguyên từ PR #99, `thuoc-tham-khao-cho-can-bo.md`)

**Sâu hại** (Hướng dẫn 528/CCTTBVTV-TTBVTV, 21/4/2026; "x" = có đăng ký cho đối tượng đó trên chè)

| Tên thương phẩm | Hoạt chất | Rầy xanh | Bọ cánh tơ | Nhện đỏ | Bọ xít muỗi |
| --- | --- | --- | --- | --- | --- |
| Minup 0.3EC | Azadirachtin (thảo mộc) | x | x | x | x |
| Miktin 3.6EC | Abamectin | x | x (ghi "bọ trĩ") | x | x |
| Reasgant 3.6EC | Abamectin | x | x | x | |
| Reasgant 5WG | Abamectin | | x | | |
| Aremec 45EC | Abamectin | x | x | x | |
| Nimbus 6.0EC | Abamectin | | x | x | |
| BP Dy Gan 5.4EC | Abamectin | | x | x | |
| Catex 3.6EC | Abamectin | | x | x | |
| Vinup 40EC | Abamectin + Azadirachtin | x | x | | x |
| Sieufatoc 36EC | Abamectin + Emamectin benzoate | x | x | | x |

**Bệnh phồng lá** (Chỉ đạo phòng trừ vụ Xuân 2026, Thái Nguyên)

| Tên | Hoạt chất |
| --- | --- |
| Stifano 5.5SL | Cucuminoid + Gingerol (thảo mộc) |
| Manage 5WP | Imibenconazole |
| Starsuper 20WP | Kasugamycin + Polyoxin (kháng sinh) |
| Yomisuper 23WP | Kasugamycin + Polyoxin (kháng sinh) |

**Khô cành, chết ngọn (phòng nấm sau đốn)** (Hướng dẫn 528, 21/4/2026)

| Tên | Hoạt chất | Danh mục đăng ký trên chè cho |
| --- | --- | --- |
| Biobus 1.00WP | Trichoderma (vi sinh) | chấm xám, thối búp (và bệnh khác, xem nhãn) |
| Promot Plus SL | Trichoderma (vi sinh) | đốm nâu, đốm xám |
| Olicide 9SL | Oligo-sacarit (sinh học) | rỉ sắt |
| Antracol 70WP | Propineb | thán thư |
| Daconil 75WP, 500SC | Chlorothalonil | đốm lá, thán thư |
