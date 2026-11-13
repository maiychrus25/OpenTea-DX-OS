<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Bộ giao diện mini-app và nâng bốn ứng dụng nghiệp vụ

> **Trạng thái:** Đã triển khai trên nhánh `feat/app-kit` (2026-11-13); thân tài liệu giữ nguyên bản thiết kế, xem "Ghi chú sau triển khai" ở cuối. Bước merge vào `main` và gắn tag `v1.11.0` vẫn chờ chủ dự án.
> **Phạm vi:** milestone `v1.11.0`, đợt đầu của lộ trình ở mục 2. Tiếp nối `v1.10.1`.
> **Căn cứ:** Chủ dự án nhận xét các mini-app còn sơ sài ở ba điểm: giao diện bên trong app, thiếu chức năng, ít app; và muốn nền tảng giống mô hình "lõi ở dưới, nhiều mini-app ở trên, người dùng tự tạo được mini-app". Người tạo app là trưởng HTX, không cần lập trình. Mô hình bảo mật không chạy JavaScript trong mini-app được giữ nguyên.

## 1. Mục tiêu

1. Mỗi mini-app nghiệp vụ trông và dùng như một ứng dụng hoàn chỉnh: có trang tổng quan với số liệu, điều hướng trong app, danh sách tìm và lọc được, in được, xuất tệp được, báo lỗi ngay trên biểu mẫu.
2. Các app dùng chung một bộ giao diện, để năm phiên làm việc khác nhau không cho ra năm kiểu trang khác nhau, và để đợt sau (app do trưởng HTX tự tạo) dùng lại đúng bộ đó.
3. Không đổi mô hình bảo mật: trang của mini-app vẫn không chạy script.

## 2. Lộ trình

| Đợt | Bản | Nội dung |
|---|---|---|
| M1 | `v1.11.0` | Tài liệu này: bộ giao diện dùng chung và nâng bốn app `leaf-purchase`, `tea-shop`, `farm-supply`, `tea-tour` |
| M2 | `v1.12.0` | "Sổ tự tạo": trưởng HTX tự tạo ứng dụng ghi chép ngay trên web (chọn các ô cần ghi, ai được ghi, ai được xem), có mẫu sẵn; mỗi sổ hiện trong menu và trong kho như một app. Có đặc tả riêng |
| M3 | sau M2 | Thêm app viết bằng mã cho những nghiệp vụ mà mẫu của M2 không phủ được |

## 3. Ngoài phạm vi của M1

- Tạo app không cần lập trình (M2) và app mới (M2, M3).
- JavaScript trong mini-app; thông báo đẩy từ mini-app vào lõi; tải ảnh hoặc tệp lên từ mini-app.
- Tìm kiếm không dấu trong mini-app: tìm theo chữ đúng dấu, không phân biệt hoa thường.
- App mẫu `hello` (viết bằng thư viện chuẩn, không dùng Jinja) giữ nguyên.

## 4. Bộ giao diện dùng chung

Ba phần, mỗi phần có một bản gốc duy nhất:

| Phần | Bản gốc | Đến app bằng cách |
|---|---|---|
| Kiểu dáng | `apps/web/public/dxos-app.css` | app liên kết `/dxos-app.css` như hiện nay |
| Macro Jinja | `platform/appkit/kit.html` | chép vào `miniapps/<id>/<gói>/templates/kit.html` |
| Hàm Python | `platform/appkit/appkit.py` | chép vào `miniapps/<id>/<gói>/appkit.py` |

`make appkit-sync` chép bản gốc vào từng app dùng bộ này; `make lint` báo lỗi khi một bản chép khác bản gốc. Chép chứ không dùng gói chung vì mỗi app được dựng image từ thư mục của chính nó và phải tự đủ (quyết định S6 của `v1.9.0`).

**Thành phần giao diện** (tên lớp CSS; macro cùng tên sinh đúng HTML):

- `app-header`: tiêu đề trang, dòng phụ, nhóm nút hành động bên phải.
- `tabs`: điều hướng trong app; mục hiện tại có `aria-current="page"`; cuộn ngang trên màn hình hẹp.
- `stats`: lưới ô số liệu (nhãn, giá trị lớn, ghi chú); hai cột ở 390 px, bốn cột trên màn hình rộng.
- `chart`: biểu đồ cột ngang vẽ bằng SVG do máy chủ sinh; mỗi dòng có nhãn và giá trị bằng chữ.
- `toolbar`: một biểu mẫu `GET` gồm ô tìm, bộ lọc, khoảng ngày và nút; tự xuống dòng trên màn hình hẹp.
- `pagination`: trang trước, trang sau, "Trang 2/5 · 87 dòng"; giữ nguyên các tham số lọc.
- `cards`: lưới thẻ cho trang công khai (sản phẩm, tour).
- `steps`: các bước trạng thái của một đơn hoặc lượt đặt.
- `empty`: trạng thái rỗng có lời nhắn và liên kết hành động.
- `field-error`: lỗi ngay dưới ô nhập; biểu mẫu giữ lại giá trị đã gõ.
- `disclosure`: khối mở ra, đóng lại bằng `<details>` của trình duyệt, cho biểu mẫu "Thêm …".
- `actions`: nhóm nút nhỏ trong một dòng của bảng; `danger` cho hành động huỷ, xoá.
- In: `print-sheet` cho trang in; `no-print` ẩn khi in; quy tắc `@media print` bỏ nền, thanh điều hướng và nút.

