<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# ADR 0005: Mô hình SaaS Đa HTX, Chuỗi giá trị Chè Khép kín chuẩn DX-OS & Rào chắn Poka-yoke

- **Trạng thái:** Accepted
- **Ngày:** 2026-11-28
- **Tham chiếu:** [business-analysis.md](../business-analysis.md), [product-roadmap.md](../product-roadmap.md), [ADR 0002](./0002-miniapp-architecture.md), [ADR 0003](./0003-agentic-layer.md)

## Bối cảnh (Context)

Qua rà soát thực tế hệ thống tại mốc `v1.17.0` dưới lăng kính **Chuyển đổi số DX-OS (TS. Tạ Tuấn Anh)** và nghiệp vụ **Hợp tác xã (HTX) Chè Việt Nam**, dự án bộc lộ 4 đứt gãy cấu trúc:
1. **Nửa nọ nửa kia về Multi-Tenant:** Hạ tầng Keycloak/Hasura đã cách ly theo `htx_code`, nhưng tài liệu (`rules-and-limits.md`, `database-schema.md`) vẫn giả định *"một HTX mỗi bản cài"*, bảng `partners` và một số workflow n8n thiếu `htx_code`, trong khi Giám đốc HTX phải tự cấu hình thông số kỹ thuật hệ thống.
2. **Lệch miền cây lâu năm:** `JournalEntry` và `LotParcel` không gắn khóa ngoại tới `ParcelCropCycle`, dẫn tới phun thuốc chăm sóc Lứa kế tiếp làm khóa cứng việc xuất QR của Lứa vừa thu hoạch; quy trình thiếu thao tác `Đốn chè`, `Mẻ sao sấy`, và cân bằng khối lượng tươi/khô.
3. **Ốc đảo dữ liệu mới tại Mini-app chuỗi giá trị:** `miniapps/leaf-purchase` và `miniapps/farm-supply` nằm trong các schema `app_*` biệt lập không ghi nhận `parcel_id` / `cycle_id`, không kiểm tra ngày cách ly thuốc BVTV (PHI) trước khi cân mua búp tươi, không cấn trừ được công nợ vật tư vào tiền bán chè, và bỏ qua sổ kiểm toán chuỗi băm `audit.events`.
4. **Mâu thuẫn nguyên tắc an toàn:** Chế độ `Autopilot` cho phép tự động thực thi `harvest.approve` và khuyến mãi tài chính, làm suy yếu rào chắn trách nhiệm của con người đối với an toàn thực phẩm và tiền tệ.

## Quyết định (Decision)

1. **Mô hình Triển khai Thương mại & Hạ tầng (`Multi-Tenant SaaS First, Sovereign-Cluster Ready`):**
   - Chuẩn hóa **1 codebase Multi-Tenant duy nhất** (cách ly tuyệt đối theo `htx_code` trên mọi bảng nghiệp vụ, S3 prefix, workflow và API), phục vụ đồng thời cả **Cloud SaaS cho số đông HTX nhỏ/vừa** và **cụm triển khai độc lập cho Liên minh HTX Tỉnh / Sở NN&PTNT / Doanh nghiệp đầu chuỗi**.
   - Tách vai trò quản trị nền tảng **`platform_admin`** (cấp HTX, hạn mức, cấu hình AI/Zalo dùng chung, danh mục thuốc BVTV chuẩn) ra khỏi **`manager`** (Giám đốc HTX).
   - Triển khai cơ chế đa vai trò **`htx_memberships (user_id, htx_code, roles[])`** + Role Switcher và tách vai **`accountant`** (Kế toán / Bàn cân) theo Luật HTX 2023.

2. **Xương sống Dữ liệu Lõi Khép kín cho Chuỗi giá trị Chè (Single Source of Truth):**
   - Toàn bộ dữ liệu chuỗi giá trị cốt lõi (`Household → Parcel → ParcelCropCycle → JournalEntry → FreshLeafTicket → ProcessingBatch → Lot → Order/Settlement → MemberLedger`) thuộc về **Single Source of Truth ở Lõi**, được bảo vệ bởi chuỗi băm `audit.events` và rào chắn `Poka-yoke` ngay tại nguồn:
     - Nhật ký, phiếu cân búp và lô gắn trực tiếp với `ParcelCropCycle` (`cycle_id`).
     - Phiếu cân búp tươi bắt buộc qua chốt chặn kiểm tra `safe_harvest_date` theo từng nương/lứa.
     - Lô thành phẩm bắt buộc truy nguồn từ `ProcessingBatch` (mẻ sao/vò/sấy) kèm kiểm tra cân bằng khối lượng tươi/khô (~4,5–5 : 1).
     - Công nợ vật tư và tiền bán búp tươi hạch toán thống nhất trên sổ cái xã viên để tự động cấn trừ khi chốt kỳ thanh toán.

3. **Cập nhật Ranh giới Mini-app Tầng 3 (`Cập nhật ADR 0002`):**
   - Giữ kiến trúc cắm ghép Mini-app (`app.yaml`, `./dxos`, container sau APISIX) cho các phân hệ mở rộng ngoại vi (như `tea-tour`, sổ hành chính phụ trong `custom-books`) và các công cụ không phá vỡ tính toàn vẹn chuỗi giá trị.
   - Các phân hệ chạm tới chuỗi giá trị lõi (`leaf-purchase`, `farm-supply`, `tea-shop`) được lộ trình hợp nhất dữ liệu vào Lõi; mọi Mini-app còn lại khi tương tác với dữ liệu HTX phải đọc qua Hasura RLS và ghi sự kiện qua Core Action API có kiểm toán, tuyệt đối không tạo nguồn dữ liệu trùng lặp vượt rào `Poka-yoke` (xóa các mẫu phun thuốc/bón phân/sâu bệnh trong `custom-books`).

4. **Rào chắn `Poka-yoke` cho Trí tuệ Nhân tạo (`Cập nhật ADR 0003`):**
   - Giữ kiến trúc `dxos-agent` 3 vùng tin cậy, bằng chứng băm SHA-256, Kho lạnh Parquet/DuckDB và Bản sao số (mở rộng sang Xưởng sao sấy chè).
   - Khóa cứng quy tắc: mọi hành động liên quan tới **An toàn thực phẩm** (`harvest.approve`, nghiệm thu cách ly) và **Tài chính/Giá cả** (thanh toán xã viên, khuyến mãi, đơn hàng) luôn có mức tự chủ **`never`**, bắt buộc người có thẩm quyền xác nhận.

## Hệ quả (Consequences)

- **Tích cực:** Xóa bỏ hoàn toàn đứt gãy giữa đồi chè – bàn cân – xưởng sao – sổ nợ – tem QR; đạt chuẩn kiến trúc HPDI & Open-Core của DX-OS; giảm RAM vận hành bản lõi nhờ đóng băng các thành phần ngoài luồng chính (`staff-desktop`, `staff-mobile`, `hub-mobile`, `app_builder`, `Reels` mẫu).
- **Đánh đổi:** Cần một đợt migration dữ liệu ở Giai đoạn 1–2 để chuyển bảng của `leaf-purchase`, `farm-supply`, `tea-shop` về mô hình lõi thống nhất và bổ sung `cycle_id`, `ProcessingBatch`, `MemberLedger`. Các bước thực thi được chia theo lộ trình 5 giai đoạn tại [product-roadmap.md](../product-roadmap.md).
