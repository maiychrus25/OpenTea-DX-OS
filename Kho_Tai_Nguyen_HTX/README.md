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

## Cẩm nang chi tiết
- [Canh tác](3_Resources/Ky_thuat_che/Cam_nang/README.md)
- [Chế biến và bán hàng](3_Resources/Che_bien_ban_hang/README.md)
- [Quản lý hợp tác xã](2_Areas/Quan_tri_HTX/Cam_nang/README.md)
- [Du lịch](3_Resources/Du_lich_che/Cam_nang/README.md)
- [Dữ liệu dạng bảng: dịch hại, vùng chè, OCOP, điểm du lịch](3_Resources/Du_lieu/README.md)
- [Số liệu vùng chè](3_Resources/So_lieu_dia_phuong/vung-che-thai-nguyen.md)

- Danh mục nguồn: `danh_muc.csv` (`tai_tai_lieu.py` sinh từ `nguon.json`).
- Cào một mục của trang web: `./cao_trang.sh <url> [số trang]` (cần `firecrawl-local`; không vượt trang đã chặn).
- Tải bản gốc về máy: `python3 tai_tai_lieu.py`. Bản gốc nằm trong `_goc/`, **không đưa vào repo**.
- Các ghi chú là tóm tắt của dự án, không thay văn bản gốc. Gom ngày 27/11/2026.

## Ba cách đọc kho
| Ai đọc | Dùng | Cách tạo |
| --- | --- | --- |
| Người | các file `.md`, bảng `.csv`, `.xlsx` | sửa trực tiếp |
| Web | `xuat/bang.json` | `python3 xuat_du_lieu.py` |
| Chatbot | `xuat/doan.jsonl` (đoạn kèm nguồn, đã loại đoạn có tên thuốc; không commit) | `python3 xuat_du_lieu.py` |

Sửa ghi chú hay bảng xong thì chạy lại lệnh xuất. Thử tra như chatbot: `python3 tim.py "câu hỏi"`.
Web và chatbot của hệ thống **chưa** đọc các file này.

## Quy tắc khi dùng cho AI

1. Không tự nêu tên thuốc, hoạt chất, liều lượng hay thời gian cách ly; không đọc `thuoc-tham-khao-cho-can-bo.md`. Việc kê thuốc do cán bộ kỹ thuật, theo danh mục đang hiệu lực.
2. Luôn nói rõ tên tài liệu và năm. Tài liệu cũ hoặc chưa kiểm hiệu lực thì phải nói ra.
3. Không có trong kho thì trả lời là chưa có, không suy đoán.
4. Chỉ trích số liệu, quy định từ nguồn nhà nước (cột `nguon_nha_nuoc` trong `danh_muc.csv`). Nguồn khác chỉ để tham khảo và phải nói rõ.