Mọi thành phần chỉ dùng token đã có trong tệp, đúng ở chế độ sáng và tối, không tràn ngang ở 390 px, có trạng thái `:focus-visible`.

**Hàm Python:** phân trang (25 dòng mỗi trang), trả tệp CSV, định dạng tiền và ngày kiểu Việt Nam, đọc tham số ngày và số nguyên an toàn, tính độ dài cột biểu đồ, địa chỉ trang khung của app (`/<vai>/apps/<id><đường dẫn>`) cho liên kết quay lại từ trang in.

## 5. Thay đổi ở lõi

1. Khung chứa mini-app thêm quyền `allow-downloads`, để liên kết "Tải CSV" trong app tải được tệp.
2. Proxy `/apps/<id>/…` chuyển tiếp thêm header `content-disposition` khi giá trị bắt đầu bằng `attachment`; các giá trị khác bị bỏ.
3. Hai thay đổi này không cho mini-app chạy script và không đổi CSP.

## 6. Mẫu trang chung

- **Trang in** mở ở cửa sổ chính (liên kết `target="_top"`), không nằm trong khung: người dùng in bằng lệnh in của trình duyệt. Trang có một dòng hướng dẫn và liên kết quay lại ứng dụng, cả hai đều ẩn khi in.
- **Xuất tệp** là CSV mã UTF-8 có BOM (Excel mở đúng tiếng Việt), tên tệp có mã HTX và ngày; chỉ gồm đúng dữ liệu người xem được quyền thấy và đúng bộ lọc đang chọn.
- **Danh sách** từ 25 dòng trở lên có phân trang; bộ lọc nằm trên địa chỉ trang nên sao chép và quay lại được.
- **Biểu mẫu sai** trả lại chính trang có biểu mẫu với mã 400, lỗi nằm cạnh ô sai, giá trị đã gõ còn nguyên.
- **Giữ nguyên hợp đồng HTTP hiện có:** đường dẫn, phương thức, tên ô của biểu mẫu, mã trả về và địa chỉ chuyển hướng của các route đang có không đổi; chức năng mới nằm ở route mới.

## 7. Từng ứng dụng

### 7.1. Thu mua búp tươi (`leaf-purchase`)

- **Tổng quan** (trưởng HTX): hôm nay và tháng này (số ký, số tiền, số phiếu), chưa vào kỳ nào, chưa trả; biểu đồ số ký 14 ngày gần nhất; mười hộ bán nhiều nhất trong tháng.
- **Phiếu cân** (cán bộ, trưởng HTX): danh sách lọc theo khoảng ngày, hộ, loại chè, tình trạng; tìm theo tên hộ; tổng số ký và tiền của kết quả lọc; phân trang; xuất CSV; in từng phiếu cân.
- **Kỳ thanh toán:** in bảng kê chi trả và xuất CSV của một kỳ.
- **Phiếu cân của tôi** (nông dân): ô số liệu tháng này và khoản chưa trả, lọc theo tháng, phân trang.
- Điều hướng trong app theo vai; biểu mẫu ghi phiếu báo lỗi tại chỗ.

### 7.2. Cửa hàng chè (`tea-shop`)

- **Tổng quan:** đơn mới chờ xác nhận, đơn đang giao, doanh thu tháng (đơn hoàn tất), sản phẩm sắp hết (tồn từ 5 trở xuống); biểu đồ doanh thu 14 ngày; năm sản phẩm bán chạy.
- **Đơn hàng:** danh sách lọc theo trạng thái và khoảng ngày; tìm theo mã đơn, tên hoặc số điện thoại; phân trang; xuất CSV; in phiếu giao hàng.
- **Sản phẩm:** danh sách tìm theo tên; lọc đang bán, ngừng bán, sắp hết; phân trang.
- **Trang công khai:** sản phẩm hiện dạng thẻ; trang tra cứu đơn hiện các bước trạng thái.

### 7.3. Vật tư mua chung (`farm-supply`)

