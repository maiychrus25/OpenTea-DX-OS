<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `custom-books`: Sổ tự tạo

Trưởng HTX tự tạo các sổ ghi chép (chấm công hái chè, sổ phun thuốc, sổ thu chi...) không cần lập trình. Một mini-app chứa mọi sổ của mọi HTX: định nghĩa sổ và các dòng ghi là JSONB trong schema `app_custom_books`. Đặc tả: `docs/specs/2026-11-14-custom-books-design.md`.

## Trang (dưới `/apps/custom-books`)

| Đường dẫn | Ai vào | Nội dung |
| --- | --- | --- |
| `/` | mọi vai | Thẻ của các sổ đã phát hành mà vai được dùng; trưởng HTX thêm liên kết sang `/books` |
| `/feed` | mọi vai | JSON `{"entries": [{label, path, icon, description}], "create": {...}}` cho menu và Kho ứng dụng của lõi; `create` chỉ cho trưởng HTX; tối đa 30 mục, sổ mới phát hành đứng đầu |
| `/books`, `/books/new` | `manager` | Danh sách sổ (đang soạn, đang dùng, ngừng dùng); chọn một trong tám mẫu hoặc Sổ trắng |
| `POST /books` | `manager` | `template=<picking, spraying, fertilising, cashbook, meeting, handover, pest, visitors, blank>`; 409 khi HTX đã có 50 sổ |
| `/books/<id>/design` | `manager` | Biểu mẫu thiết kế (tên, mô tả, biểu tượng, các ô, quyền cán bộ và nông dân, duyệt); lưu sai thì 400 và giữ những gì đã gõ |
| `/books/<id>/preview` | `manager` | Biểu mẫu nhập đúng như người dùng sẽ thấy, không ghi gì |
| `POST /books/<id>/publish`, `/archive`, `/delete` | `manager` | Phát hành (cần ít nhất một ô), ngừng dùng, xoá (chỉ khi chưa có dòng nào, ngược lại 409) |
| `/b/<id>` | theo mức | Danh sách: cột là các ô "hiện trong danh sách", Người ghi, Ngày, Tình trạng (sổ cần duyệt); tìm `q` (ô chữ và tên người ghi, theo nghĩa đen), `from`, `to`, `c_<khoá>` cho ô lựa chọn, `household`, `status`; phân trang 25 dòng; tổng các ô tính tổng của tập đã lọc |
| `/b/<id>/new`, `POST /b/<id>/records`, `/b/<id>/r/<rid>/edit`, `/b/<id>/r/<rid>/delete` | mức ghi | Ghi, sửa, xoá (xoá qua trang xác nhận); 303 về `/b/<id>?notice=saved\|deleted` hoặc 400 kèm biểu mẫu |
| `POST /b/<id>/r/<rid>/approve`, `/reject` | `manager` | Duyệt hoặc từ chối (`reason` 1–200 ký tự) dòng đang chờ, chỉ với sổ cần duyệt |
| `/b/<id>/summary`, `/b/<id>/export.csv`, `/b/<id>/print` | theo mức | Tổng hợp (số dòng, tổng tháng này và tất cả, biểu đồ 6 tháng, biểu đồ theo mục), CSV (tối đa 5000 dòng), bản in; cùng bộ lọc và cùng quyền xem với danh sách |

## Quyền trên dòng

- Sổ đang soạn hoặc ngừng dùng chỉ trưởng HTX mở được (người khác nhận 404); mức `none` nhận 403; sổ hoặc dòng của HTX khác nhận 404.
- `view`: xem mọi dòng, không ghi. `own`: chỉ thấy, sửa, xoá dòng của mình (dòng người khác là 404, kể cả qua CSV, bản in, tổng hợp). `all`: thấy mọi dòng, sửa và xoá dòng của mình. Trưởng HTX làm được mọi thứ.
- Sổ cần duyệt: dòng của cán bộ và nông dân vào ở trạng thái chờ duyệt, dòng của trưởng HTX vào thẳng đã duyệt; người ghi sửa dòng chờ hoặc bị từ chối thì dòng về chờ duyệt; dòng đã duyệt bị khoá với người ghi (sửa và xoá). Tổng hợp và tổng trên danh sách chỉ tính dòng đã duyệt.
- Ngày của dòng là ô ngày đầu tiên, không có thì ngày ghi. CSV: số và tiền là số thô, ô bị bỏ khỏi thiết kế vẫn xuất giá trị cũ dưới khoá của nó (`f3`).

## Quy tắc thiết kế

- Mỗi ô có khoá `f<số>` do máy chủ sinh, không bao giờ dùng lại (`books.next_key` chỉ tăng). Đổi tên hay thứ tự không làm lệch dữ liệu; ô bị bỏ vẫn giữ dữ liệu trong các dòng.
- Khi sổ đã có dòng: không đổi kiểu của ô đang có và không bỏ lựa chọn cũ của ô lựa chọn.
- Giới hạn: 50 sổ mỗi HTX, 1–20 ô mỗi sổ, tối đa 6 ô hiện trong danh sách, 2–20 lựa chọn mỗi ô lựa chọn.
- Nhãn, mô tả và lựa chọn chỉ là chữ: hiển thị đã escape, không bao giờ đi vào SQL. Chỉ khoá `f<số>` (kiểm bằng `^f[0-9]{1,4}$`) được đặt vào đường dẫn JSON, mọi giá trị là tham số. Mọi truy vấn lọc theo `htx_code` của token.

## Dữ liệu và mạng

- Bảng `books`, `records` trong `migrations/0001_init.sql`, khoá ngoại `(book_id, htx_code)` nên dòng luôn cùng HTX với sổ.
- Nông hộ lấy từ `http://apisix:9081/api/data/graphql` bằng token của người dùng (Hasura chỉ trả hộ của chính nông dân), hết giờ sau 5 giây; gọi lõi trước khi mở kết nối database.
- Giao diện dùng bộ giao diện chung (`custom_books/appkit.py`, `templates/kit.html` do `make appkit-sync` sao chép, không sửa trong app).
