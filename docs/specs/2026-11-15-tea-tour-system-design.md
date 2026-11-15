<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Tour đồi chè 1.0: hệ thống đặt tour hoàn chỉnh cho HTX

> **Trạng thái:** Bản thiết kế (2026-11-15), chưa triển khai. Chủ dự án đã chốt hai điểm: app Android dùng chung cho khách và người của HTX; khách trả tiền bằng chuyển khoản VietQR, HTX xác nhận. Chủ dự án cho phép triển khai mà không chờ duyệt thêm; bước gộp vào `main` và gắn tag vẫn hỏi lại.
> **Phạm vi:** đợt 1, milestone `v1.13.0`: mini-app `tea-tour` 1.0.0 trên web (trang web cho khách, khu quản trị, trang người dẫn) và ba thay đổi nhỏ ở proxy của web. Đợt 2 (`v1.14.0`: API và app Android) có đặc tả riêng; §12 chỉ nêu những gì đợt 1 phải để sẵn.
> **Căn cứ:** Chủ dự án nhận xét app `tea-tour` 0.2.0 "chưa đạt hiệu quả, giao diện đơn giản quá" và muốn nó có đủ chức năng và giao diện của một hệ thống độc lập. Bản 0.2.0 chỉ có tour một ngày giờ, một form đặt chỗ, không ảnh, không thanh toán, không vé.

## 1. Mục tiêu

1. Khách du lịch dùng một trang web riêng của HTX trên điện thoại: xem tour có ảnh và lịch trình, chọn ngày khởi hành, đặt chỗ cho người lớn và trẻ em, chuyển khoản bằng mã VietQR, nhận vé có mã QR, tự huỷ hoặc gửi đánh giá.
2. Trưởng HTX vận hành trọn việc bán tour trong DX-OS: soạn tour và lịch khởi hành, xử lý lượt đặt, ghi nhận tiền, phân công người dẫn, xem khách hàng, đánh giá và báo cáo doanh thu.
3. Nông hộ dẫn tour xem lịch của mình, danh sách đoàn và điểm danh khách.
4. `tea-tour` vẫn là một mini-app cài và gỡ bằng `./dxos` hoặc Kho ứng dụng. Lõi không biết riêng app này: mọi thay đổi ở lõi là quy tắc chung cho mọi mini-app.
5. Nâng cấp từ 0.2.0 không mất tour hay lượt đặt nào.

## 2. Ngoài phạm vi

- Cổng thanh toán tự động (VNPay, MoMo) và đối soát sao kê ngân hàng tự động: HTX ghi nhận tiền bằng tay.
- Gửi SMS, Zalo, email hoặc thông báo đẩy: khách xem trạng thái trên trang tra cứu (và trong app Android ở đợt 2).
- Tài khoản cho khách: khách được nhận ra bằng mã đặt chỗ cùng số điện thoại.
- Giao diện tiếng Anh; nhiều loại tiền; mã giảm giá; bán kèm sản phẩm chè (đã có `tea-shop`).
- JavaScript trong trang của mini-app: CSP và sandbox của `/apps/` giữ nguyên (quyết định ngày 13/11).
- Ảnh của bên thứ ba trong repo: tour chưa có ảnh dùng hình minh hoạ do dự án tự vẽ.
- Vai `officer` trong app này.

## 3. Khái niệm

- **Tour** là sản phẩm của một HTX: tên, tóm tắt, mô tả, loại, thời lượng, điểm hẹn, giá người lớn và giá trẻ em, số chỗ mặc định, lịch trình, "bao gồm", "không bao gồm", "cần mang theo", hỏi đáp, ảnh. Trạng thái `DRAFT` (đang soạn), `PUBLISHED` (đang bán), `ARCHIVED` (ngừng bán, giữ dữ liệu).
- **Loại tour:** `PICKING` (hái chè), `CRAFTING` (sao chè), `TASTING` (thưởng trà), `SIGHTSEEING` (ngắm cảnh, chụp ảnh), `EDUCATION` (học sinh, trải nghiệm học tập).
- **Chuyến** (ngày khởi hành) là một lần chạy của một tour: ngày giờ, số chỗ, giá người lớn và trẻ em (chép từ tour lúc tạo, sửa được), người dẫn, trạng thái `OPEN` (nhận khách), `CLOSED` (ngừng nhận, vẫn chạy), `CANCELLED`. Chuyến đã qua giờ khởi hành là "đã diễn ra".
- **Lượt đặt** thuộc một chuyến: mã 8 ký tự, khách, số điện thoại, email (không bắt buộc), số người lớn, số trẻ em, đơn giá lúc đặt, tổng tiền, tiền cọc phải trả, tiền đã trả, hạn giữ chỗ, trạng thái `PENDING` (chờ xác nhận), `CONFIRMED`, `CANCELLED`, và thông tin điểm danh.
- **Khoản thu** là một dòng trong sổ thu của lượt đặt: số tiền (dương là thu, âm là hoàn), hình thức `TRANSFER` hoặc `CASH`, người ghi, thời điểm. Sổ chỉ thêm, không sửa, không xoá.
- **Tình trạng thanh toán** (tính ra, không lưu): `UNPAID` (chưa trả), `DEPOSITED` (đã trả một phần), `PAID` (đã trả đủ), `REFUND_DUE` (lượt đã huỷ mà tiền đã trả lớn hơn 0).
- **Đánh giá** của một lượt đặt đã điểm danh: 1–5 sao, lời nhận xét, tên hiển thị; trưởng HTX duyệt trước khi hiện.
- **Yêu cầu tour riêng:** khách để lại tên, số điện thoại, số người, ngày mong muốn, lời nhắn; trưởng HTX gọi lại.
- **Cài đặt** của HTX: tên hiển thị, lời giới thiệu, ảnh bìa, đường dây nóng, Zalo, email, địa chỉ, liên kết bản đồ, tài khoản ngân hàng, tỉ lệ đặt cọc, số giờ giữ chỗ, hạn huỷ miễn phí, tự xác nhận hay không, chính sách.