- **Tổng quan:** đợt đang mở, số hộ đã đăng ký, tổng tiền đăng ký, số hộ chưa giao và chưa thu tiền.
- **Đợt đăng ký:** danh sách lọc đang mở hoặc đã đóng, phân trang; trang một đợt có tổng theo mặt hàng và theo hộ, xuất CSV cho từng bảng, in bảng kê giao hàng.
- Thêm và sửa mặt hàng báo lỗi tại chỗ (thay trang lỗi chung không có đường quay lại).
- **Đăng ký vật tư** (nông dân): mỗi đợt đang mở là một thẻ có hạn đăng ký; lịch sử có tổng tiền và phân trang.

### 7.4. Đặt tour đồi chè (`tea-tour`)

- **Tổng quan:** tour sắp diễn ra, chỗ đã giữ và chỗ chờ xác nhận, số khách trong tháng.
- **Tour:** danh sách lọc sắp diễn ra, đã qua, đã huỷ; phân trang.
- **Lượt đặt chỗ:** danh sách của mọi tour, tìm theo mã, tên hoặc số điện thoại, lọc theo trạng thái; xuất CSV danh sách khách của một tour; in danh sách đoàn.
- **Trang công khai:** tour hiện dạng thẻ kèm số chỗ còn; trang tra cứu hiện các bước trạng thái.
- **Lịch dẫn tour** (nông dân): tách tour sắp tới và tour đã qua.

## 8. Bảo mật

1. Mọi truy vấn mới vẫn lọc theo `htx_code` lấy từ token; tham số lọc và tìm kiếm đi vào SQL bằng tham số, không ghép chuỗi.
2. Tệp CSV và trang in chỉ chứa dữ liệu vai đó được xem trên màn hình; dữ liệu cá nhân của khách (tên, số điện thoại, địa chỉ) chỉ có trong tệp của trưởng HTX.
3. Ô trong CSV bắt đầu bằng `=`, `+`, `-` hoặc `@` được thêm dấu nháy đơn phía trước, để bảng tính không chạy nó như công thức.
4. Quyền `allow-downloads` chỉ cho tải tệp sau một lần bấm của người dùng; mini-app vẫn không chạy được script. Giới hạn R24 (chỉ cài app tin cậy) giữ nguyên.
5. Trang in mở ngoài khung vẫn đi qua proxy và mang cùng CSP.

## 9. Kiểm thử

- **Bộ giao diện:** kiểm thử macro (HTML sinh ra đúng cấu trúc và thuộc tính truy cập), hàm phân trang, CSV (BOM, thoát công thức, tên tệp), định dạng; `make lint` phát hiện bản chép lệch bản gốc.
- **Web:** proxy giữ `content-disposition: attachment…` và bỏ giá trị khác; khung có `allow-downloads`.
- **Từng app (pytest):** bộ lọc, tìm kiếm, phân trang, tổng; số liệu tổng quan; CSV chỉ gồm dữ liệu của đúng HTX và đúng vai; biểu mẫu sai trả 400 kèm giá trị đã gõ; các kiểm thử hiện có vẫn qua.
- **Tích hợp (`make apps-smoke`):** mỗi app một lần gọi trang danh sách, một tệp CSV qua proxy của web (đúng `content-type` và `content-disposition`) và một trang in.
- **Trình duyệt:** các câu chuyện hiện có vẫn qua; ảnh màn hình trang tổng quan, danh sách và trang in của từng app ở 1280 và 390 px, sáng và tối; ảnh của kho được chụp lại.
- **Không thoái lui:** mọi kiểm thử của `v1.10.1` vẫn qua.

## 10. Tổ chức công việc

| Việc | Nội dung | Cách làm |
|---|---|---|
| 0 | Bộ giao diện (CSS, macro, hàm Python, đồng bộ), thay đổi ở lõi, phiên bản `1.11.0`, sửa một kiểm thử chập chờn của smoke | Một phiên riêng, làm trước |
| A1–A4 | Mỗi app một việc: `leaf-purchase`, `tea-shop`, `farm-supply`, `tea-tour` | Bốn phiên song song, worktree riêng |
| I | Smoke, trình duyệt, chụp lại ảnh cho kho, tài liệu, hai vòng kiểm trên stack sạch | Một phiên riêng, sau khi gộp |

Phiên chính viết spec và kế hoạch, giao việc cho các phiên Sonnet và tự review. GitHub Actions đang bị chặn vì hạn mức của tài khoản, nên bằng chứng kiểm thử của đợt này là các vòng chạy trên máy cho tới khi CI chạy lại được.

## Ghi chú sau triển khai

Các quyết định K1–K6 trong lúc làm (sổ `progress.md` của đợt này):

