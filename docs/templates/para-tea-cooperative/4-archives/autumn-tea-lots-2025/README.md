<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# [ARCHIVES] Lưu trữ Tĩnh & Hồ sơ Truy xuất (`autumn-tea-lots-2025`)

Thư mục mẫu cho nhóm **Archives** theo phương pháp **P.A.R.A** trong không gian `[H] Human Space` của OpenTea DX-OS.

- **Mục đích:** Đóng băng và lưu trữ dài hạn các hồ sơ đã hoàn tất của những mùa vụ, kỳ thanh toán và lô hàng đã khóa sổ để phục vụ đối soát VietGAP, thanh tra an toàn thực phẩm và truy xuất nguồn gốc.
- **Ví dụ tài liệu đặt tại đây:**
  - Hồ sơ các lô chè đã xuất tem QR và bán hết từ mùa vụ trước (ví dụ: Vụ Thu 2025).
  - Bản sao PDF chứng nhận VietGAP/OCOP hết hiệu lực cũ (giữ lại làm bằng chứng lịch sử cho các lô đã bán trong thời hạn chứng nhận đó).
  - Bảng kê quyết toán thu mua búp tươi & cấn trừ công nợ xã viên đã hoàn tất chi trả.
- **Lưu ý vận hành:** Trong SeaweedFS S3 thực tế, đường dẫn nằm dưới `para/<htx_code>/Archives/...`. Hệ thống tự động lưu ảnh chụp tĩnh hồ sơ lô khi xuất QR vào `para/<htx_code>/Archives/Lots/` (`ExportQrUseCase`).
