<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->

# Giao diện Trưởng HTX theo bộ thiết kế (đợt 1)

**Ngày:** 2026-11-28. **Phạm vi:** `apps/web`, vai Trưởng HTX: khung menu, thanh trên và chín trang Tổng quan, Lịch thu hái, Duyệt nhật ký, Vùng trồng, Giá thu mua, Phiếu cân, Vật tư, Quyết toán, Bán hàng.

## 1. Mục tiêu

Làm đúng theo ảnh thiết kế được cung cấp, thay cho bố cục cũ. Yêu cầu này thay cho bản đầu của đặc tả (giữ lại các khối cũ).

## 2. Nguyên tắc

- Bố cục, thứ tự, nhãn và sắc xanh theo ảnh. Sắc xanh chỉ áp cho vai Trưởng HTX ở giao diện sáng.
- Có dữ liệu thật thì dùng thật. Ảnh vẽ thứ hệ thống chưa có dữ liệu hay chức năng thì vẫn vẽ và gắn nhãn "Mẫu".
- Chức năng thật mà ảnh không vẽ thì đặt trong hộp thoại hoặc nút phụ; quyền và luồng nghiệp vụ không đổi.

## 3. Phần đang là mẫu

| Trang | Phần mẫu |
|---|---|
| Tổng quan | % so cùng kỳ khi năm trước chưa có số; việc "Duyệt phiếu cân"; cảnh báo và bản tin khi chưa có dữ liệu |
| Lịch thu hái | % so kỳ trước khi tháng trước chưa có số |
| Vùng trồng | Nút "Thêm vùng trồng" (việc của cán bộ kỹ thuật); bản đồ khu A–D khi chưa thửa nào có ranh giới |
| Phiếu cân | "Chờ xác nhận" (phiếu không có bước này) |
| Vật tư | Tồn kho, ngưỡng cảnh báo, sắp hết, nhóm chế phẩm sinh học |
| Bán hàng | "Chờ giao hàng", "Đang giao" |

## 4. Khác ảnh có chủ ý

- Phiếu cân không sửa được: nút "Chỉnh sửa" thành "Hủy phiếu".
- Quyết toán còn nháp: nút "Đánh dấu đã chi trả" thành "Xem và chốt kỳ".
- Lọc "Khu vực" thay bằng lọc nông hộ hoặc giống chè.
- Menu giữ mục "Thông báo Zalo".

## 5. Chức năng không còn trên các trang này

Duyệt nhiều nhật ký một lúc, xuất CSV nhật ký, các tab "Quá hạn" và "Yêu cầu sửa" (nay nằm trong "Chờ duyệt" và "Từ chối"), sáu khối điều hành và liên kết phân tích ở Tổng quan.

## 6. Dữ liệu và API

Chỉ thêm đọc: `areaHa`, `harvestedKg` trong `/api/schedule/harvest`; trang Giá thu mua đọc lịch sử `daily_leaf_prices`. Thêm trang in phiếu cân `/manager/leaf-tickets/{id}/print`. Sửa lỗi đọc công nợ (`/api/sales/receivables` trả `{ data }`).

## 7. Rủi ro, hoàn tác và kiểm tra

Component dùng chung với vai khác chỉ thêm tuỳ chọn. Mỗi trang là commit riêng. Kiểm tra: `npx tsc --noEmit`, `npm run lint`, `npx jest`, `npm run build`, ảnh máy tính và 390px.
