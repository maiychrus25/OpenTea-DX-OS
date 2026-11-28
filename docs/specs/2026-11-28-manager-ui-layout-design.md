<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->

# Chỉnh bố cục giao diện Trưởng HTX (đợt 1)

**Ngày:** 2026-11-28. **Phạm vi:** `apps/web`, vai Trưởng HTX, bốn trang: Tổng quan, Lịch thu hái, Duyệt nhật ký, Vùng trồng.

## 1. Mục tiêu

Trình bày lại bốn trang theo ảnh thiết kế, trên bản 1.23.0.

## 2. Nguyên tắc

Ảnh thiết kế là chuẩn bố cục; mã là chuẩn nghiệp vụ. Không đổi màu, phông, quyền hay luồng. Số liệu lấy từ dữ liệu thật; không có dữ liệu thì bỏ ô đó, không bịa số.

Giữ lại những gì ảnh không vẽ: sáu khối điều hành, duyệt nhanh ở Tổng quan, lịch tháng và các thao tác trên lịch, mục quá hạn và yêu cầu sửa, xuất CSV/GeoJSON.

Không làm theo ảnh:

- "Thêm vùng trồng": Trưởng HTX chỉ xem vùng trồng; vẽ thửa là việc của cán bộ kỹ thuật.
- Bộ lọc "Khu vực", bản đồ chia Khu A–D: dữ liệu không có khu vực.
- "Duyệt phiếu cân": phiếu cân không có bước xác nhận.
- Mọi tên người, số liệu và ngày trong ảnh là minh họa.

## 3. Thay đổi

| Trang | Việc chính |
|---|---|
| Tổng quan | Ảnh bìa kèm thời tiết; bốn số từ đầu năm (búp thu mua, chè khô, đã bán, doanh thu) so cùng kỳ khi năm trước có số; biểu đồ búp 8 tuần; việc cần xử lý; thao tác nhanh. |
| Lịch thu hái | Bốn số của tháng, dải tuần, tiến độ lứa đã hái, bảng kế hoạch và lịch sử, tab lịch tháng. Thêm trường chỉ đọc `areaHa` vào `/api/schedule/harvest`. |
| Duyệt nhật ký | Bốn số, tab trạng thái, tìm kiếm, Duyệt và Từ chối trên từng dòng (dùng `/api/journal/{id}/review` đã có), phân trang. |
| Vùng trồng | Bốn số, tab bản đồ và danh sách, bộ lọc trạng thái và giống. |

## 4. Rủi ro và hoàn tác

`HarvestCalendar` dùng chung với nông hộ và cán bộ: không sửa, chỉ đặt vào tab của trang Trưởng HTX. Mỗi trang một commit, `git revert` được riêng.

## 5. Kiểm tra

`npx tsc --noEmit`, `npm run lint`, `npx jest`, `npm run build`; xem 1440×900 và 390px, sáng và tối.