- **K1** App kit được chép vào từng app bằng `make appkit-sync` và kiểm bằng `make lint`, không đóng thành gói dùng chung hay image nền, vì image app dựng từ chính thư mục của nó. Giá phải trả: một bước đồng bộ cần nhớ; `lint` bắt lệch.
- **K2** Tải tệp cần `allow-downloads` trên khung app và `content-disposition: attachment` qua proxy; không đổi gì khác của sandbox hay CSP. Trong trình duyệt thật, nút "Tải CSV" trong khung tải được tệp.
- **K3** Trang in mở ở cửa sổ ngoài (`target="_top"`) và dùng lệnh In của trình duyệt, không script nào gọi `print()`. Liên kết "Quay lại ứng dụng" (dựng bằng `appkit.shell_url`) đưa về đúng trang trong khung của vỏ; câu chuyện trình duyệt kiểm đúng đường dẫn cho `leaf-purchase`, `tea-shop`, `farm-supply` và `tea-tour`.
- **K4** Hợp đồng HTTP hiện có giữ nguyên (đường dẫn, tên trường, mã trạng thái, `Location`); hành vi mới nằm ở route mới. Hệ quả: các phép kiểm của smoke và câu chuyện cũ vẫn đúng, chỉ hai bộ chọn trong smoke và vài bộ chọn trình duyệt phải đổi vì cấu trúc trang đổi (tiêu đề `<h1>tên</h1>`, biểu mẫu nằm trong `disclosure`, thống kê thay cho đoạn chữ); không phép kiểm nào bị bỏ.
- **K5** `./dxos upgrade <thư mục>` thuộc M1: không có nó thì app đã cài không bao giờ nhận code mới. Kho chỉ hiện "Có bản mới", không có nút nâng cấp. Đã thử trên stack thật của chủ dự án: `tea-shop` và `tea-tour` lên 0.2.0 tại chỗ, các dòng `app_enablements` giữ nguyên từng cột.
- **K6** Tìm kiếm trong app dùng `ILIKE`, phân biệt dấu, vì role của app không tạo được extension `unaccent`.

Khác với bản thiết kế hoặc phát hiện khi chạy trên stack thật:

- Smoke kiểm CSV ở gateway (200, `text/csv`, `attachment`, BOM) chứ không qua proxy của web, vì proxy cần phiên đăng nhập; việc tải qua proxy được kiểm trong trình duyệt (sự kiện download trong khung).
- Lỗi thật duy nhất thấy trong vỏ: bảng ở 1280 px ngắt giữa số điện thoại, mã đặt chỗ và nhãn trạng thái, vì `overflow-wrap: anywhere` của thân trang thu chiều rộng tối thiểu của cột về một chữ. Sửa trong `dxos-app.css` (ô bảng dùng `break-word`, `.pill` không xuống dòng), commit `fix(platform)` riêng.
- Ảnh chụp của kho đổi: ảnh `tea-shop` nay là danh sách đơn (`manager-orders.png`), ảnh `leaf-purchase` là danh sách phiếu cân; chú thích cập nhật.
- Trang in của `farm-supply` dùng `<section class="print-sheet">` nên giữ màu nền trang khi xem ở chế độ tối (khi in thì đen trên trắng); không đổi.
- Trang công khai của `tea-shop` xếp thẻ sản phẩm trong một cột hẹp ở 1280 px vì biểu mẫu đặt hàng có chiều rộng tối đa; không bị cắt hay chồng chữ, không đổi.

Số đo trên stack sạch `dxos-clean` (dựng mới từ `down -v`, `platform-up`, seed, `platform-smoke`, mọi spec trình duyệt theo thứ tự CI, `apps-smoke`, gỡ và xoá mọi app, `down -v`). Hai vòng sạch (vòng 4 và vòng 6; vòng 5 có một lần `401` khi seed dữ liệu ngay sau đăng nhập, không lặp lại, không rõ nguyên nhân):

| Hạng mục | Kết quả |
| --- | --- |
| `make platform-smoke` | 124 PASS |
| `make apps-smoke` | 267 PASS (234 trước đợt này; 672 và 590 giây) |
| Trình duyệt | core-tenant 5, câu chuyện A3 1, câu chuyện tour 1, `app-kit` tea-tour 1, ảnh màn hình ưu tiên 72, kiểm tra gỡ 1, câu chuyện Kho ứng dụng 1, câu chuyện ba app 2, `app-kit` ba app và giao diện 4, ảnh màn hình ba app và kho 68 |
| `make test` / `make lint` / `npx tsc --noEmit` | 1644 test qua (3 bỏ qua) / `eslint`, `actionlint`, `appkit-sync --check` sạch / sạch |
| pytest | CLI 147, `leaf-purchase` 42, `tea-shop` 62, `tea-tour` 63, `farm-supply` 25, app kit 19 |
| Sau khi chạy | không còn container, volume hay worker của `dxos-clean`; sáu volume `docker_*` còn nguyên |