## 4. Các cách làm đã cân nhắc

| Cách | Nội dung | Vì sao chọn hoặc không |
| --- | --- | --- |
| **A (chọn)** | Giữ `tea-tour` là mini-app; mở rộng thành ba mặt (trang khách, quản trị, người dẫn) trên cùng một container và schema; trang khách có giao diện riêng do app tự phục vụ; giữ không JavaScript | Giữ nguyên câu chuyện Tier 3 và mô hình bảo mật; chỉ cần ba thay đổi nhỏ ở proxy. Giá phải trả: mọi tương tác là form và liên kết |
| B | Tách thành ứng dụng Tier 2 riêng (Next.js, có JavaScript) | Giao diện mượt hơn, nhưng bỏ mất minh chứng "app cài được", thêm một dịch vụ lõi phải bảo trì, và đi ngược quyết định ngày 13/11 |
| C | Cho riêng app này chạy JavaScript (thêm quyền trong manifest, nới CSP) | Mở một ngoại lệ bảo mật cho mọi app về sau; R24 (chỉ cài app tin cậy) chưa đủ để gánh |

## 5. Trang web cho khách

Mọi trang nằm dưới `/apps/tea-tour/public/<htx>/`, mở thẳng (không trong khung), không cần đăng nhập, dùng stylesheet và phông do app phục vụ dưới `/public/<htx>/assets/`.

| Đường dẫn | Nội dung |
| --- | --- |
| `/` | Trang chủ: ảnh bìa, tên và lời giới thiệu HTX, các tour nổi bật (tối đa 6, ưu tiên tour có chuyến sắp tới), đánh giá mới, cách đặt (3 bước), liên hệ, chân trang có chính sách |
| `/tours` | Danh mục: thẻ tour có ảnh, loại, thời lượng, giá từ, điểm sao, chuyến gần nhất. Lọc `?category=` và `?month=YYYY-MM`, sắp xếp `?sort=soon\|price\|rating`, phân trang 12 |
| `/tours/<slug>` | Chi tiết: thư viện ảnh (cuộn ngang bằng CSS), mô tả, lịch trình dạng dòng thời gian, bao gồm/không bao gồm/cần mang, điểm hẹn và liên kết bản đồ, người dẫn của từng chuyến, bảng chuyến sắp tới với số chỗ còn, đánh giá đã duyệt, hỏi đáp (`<details>`), chính sách huỷ |
| `/tours/<slug>/book?departure=<id>` | Bước 1: chọn chuyến, số người lớn, số trẻ em, họ tên, số điện thoại, email, ghi chú |
| `POST /tours/<slug>/book` | Kiểm tra rồi hiện bước 2: tóm tắt, tổng tiền, tiền cọc, hạn giữ chỗ, ô đồng ý chính sách, nút "Xác nhận đặt chỗ". Không ghi gì vào database |
| `POST /bookings` | Tạo lượt đặt, chuyển 303 tới `/booking?code=&key=&booked=1` |
| `/booking?code=&key=` | Lượt đặt của tôi: các bước trạng thái, chuyến, số tiền, mã VietQR khi còn phải trả, vé, các nút bên dưới. Không có tham số thì hiện form tra cứu |
| `POST /booking/lookup` | Tra cứu bằng mã đặt chỗ và số điện thoại; đúng thì chuyển 303 tới `/booking?code=&key=` |
| `POST /booking/paid` | Khách báo "Tôi đã chuyển khoản" (chỉ ghi dấu thời điểm) |
| `POST /booking/cancel` | Khách tự huỷ trong hạn (§7.4) |
| `POST /booking/review` | Gửi đánh giá (§7.6) |
| `/ticket?code=&key=` | Vé để in hoặc lưu: mã QR, tên tour, ngày giờ, điểm hẹn, số người, tình trạng thanh toán |
| `/inquiry` (GET, POST) | Yêu cầu tour riêng |
| `/policy` | Chính sách đặt cọc, huỷ và hoàn tiền của HTX |
| `/media/<id>-<large\|thumb>.jpg` | Ảnh, chỉ khi ảnh thuộc tour `PUBLISHED` hoặc là ảnh bìa của HTX đó |
| `/assets/<tệp>` | Stylesheet, phông, hình minh hoạ |

Quy tắc:

