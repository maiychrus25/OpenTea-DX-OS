<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mẫu P.A.R.A cho HTX chè

Cấu trúc thư mục mẫu và bộ cẩm nang chè cho hợp tác xã mới. Tên thư mục và tệp dùng tiếng Anh `kebab-case`; nội dung giữ tiếng Việt.

| Ngăn | Nội dung |
| --- | --- |
| `1-projects/` | Việc có thời hạn: kế hoạch vụ chè |
| `2-areas/` | Việc duy trì: pháp lý và quản trị hợp tác xã, tài chính - kế toán - thuế, chính sách ngành chè |
| `3-resources/` | Tri thức chè: canh tác, sâu bệnh, chế biến và bán hàng, an toàn thực phẩm và chất lượng, số liệu vùng chè |
| `4-archives/` | Hồ sơ đã xong, chỉ nhận dữ liệu thật của HTX |

## Chép mẫu vào HTX

`./dxos para seed <HTX>` chép các tệp `.md` và `.csv` của mẫu vào `para/<HTX>/` của kho tài liệu, chỉ tệp chưa có, không ghi đè. Thêm `--dry-run` để xem kế hoạch trước. Chi tiết trong `./dxos` và `SYSTEM_DOCUMENTATION.md`.

## Tác giả và nguồn

Bộ cẩm nang (các tệp ngoài bốn README cấu trúc gốc) lấy từ **khảo sát tài nguyên HTX của Nguyễn Bá Quyến**, [PR #99](https://github.com/maiychrus25/OpenTea-DX-OS/pull/99). Mỗi tệp ghi tác giả ở đầu và giữ nguồn, ghi chú riêng của mình. Các ghi chú là tóm tắt, không thay văn bản gốc; số liệu theo thời điểm công bố (gom ngày 27/11/2026).

Tệp CSV không có dòng đầu ghi nguồn, nên được ghi chung ở đây: các tệp trong `3-resources/tea-region-data/` đều có cột `nguon` cho từng dòng và cùng thuộc khảo sát trên.

## Quy tắc khi dùng cho AI

- `3-resources/tea-pests-and-diseases/officer-pesticide-reference.md` có `ai: false`: chỉ dành cho cán bộ kỹ thuật, chatbot không đọc. AI không tự nêu tên thuốc, hoạt chất, liều lượng hay thời gian cách ly.
- Luôn nêu tên tài liệu và năm; không có trong kho thì trả lời là chưa có.

## Không kèm trong mẫu

Các tập lệnh tải và cào nguồn, bảng tính `.xlsx`, toàn văn văn bản pháp luật gốc (nhiều tệp là văn bản quét lỗi chữ) và cẩm nang du lịch chè chưa được đưa vào mẫu này.
