<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->

# Kho tài nguyên HTX chè

Tài liệu cho cán bộ, nông hộ và làm nguồn tra cứu cho AI. Sắp theo 4 ngăn:

| Ngăn | Nội dung |
| --- | --- |
| `1_Projects/` | Việc có thời hạn: kế hoạch vụ chè |
| `2_Areas/` | Việc duy trì: pháp lý hợp tác xã, tài chính - kế toán - thuế, chính sách ngành chè, chính sách phát triển hợp tác xã, quản trị hợp tác xã |
| `3_Resources/` | Tri thức chè: trồng, chăm sóc, chế biến, bảo quản, sâu bệnh, an toàn thực phẩm, VietGAP, chất lượng - thương hiệu, truy xuất nguồn gốc, du lịch vùng chè, thích ứng thời tiết, thị trường và bán hàng (nguồn cho AI) |
| `4_Archives/` | Hồ sơ vụ đã xong, chỉ nhận dữ liệu thật của HTX |

- Danh mục nguồn: `danh_muc.csv` (`tai_tai_lieu.py` sinh từ `nguon.json`).
- Tải bản gốc về máy: `python3 tai_tai_lieu.py`. Bản gốc nằm trong `_goc/`, **không đưa vào repo**.
- Các ghi chú là tóm tắt của dự án, không thay văn bản gốc. Gom ngày 27/11/2026.

## Quy tắc khi dùng cho AI

1. Không tự nêu tên thuốc, hoạt chất, liều lượng hay thời gian cách ly; không đọc `thuoc-tham-khao-cho-can-bo.md`. Việc kê thuốc do cán bộ kỹ thuật, theo danh mục đang hiệu lực.
2. Luôn nói rõ tên tài liệu và năm. Tài liệu cũ hoặc chưa kiểm hiệu lực thì phải nói ra.
3. Không có trong kho thì trả lời là chưa có, không suy đoán.
4. Chỉ trích số liệu, quy định từ nguồn nhà nước (cột `nguon_nha_nuoc` trong `danh_muc.csv`). Nguồn khác chỉ để tham khảo và phải nói rõ.