1. Trang công khai không bao giờ hiện tên, số điện thoại hay email của khách khác. Tra cứu sai mã hoặc sai số điện thoại trả cùng một thông báo.
2. Mỗi lượt đặt có một **khoá truy cập** ngẫu nhiên (22 ký tự). Địa chỉ trang lượt đặt và vé chỉ chứa mã đặt chỗ và khoá này, không chứa số điện thoại; sai khoá trả cùng thông báo như không tìm thấy. Mọi form của khách trên trang lượt đặt gửi kèm mã và khoá. Trang khách có `<meta name="referrer" content="no-referrer">`; liên kết ra ngoài có `rel="noopener noreferrer"`.
3. `POST` thành công trả 303 về một trang dưới `/apps/tea-tour/public/<htx>/`. Lỗi nhập liệu hiện lại form (mã 422) với giá trị đã nhập và thông báo cạnh ô sai. Riêng `POST /tours/<slug>/book` hợp lệ thì hiện bước 2 (mã 200).
4. Tour `DRAFT`, `ARCHIVED` hoặc của HTX khác trả 404 ở trang tour và trang đặt chỗ. Trang lượt đặt và vé của khách đã đặt vẫn mở được dù tour đã ngừng bán. Chuyến không `OPEN`, đã diễn ra hoặc hết chỗ không chọn được.
5. "Giá từ" của một tour là giá người lớn thấp nhất trong các chuyến còn đặt được; không có chuyến nào thì là giá người lớn của tour. Sắp xếp `soon`: tour có chuyến còn đặt được lên trước, theo chuyến gần nhất, còn lại theo tên; `price`: theo "giá từ" tăng dần; `rating`: điểm trung bình giảm dần, tour chưa có đánh giá xuống cuối; bằng nhau thì theo tên.
6. Ảnh và tệp tĩnh trả `cache-control: public, max-age=31536000, immutable`; tên tệp tĩnh có mã băm nội dung.
7. Giao diện riêng của trang khách ghi trong `miniapps/tea-tour/DESIGN.md` (kế thừa màu và phông của `DESIGN.md` gốc: xanh chè `#176c4b`, Be Vietnam Pro). Sáng và tối theo `prefers-color-scheme` và `?theme=`. Không cuộn ngang ở 390 px, có `:focus-visible`, có trạng thái trống.
8. Phông Be Vietnam Pro (OFL-1.1, các tệp woff2 lấy từ gói `@fontsource/be-vietnam-pro`) nằm trong app kèm tệp giấy phép, vì CSP không cho tải từ ngoài.

## 6. Khu quản trị và trang người dẫn

Trang quản trị hiện trong khung của DX-OS, dùng bộ giao diện chung (`/dxos-app.css`, `kit.html`) cộng stylesheet riêng của app cho lịch tháng và thư viện ảnh. Thanh tab phải dùng được ở 390 px mà trang không cuộn ngang.

| Tab (vai `manager`) | Đường dẫn | Chức năng |
| --- | --- | --- |
| Tổng quan | `/` | Chỉ số: chuyến sắp tới, khách tháng này, đã thu tháng này, chờ xác nhận, khách báo đã chuyển khoản, cần hoàn tiền. Chuyến trong 7 ngày tới. Việc cần làm. Liên kết tới trang khách |
| Tour | `/tours`, `/tours/new`, `/tours/<id>`, `/tours/<id>/edit` | Danh sách lọc theo trạng thái; tạo từ trang trắng hoặc từ một trong bốn mẫu; sửa mọi mục ở §3; tải ảnh lên, chọn ảnh bìa, đổi thứ tự, gỡ ảnh; đăng bán, ngừng bán |
| Lịch | `/departures`, `/departures/<id>` | Danh sách và lịch tháng (`?view=calendar&month=`); tạo một chuyến hoặc lặp theo thứ trong tuần giữa hai ngày (§7.9); sửa số chỗ, giá, người dẫn; đóng, mở lại, huỷ chuyến có lý do; trang chuyến có danh sách khách, điểm danh, CSV, bản in danh sách đoàn |
| Lượt đặt | `/bookings`, `/bookings/new`, `/bookings/<id>` | Lọc theo trạng thái, thanh toán, chuyến, khoảng ngày; tìm theo mã, tên, số điện thoại; trang lượt đặt có lịch sử, xác nhận, ghi khoản thu hoặc hoàn tiền, huỷ có lý do, đổi chuyến, sửa số người, ghi chú nội bộ; tạo lượt đặt hộ khách gọi điện; CSV |
| Thu tiền | `/payments` | Sổ thu theo ngày; lọc theo hình thức và khoảng ngày; tìm theo mã đặt chỗ; tổng thu, tổng hoàn; CSV |
| Khách | `/customers` | Gộp theo số điện thoại: số lần đặt, số lần đã đi, tổng đã trả, lần gần nhất; tìm; CSV |
| Đánh giá | `/reviews` | Duyệt, ẩn, trả lời đánh giá; danh sách yêu cầu tour riêng với trạng thái `NEW`, `CONTACTED`, `CLOSED` và ghi chú |
| Báo cáo | `/reports` | 12 tháng gần nhất: khách, lượt đặt, tiền đã thu (biểu đồ cột của kit); theo tour; tỉ lệ lấp đầy của chuyến đã diễn ra; tỉ lệ huỷ |
| Cài đặt | `/settings` | Mọi mục cài đặt ở §3; xem trước mã VietQR mẫu |

Trang người dẫn (vai `farmer`, dưới `/guide`): chuyến sắp tới và đã diễn ra được giao cho mình; trang chuyến có danh sách lượt `CONFIRMED` gồm tên khách, số người lớn và trẻ em, ghi chú của khách, số tiền còn phải thu, trạng thái điểm danh, và nút điểm danh hoặc bỏ điểm danh. Người dẫn không thấy số điện thoại, email hay lượt chưa xác nhận, và không ghi được khoản thu.

Trưởng HTX xem ảnh của HTX mình (kể cả ảnh của tour chưa đăng bán) qua đường dẫn có bảo vệ `/media/<id>-<large|thumb>.jpg`.

Quy tắc chung: mọi truy vấn lọc theo `htx_code` của token; mọi thao tác ghi là `POST` trả 303; danh sách phân trang 25 dòng; CSV có BOM, CRLF và chống công thức như bản 0.2.0; bản in mở ngoài khung và có liên kết quay lại. Người dẫn chọn trong nông hộ của HTX (đọc qua Hasura như bản 0.2.0); lõi không trả lời thì danh sách vẫn hiện và form báo lỗi.

## 7. Quy tắc nghiệp vụ

### 7.1 Chỗ và giá

- Chỗ đã dùng của một chuyến là tổng `adults + children` của lượt `PENDING` và `CONFIRMED`. Tạo lượt đặt, đổi chuyến, sửa số người và sửa số chỗ của chuyến chạy trong một transaction có khoá dòng chuyến; không bao giờ vượt số chỗ.
- Khách đặt trên web: 1–20 người một lượt, ít nhất một người lớn. Trưởng HTX đặt hộ: tới số chỗ còn lại.
- `total = adults × giá người lớn + children × giá trẻ em`, theo giá của chuyến lúc đặt. Đơn giá được chép vào lượt đặt; đổi giá chuyến sau đó không đổi lượt đã đặt.
- `deposit = total × deposit_percent / 100`, làm tròn lên bội số 1.000 ₫, không quá `total`. `deposit_percent = 0` nghĩa là không cần trả trước.
- Một lượt **đang giữ chỗ** khi nó `CONFIRMED`, hoặc `PENDING` mà chưa quá hạn giữ chỗ (không có hạn, hạn chưa tới, hoặc khách đã báo chuyển khoản). Mọi phép đếm chỗ, kể cả "còn N chỗ" trên trang khách, dùng đúng định nghĩa này, nên lượt quá hạn không chiếm chỗ dù chưa được quét.
- Bấm "Xác nhận đặt chỗ" hai lần chỉ tạo một lượt: bước 2 mang một khoá ngẫu nhiên, lưu duy nhất trên lượt đặt; lần gửi lại trả về lượt đã có.
- Giá và chỗ được tính lại lúc xác nhận. Nếu tổng tiền khác con số khách đã thấy ở bước 2, hoặc chuyến không còn đặt được, app hiện lại bước 2 với số mới và một thông báo, không tạo lượt đặt.

### 7.2 Giữ chỗ và xác nhận

- Khi `deposit > 0`, lượt mới có hạn giữ chỗ `hold_until = min(lúc đặt + hold_hours, giờ khởi hành)`. Quá hạn mà tiền đã trả nhỏ hơn tiền cọc thì lượt bị huỷ với lý do "Quá hạn giữ chỗ" (người huỷ `SYSTEM`) và nhả chỗ. Khách đã bấm "Tôi đã chuyển khoản" thì lượt không bị huỷ vì quá hạn: trưởng HTX phải ghi khoản thu hoặc huỷ. Việc quét chạy ngay trong transaction đặt chỗ của chuyến đó và khi mở trang Tổng quan; không có tiến trình nền.
- Lượt còn `PENDING` khi chuyến khởi hành bị huỷ với lý do "Chuyến đã khởi hành mà chưa được xác nhận" (người huỷ `SYSTEM`), cùng lượt quét đó.
- Lượt `PENDING` thành `CONFIRMED` khi: trưởng HTX bấm xác nhận; hoặc tổng khoản thu đạt tiền cọc (khi `deposit > 0`); hoặc ngay lúc đặt nếu `auto_confirm` bật và `deposit = 0`.
- Hoàn tiền làm tiền đã trả xuống dưới tiền cọc không đổi trạng thái của lượt `CONFIRMED`.
- Lượt `CANCELLED` không mở lại, trừ một trường hợp: lượt bị hệ thống huỷ vì "Quá hạn giữ chỗ" mà sau đó trưởng HTX ghi khoản thu làm tiền đã trả đạt tiền cọc (khách đã chuyển khoản đúng hạn nhưng HTX ghi nhận muộn). Nếu chuyến chưa khởi hành, chưa bị huỷ và còn đủ chỗ thì lượt được khôi phục thành `CONFIRMED`, lịch sử ghi "Khôi phục: tiền cọc về sau hạn giữ chỗ". Không đủ điều kiện thì lượt vẫn huỷ và hiện ở "Cần hoàn tiền". Chuyến `CANCELLED` không mở lại.

### 7.3 Thanh toán VietQR

- HTX khai ngân hàng (chọn trong bảng ở Phụ lục A), số tài khoản (6–19 chữ số) và tên chủ tài khoản (chữ hoa không dấu, số và dấu cách, tối đa 60). Chưa khai thì trang khách không hiện mã QR mà hiện "Liên hệ HTX để thanh toán" kèm đường dây nóng.
- Mã QR theo chuẩn EMVCo của VietQR/NAPAS, gồm số tiền còn phải trả (tiền cọc nếu chưa cọc, phần còn lại nếu đã cọc) và nội dung `TOUR <mã đặt chỗ>`. Vectơ kiểm thử ở Phụ lục A.
- Ảnh QR do máy chủ dựng bằng thư viện `segno` và chèn bằng `<img>` với data URI; không dùng thuộc tính `style`.
- Trưởng HTX ghi khoản thu (số tiền, hình thức, ghi chú). Hoàn tiền là khoản âm, không được làm tổng đã trả xuống dưới 0. Khoản thu không được làm tổng đã trả vượt tổng tiền của lượt. Ghi khoản thu được cả sau giờ khởi hành và cả trên lượt đã huỷ (tiền về muộn), khi đó lượt hiện ở "Cần hoàn tiền". Mỗi khoản thu ghi tên người ghi lấy từ token.
- `REFUND_DUE` cũng áp dụng khi tiền đã trả lớn hơn tổng tiền (sau khi giảm số người); số phải hoàn là phần chênh.

### 7.4 Huỷ

- Khách tự huỷ được khi lượt đang `PENDING` hoặc `CONFIRMED` và còn ít nhất `cancel_free_hours` giờ trước giờ khởi hành. Quá hạn thì trang hiện đường dây nóng thay cho nút huỷ.
- Trưởng HTX huỷ lượt bất kỳ lúc nào trước giờ khởi hành, phải ghi lý do. Huỷ chuyến sẽ huỷ mọi lượt đang giữ chỗ của chuyến với lý do "HTX huỷ chuyến".
- Lượt đã huỷ mà đã trả tiền hiện ở mục "Cần hoàn tiền" cho tới khi tổng đã trả về 0.

### 7.5 Vé và điểm danh

- Vé hiện khi lượt `CONFIRMED`. Mã QR của vé chứa chuỗi `OPENTEA-TOUR:<htx>:<mã đặt chỗ>`.
- Điểm danh chỉ cho lượt `CONFIRMED` của chuyến không bị huỷ, từ 00:00 ngày khởi hành (giờ Việt Nam) tới 24 giờ sau khi chuyến kết thúc (giờ khởi hành cộng thời lượng). Trưởng HTX điểm danh mọi chuyến; người dẫn chỉ chuyến của mình. Ghi số người có mặt (từ 1 tới cả đoàn, mặc định cả đoàn), ai điểm danh và lúc nào; bỏ điểm danh được trong cùng khoảng thời gian.
- Lượt `CONFIRMED` chưa điểm danh khi chuyến đã kết thúc hiện là "Vắng mặt"; đây là trạng thái tính ra, không lưu.
- Trang chuyến của quản trị và của người dẫn có ô nhập mã đặt chỗ để điểm danh nhanh.

### 7.6 Đánh giá

- Khách gửi được một đánh giá cho mỗi lượt đã điểm danh (ít nhất một người có mặt), sau giờ khởi hành. Đánh giá ở trạng thái `PENDING` tới khi trưởng HTX đăng (`PUBLISHED`) hoặc ẩn (`HIDDEN`); trưởng HTX có thể trả lời.
- Trang khách chỉ hiện đánh giá `PUBLISHED` với tên hiển thị khách tự nhập (mặc định là tên gọi, từ cuối của họ tên), điểm sao và tháng đi. Điểm trung bình của tour tính trên đánh giá `PUBLISHED`.

### 7.7 Ảnh

- Chỉ trưởng HTX tải ảnh lên: JPEG, PNG hoặc WebP, mỗi lần một ảnh, tệp tối đa 5 MB; ảnh JPEG tối đa 16 triệu điểm ảnh, ảnh PNG và WebP tối đa 6 triệu điểm ảnh (kiểm trên kích thước khai trong tệp, trước khi giải mã; đo trong container thật, ảnh PNG hoặc WebP 16 triệu điểm ảnh vượt bộ nhớ của app). Giới hạn này theo container của app: 256 MB bộ nhớ, nửa nhân CPU, proxy hết giờ sau 10 giây; ảnh JPEG được giải mã ở cỡ thu nhỏ (`draft`). Máy chủ dùng Pillow để xoay theo EXIF, bỏ toàn bộ siêu dữ liệu (kể cả toạ độ GPS) và mã hoá lại thành JPEG ở hai cỡ: `large` (cạnh dài tối đa 1600 px) và `thumb` (tối đa 640 px). Tệp không giải mã được thành ảnh bị từ chối.
- Ảnh lưu trong schema của app (cột `bytea`), vì container của app chỉ đọc và không có kho tệp. Tối đa 12 ảnh một tour, 200 ảnh một HTX.
- Tour không có ảnh dùng hình minh hoạ SVG theo loại tour (5 hình do dự án vẽ, giấy phép MIT).

### 7.8 Nhật ký lượt đặt

Mỗi thay đổi của lượt đặt (tạo, xác nhận, khoản thu, khách báo đã chuyển, huỷ, đổi chuyến, sửa số người, điểm danh) thêm một dòng vào lịch sử: thời điểm, ai (khách, trưởng HTX kèm tên, người dẫn kèm tên, hệ thống), việc gì. Trang lượt đặt của quản trị hiện lịch sử này.

### 7.9 Sửa lượt đặt, tạo chuyến hàng loạt, ngừng bán

- **Sửa số người** (trưởng HTX, trước giờ khởi hành, lượt đang giữ chỗ): giữ đơn giá của lượt; tổng tiền và tiền cọc tính lại theo tỉ lệ cọc hiện hành; hạn giữ chỗ không đổi; phải còn đủ chỗ.
- **Đổi chuyến** (trưởng HTX, lượt đang giữ chỗ): chỉ sang chuyến khác của cùng tour, chưa khởi hành, `OPEN` hoặc `CLOSED`, còn đủ chỗ. Lượt giữ nguyên đơn giá, tổng tiền, tiền cọc và tiền đã trả.
- **Tạo chuyến hàng loạt:** chọn các thứ trong tuần, một giờ khởi hành (giờ:phút), ngày đầu và ngày cuối cách nhau tối đa 180 ngày. Bỏ qua ngày đã có chuyến chưa huỷ của tour đó vào đúng giờ ấy và ngày giờ đã qua. Nếu số chuyến sẽ tạo vượt 60 thì từ chối cả lô và không tạo chuyến nào.
- **Ngừng bán hoặc đưa tour về bản nháp:** các chuyến và lượt đặt hiện có vẫn chạy; khách mới không đặt được. Trang xác nhận nêu số chuyến sắp tới còn lượt đang giữ chỗ.
- `slug` của tour sinh từ tên lúc tạo (bỏ dấu tiếng Việt, trùng thì thêm hậu tố số) và không đổi về sau.
- Trang huỷ chuyến nêu số lượt sẽ bị huỷ và gợi ý đổi chuyến cho khách trước.

## 8. Dữ liệu

Migration mới `migrations/002_tour_system.sql` chạy trong một transaction bằng role `app_tea_tour`. Mọi bảng có `htx_code text NOT NULL`; mọi khoá ngoại tới bảng có `htx_code` gồm cả `htx_code`.

| Bảng | Cột chính và ràng buộc |
| --- | --- |
| `settings` | khoá `htx_code`; `display_name` ≤80, `tagline` ≤160, `intro` ≤2000, `hotline`, `zalo`, `email`, `address` ≤200, `map_url` (chỉ `https://`, ≤300), `cover_media_id`, `bank_bin` (6 chữ số), `bank_account`, `bank_holder`, `deposit_percent` 0–100 mặc định 0, `hold_hours` 1–168 mặc định 24, `cancel_free_hours` 0–720 mặc định 24, `auto_confirm` mặc định false, `policy_text` ≤2000 |
| `media` | `id`, `width`, `height`, `large bytea`, `thumb bytea`, `created_by`, `created_at` |
| `tours` | thêm `slug` (duy nhất trong HTX, `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤80), `summary` ≤200, `category`, `duration_minutes` 30–2880, `map_url`, `price_adult_vnd`, `price_child_vnd`, `default_seats` 1–200, `itinerary jsonb` (≤12 mục `{time ≤20, title ≤80, detail ≤300}`), `includes`, `excludes`, `bring` (`jsonb`, mỗi danh sách ≤10 dòng ≤120), `faq jsonb` (≤8 mục `{q ≤160, a ≤500}`), `cover_media_id`, `updated_at`; `description` ≤4000; `status` thành `DRAFT`/`PUBLISHED`/`ARCHIVED`; bỏ `starts_at`, `seats`, `price_vnd`, `guide_user_id`, `guide_name` |
| `tour_media` | `tour_id`, `media_id`, `position`; khoá (`tour_id`, `media_id`) |
| `departures` | `id`, `tour_id`, `starts_at`, `seats` 1–200, `price_adult_vnd`, `price_child_vnd`, `guide_user_id`, `guide_name`, `status`, `cancel_reason` ≤200, `created_at` |
| `bookings` | `tour_id` đổi thành `departure_id`; thêm `email`, `adults`, `children`, `party_size` (cột sinh ra `adults + children`, 1–200), `price_adult_vnd`, `price_child_vnd`, `total_vnd`, `deposit_vnd`, `paid_vnd` mặc định 0, `hold_until`, `request_key` (duy nhất trong HTX), `access_key` (22 ký tự), `internal_note` ≤500, `cancel_reason` ≤200, `cancelled_by` (`GUEST`/`MANAGER`/`SYSTEM`), `cancelled_at`, `guest_paid_reported_at`, `checked_in_at`, `checked_in_count`, `checked_in_by`, `source` (`WEB`/`APP`/`MANAGER`) |
| `payments` | `id`, `booking_id`, `amount_vnd` (khác 0), `method`, `note` ≤200, `recorded_by_id`, `recorded_by_name`, `recorded_at` |
| `booking_events` | `id`, `booking_id`, `at`, `actor_kind` (`GUEST`/`MANAGER`/`GUIDE`/`SYSTEM`), `actor_name`, `kind`, `detail` ≤300 |
| `reviews` | `id`, `booking_id` (duy nhất), `tour_id`, `rating` 1–5, `comment` ≤1000, `display_name` ≤40, `status`, `reply` ≤1000, `created_at`, `moderated_at` |
| `inquiries` | `id`, `name` ≤80, `phone`, `group_size` 1–500, `desired_date`, `message` ≤1000, `status`, `internal_note` ≤500, `created_at` |

`bookings.paid_vnd` luôn bằng tổng `payments.amount_vnd` của lượt đó; hai thứ được ghi trong cùng một transaction.

Chuyển dữ liệu 0.2.0 trong migration 002:

1. Mỗi tour cũ thành một tour (giữ `id`, tên, mô tả, điểm hẹn; giá người lớn và giá trẻ em bằng giá cũ; số chỗ mặc định bằng số chỗ cũ; loại `SIGHTSEEING`; thời lượng 180 phút; `slug` là `tour-` cộng 8 ký tự đầu của `id`; `OPEN` thành `PUBLISHED`, `CANCELLED` thành `ARCHIVED`) và một chuyến (ngày giờ, số chỗ, người dẫn cũ; `OPEN` hoặc `CANCELLED`).
2. Mỗi lượt đặt cũ trỏ sang chuyến đó: `adults = party_size`, `children = 0`, đơn giá bằng giá cũ, `total = party_size × giá`, `deposit = 0`, `paid = 0`, không có hạn giữ chỗ, `source = 'WEB'`, `request_key` và `access_key` sinh ngẫu nhiên. Trạng thái giữ nguyên, trừ hai trường hợp ở mục 3.
3. Để dữ liệu cũ thoả quy tắc mới, migration huỷ (người huỷ `SYSTEM`, có dòng lịch sử): lượt `PENDING` hoặc `CONFIRMED` của tour cũ đã `CANCELLED`, với lý do "HTX huỷ chuyến" (bản 0.2.0 huỷ tour mà không huỷ lượt đặt); và lượt `PENDING` của tour đã diễn ra, với lý do "Chuyến đã khởi hành mà chưa được xác nhận".
4. Không có dòng nào bị xoá. Một kiểm thử nạp dữ liệu 0.2.0, chạy migration 002 và so từng lượt đặt.

## 9. Thay đổi ở lõi (`apps/web`, áp dụng cho mọi mini-app)

1. **Giới hạn truy cập công khai tách đọc và ghi.** Hiện mọi yêu cầu công khai dùng chung mức 10 lần một phút cho mỗi IP, nên một trang có ảnh là chạm trần. Từ nay yêu cầu ghi (không phải `GET`/`HEAD`) có mức 30 (`DXOS_APP_PUBLIC_LIMIT`); yêu cầu đọc có mức riêng 300 (`DXOS_APP_PUBLIC_READ_LIMIT`). Hai bộ đếm riêng, cùng thông báo 429. Mức ghi nâng từ 10 lên 30 vì một lượt đặt nay cần hai lần gửi form (bước 1, bước 2) cộng các lần sửa lỗi, và một đoàn khách dùng chung một điểm phát sóng có cùng địa chỉ IP.
2. **Giữ `cache-control` của app** trên phản hồi `GET`/`HEAD` có mã 200 của đường dẫn công khai. Mọi phản hồi khác không đổi (header này vẫn bị bỏ).
3. **Chặn thân yêu cầu quá lớn:** `content-length` trên 10 MiB bị trả 413 trước khi chuyển tiếp.
4. CSP, sandbox, danh sách header chuyển tiếp, kiểm tra nguồn gửi form, hết giờ 10 giây: không đổi. Phiên bản web thành `1.13.0`; `tea-tour` 1.0.0 khai `requires.core: ">=1.13.0"`.

## 10. Manifest và Kho ứng dụng

- `version: 1.0.0`; `routes` và `menu` giữ nguyên (`/` cho `manager`, `/guide` cho `farmer`, công khai `/public/`); tên app giữ "Đặt tour đồi chè".
- Khối `store` viết lại: mô tả mới, mục dữ liệu và dữ liệu cá nhân theo §3 và §6 (người dẫn thấy tên khách đã xác nhận của chuyến mình dẫn, không thấy số điện thoại), tối đa 4 ảnh màn hình (trang chủ của khách, chi tiết tour, lượt đặt có VietQR, tổng quan quản trị), mỗi ảnh không quá 400 KB.
- Phụ thuộc mới của app: `Pillow` (HPND) cho ảnh, `segno` (BSD-3-Clause) cho mã QR; phông Be Vietnam Pro (OFL-1.1). Ghi vào `DEPENDENCIES.md`.

## 11. Kiểm thử và nghiệm thu

- **pytest của app:** quy tắc §7 (đặt đồng thời không vượt chỗ, hạn giữ chỗ, tự xác nhận khi đủ cọc, hoàn tiền không âm, gửi lại không tạo lượt thứ hai, hạn huỷ, khoảng thời gian điểm danh, một đánh giá một lượt), chuỗi VietQR đúng vectơ, ảnh (tệp không phải ảnh, ảnh quá lớn, EXIF bị bỏ), migration 002, cách ly giữa các HTX trên mọi đường dẫn có `id` hoặc `slug`, người dẫn không thấy số điện thoại và không vào được chuyến của người khác, văn bản thù địch (`<script>`, công thức bảng tính) hiện ra như chữ.
- **jest của web:** ba thay đổi ở §9.
- **`make apps-smoke`:** khối `tea-tour` viết lại theo trang mới, giữ mọi kiểm tra về cổng (từ chối đúng vai, 404 ở cổng công bố), cài lại sau khi app khác chiếm địa chỉ, CSV, bản in, gỡ giữ dữ liệu, `--purge` sạch; thêm một lượt nâng cấp từ 0.2.0 có dữ liệu.
- **Trình duyệt:** câu chuyện trọn vòng (trưởng HTX tạo tour từ mẫu, tải ảnh, mở chuyến; khách đặt trên 390 px, thấy VietQR; trưởng HTX ghi khoản thu, lượt tự xác nhận; khách mở vé; người dẫn điểm danh; khách gửi đánh giá; trưởng HTX đăng đánh giá); ảnh màn hình các trang chính ở 1280 và 390 px, sáng và tối, không cuộn ngang, không chồng chữ.
- **Không thoái lui:** mọi bộ kiểm của `v1.12.0` không thuộc `tea-tour` giữ nguyên số lượng và đều qua; các kiểm thử của `tea-tour` 0.2.0 được viết lại theo hợp đồng mới, không bị bỏ.
- **Hai vòng trên stack sạch** (`COMPOSE_PROJECT_NAME=dxos-clean`) trước khi báo xong; kiểm tải ảnh trong container thật (hệ tệp gốc chỉ đọc, chỉ `/tmp` ghi được).

## 12. Để sẵn cho đợt 2 (API và app Android)

- Mọi quy tắc nghiệp vụ nằm trong lớp dữ liệu và miền, không nằm trong hàm xử lý trang, để API JSON dùng lại nguyên vẹn.
- `source` của lượt đặt đã có giá trị `APP`; chuỗi QR của vé đã cố định ở §7.5.
- Đợt 2 thêm: đường dẫn JSON dưới `/public/<htx>/api/` và dưới một tiền tố có bảo vệ; client Keycloak công khai dùng PKCE cho điện thoại; proxy của web nhận `Authorization: Bearer` từ app; app Android (Kotlin, Jetpack Compose); dựng APK trong CI.

## 13. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Mã VietQR không quét được bằng app ngân hàng thật | Kiểm bằng vectơ và bộ giải mã độc lập; không thử chuyển tiền thật được trong môi trường phát triển, nên ghi là giới hạn đã biết và nhờ chủ dự án quét thử một lần |
| Mã ngân hàng (BIN) trong Phụ lục A sai | Người triển khai đối chiếu với danh sách công khai của VietQR; lệch thì dùng giá trị chính thức và báo lại |
| Ảnh trong database làm schema phình to | Giới hạn 200 ảnh một HTX, mỗi ảnh mã hoá lại (khoảng 300 KB cho hai cỡ) |
| Nới giới hạn công khai (đọc 300, ghi 30 lần một phút) tăng tải database và thư rác | Vẫn là giới hạn theo IP, chỉnh được bằng biến môi trường; ảnh và tệp tĩnh được trình duyệt giữ lại một năm |
| Migration 002 hỏng giữa chừng trên máy đã có dữ liệu | Một transaction; kiểm thử nâng cấp từ 0.2.0 có dữ liệu trong pytest và trong smoke |
| Bốn nhánh làm song song đụng nhau | Nhánh nền tạo sẵn khung, mỗi nhánh chỉ sửa tệp của mình (kế hoạch nêu rõ) |

## Phụ lục A — VietQR

Cấu trúc: `00`=`01`; `01`=`12`; `38` gồm `00`=`A000000727`, `01` gồm (`00`=BIN, `01`=số tài khoản), `02`=`QRIBFTTA`; `53`=`704`; `54`=số tiền; `58`=`VN`; `62` gồm `08`=nội dung; `63`=CRC-16/CCITT-FALSE (đa thức `0x1021`, khởi tạo `0xFFFF`) tính trên toàn chuỗi kể cả `6304`, viết 4 chữ số hex hoa.

Vectơ kiểm thử: BIN `970405`, tài khoản `8600201001234`, số tiền `500000`, nội dung `TOUR K7M2QX9A` cho chuỗi

```
00020101021238570010A00000072701270006970405011386002010012340208QRIBFTTA530370454065000005802VN62170813TOUR K7M2QX9A6304C17A
```

Bảng ngân hàng (tên hiển thị, BIN): Agribank 970405; Co-opBank 970446; BIDV 970418; VietinBank 970415; Vietcombank 970436; MB 970422; Techcombank 970407; ACB 970416; VPBank 970432; TPBank 970423; Sacombank 970403; HDBank 970437; VIB 970441; SHB 970443; LPBank 970449; Eximbank 970431; MSB 970426; OCB 970448; SeABank 970440; Nam A Bank 970428; Bac A Bank 970409.

## Phụ lục B — Bốn mẫu tour

"Một ngày làm người hái chè" (`PICKING`, 240 phút), "Sao chè thủ công và thưởng trà" (`CRAFTING`, 180 phút), "Bình minh trên đồi chè" (`SIGHTSEEING`, 150 phút), "Lớp học trên đồi chè" (`EDUCATION`, 210 phút). Mỗi mẫu điền sẵn tóm tắt, mô tả, lịch trình 4–6 mục, bao gồm, cần mang theo, 3 câu hỏi đáp, giá gợi ý và số chỗ; trưởng HTX sửa trước khi đăng bán. Mẫu không tạo chuyến.
