<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Kho mini-app: bật/tắt theo HTX và ba ứng dụng nghiệp vụ

> **Trạng thái:** Bản thiết kế (2026-11-12). Chủ dự án đã duyệt từng phần trong lúc trao đổi và cho phép triển khai mà không chờ duyệt thêm; bước merge vào `main` và gắn tag phát hành vẫn hỏi lại.
> **Phạm vi:** milestone `v1.9.0`. Tiếp nối Tầng 3 (`docs/specs/2026-11-11-tier3-miniapps-design.md`, phát hành `v1.8.1`).
> **Căn cứ:** Nền tảng cài/gỡ mini-app đã được chứng minh. Bước tiếp theo là các ứng dụng HTX chè dùng hằng ngày, và để ban quản trị HTX tự chọn ứng dụng ngay trên web.

## 1. Mục tiêu

1. Ban quản trị HTX mở trang **Kho ứng dụng**, bấm **Cài** hoặc **Gỡ** cho HTX của mình. HTX này không ảnh hưởng HTX kia.
2. Web không có quyền điều khiển Docker. Việc dựng và tắt container do một tiến trình trên máy chủ làm, qua một hàng đợi trong database.
3. Ba mini-app nghiệp vụ chạy thật: **Thu mua búp tươi**, **Cửa hàng chè**, **Vật tư mua chung**.
4. Toàn bộ chức năng đang chạy được giữ nguyên: `./dxos install/remove`, câu chuyện A3, câu chuyện đặt tour, smoke lõi 124 PASS.

**Thước đo khi demo:** ban quản trị Tân Cương mở Kho ứng dụng, bấm Cài "Cửa hàng chè". Trang hiện "Đang cài", rồi "Đã cài", menu có mục mới. Ban quản trị La Bằng không thấy app đó. Khách đặt chè trên điện thoại. Ban quản trị bấm Gỡ rồi Cài lại: dữ liệu vẫn còn.

## 2. Hiện trạng liên quan

- **Cài/gỡ:** `./dxos install <dir>` và `./dxos remove <id> [--purge]` chạy trên máy chủ; container `dxos-cli` lo manifest, database, route gateway, nhật ký cài đặt và bảng `platform.installed_apps`. Trạng thái runtime nằm ở `docker/runtime/<project>/`.
- **Phạm vi app:** một app đã cài hiện cho mọi HTX. Menu đọc `platform.installed_apps` (`apps/web/src/lib/apps/app-nav.ts`); proxy `/apps/<id>/...` chỉ kiểm app đã cài (`apps/web/src/app/apps/[id]/[[...path]]/route.ts`).
- **Manifest:** `platform/apps/manifest.schema.json`, không có trường mô tả.
- **App mẫu:** `miniapps/tea-tour` (FastAPI, Jinja2, không JavaScript) là mẫu cho app có database, trang công khai `/public/<mã HTX>/...`, đọc dữ liệu lõi qua Hasura bằng token người dùng.
- **Kiểm toán:** `audit.capture_row()` ghi mọi thay đổi của bảng có cột `id` vào chuỗi băm `audit.events`.

## 3. Quyết định đã chốt

| Chủ đề | Quyết định | Lý do |
| --- | --- | --- |
| Ứng dụng | Thu mua búp tươi, Cửa hàng chè, Vật tư mua chung | Việc hằng ngày của HTX chè; chủ dự án chọn |
| Trang kho | Có nút Cài/Gỡ trên web | Chủ dự án chọn |
| Phạm vi nút | Mỗi HTX tự bật/tắt cho HTX mình | HTX này không gỡ được app của HTX kia |
| Cơ chế | Hàng đợi trong database + `./dxos worker` trên máy chủ | Không container nào có docker socket; không có cổng mạng nhận lệnh cài |
| `./dxos install` | Giữ nguyên: cài và bật cho mọi HTX | Không hồi quy lệnh, smoke và spec hiện có |
| Dữ liệu khi gỡ | Luôn giữ; chỉ `./dxos remove <id> --purge` xoá | Bấm nhầm Gỡ không làm mất dữ liệu |
| Mã nguồn app | Mỗi app tự chứa, chép mẫu từ `tea-tour` | Ba app làm song song, không phụ thuộc nhau |
| Liên thông giữa app | Không có ở đợt này | Các app chưa được cách ly với nhau (R24 của Tầng 3) |

## 4. Kho ứng dụng

### 4.1. Manifest và danh mục

- Manifest thêm trường tuỳ chọn `description` (chuỗi 1–200 ký tự). `apiVersion` vẫn là `dxos/v1`.
- Lệnh `dxos-cli catalog-sync` đọc mọi `miniapps/*/app.yaml`, bỏ qua manifest không hợp lệ (ghi cảnh báo), và ghi vào `platform.app_catalog`: `id`, `name`, `version`, `description`, `license`, `publisher`, `menu`, `roles` (các vai trò có mục menu), `has_public`. App không còn thư mục thì bị xoá khỏi danh mục.
- `make platform-up` và `./dxos worker` (lúc khởi động) chạy `catalog-sync`.

### 4.2. Bật/tắt theo HTX

- Bảng `platform.app_enablements(id, app_id, htx_code, enabled_by, enabled_at)`, duy nhất theo `(app_id, htx_code)`. `htx_code = '*'` nghĩa là bật cho mọi HTX.
- Một HTX **dùng được** app khi app có trong `platform.installed_apps` và có dòng bật cho HTX đó hoặc cho `'*'`.
- `./dxos install` ghi dòng `'*'` khi đăng ký app; `./dxos remove` xoá mọi dòng bật của app.
- **Menu:** chỉ hiện mục của app mà HTX của người dùng dùng được.
- **Proxy, trang có đăng nhập:** HTX lấy từ phiên đăng nhập; HTX chưa bật nhận 404.
- **Proxy, trang công khai:** quy ước chung là đoạn đường dẫn ngay sau tiền tố công khai là mã HTX, ví dụ `/apps/tea-shop/public/TC/...`. HTX đó chưa bật thì 404. `tea-tour` đã theo quy ước này.
- Trang khung `/<vai trò>/apps/<id>/...` áp dụng cùng phép kiểm.

### 4.3. Hàng đợi và worker

- Bảng `platform.app_requests(id, app_id, htx_code, action, requested_by, status, error, created_at, started_at, finished_at)`; `action` là `ENABLE` hoặc `DISABLE`; `status` là `PENDING`, `RUNNING`, `DONE` hoặc `FAILED`. Mỗi cặp `(app_id, htx_code)` chỉ có tối đa một yêu cầu đang mở (`PENDING` hoặc `RUNNING`).
- Bảng một dòng `platform.app_worker(seen_at)` giữ nhịp tim của worker.
- `./dxos worker` chạy trên máy chủ bằng tài khoản người vận hành, mỗi lúc một việc:
  1. Lúc khởi động: `catalog-sync`; chuyển yêu cầu `RUNNING` còn sót thành `FAILED` ("worker khởi động lại") và hoàn tác bản cài dở của app đó.
  2. Lấy yêu cầu `PENDING` cũ nhất, đặt `RUNNING`, cập nhật nhịp tim (lệnh lấy việc chờ tối đa 30 giây rồi trả về, để không phải khởi động container liên tục).
  3. `ENABLE`: nếu app chưa cài, chạy đúng luồng cài hiện có với thư mục `miniapps/<app_id>`, không ghi dòng `'*'`. Thành công thì ghi dòng bật cho HTX và đặt `DONE`. Hỏng thì hoàn tác như `./dxos install` và đặt `FAILED` kèm lý do ngắn bằng tiếng Việt.
  4. `DISABLE`: xoá dòng bật của HTX. Nếu app không còn dòng bật nào, chạy luồng `remove` hiện có (không `--purge`). Đặt `DONE`.
- Chỉ một worker chạy cho mỗi compose project (tệp khoá trong `docker/runtime/<project>/`).
- Worker chỉ nhận mã app khớp `^[a-z][a-z0-9-]{1,30}$`, có trong danh mục và có thư mục `miniapps/<app_id>` với manifest hợp lệ. Mọi mã khác thành `FAILED` mà không chạy lệnh nào.

### 4.4. Trang Kho ứng dụng

- Đường dẫn `/manager/app-store`, mục menu "Kho ứng dụng" của ban quản trị.
- Mỗi app một thẻ: tên, mô tả, phiên bản, giấy phép, nhà phát hành, vai trò sử dụng, có trang công khai hay không.
- Trạng thái và nút:
  - **Chưa cài** → nút **Cài**.
  - **Đang cài…** / **Đang gỡ…** → không có nút; trang tự hỏi lại trạng thái mỗi 3 giây.
  - **Đã cài** → nút **Gỡ**, có bước xác nhận và dòng "Dữ liệu được giữ lại".
  - **Đã cài cho mọi HTX (quản trị máy chủ)** → không có nút.
  - **Lỗi** → hiện lý do và nút **Thử lại**.
- Worker không có nhịp tim trong 30 giây: trang hiện cảnh báo "Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật `./dxos worker`."
- API: `GET /api/app-store` (danh mục, trạng thái của HTX người gọi, worker còn sống hay không) và `POST /api/app-store/requests` với `{ appId, action }`. Chỉ vai trò `manager`; HTX lấy từ `requireTenant()`, không lấy từ thân request.
- `POST` từ chối: app không có trong danh mục (404); đã có yêu cầu đang mở (409); `ENABLE` khi HTX đã bật, `DISABLE` khi HTX chưa bật hoặc app bật theo `'*'` (409).
- Giao diện theo `DESIGN.md`: chỉ dùng token, sáng/tối nhất quán, không tràn ngang ở 390 px, có trạng thái rỗng, đang tải và lỗi.

### 4.5. Bảo mật

1. Web chỉ ghi dòng vào `platform.app_requests`. Không container nào có docker socket; không có cổng mạng nhận lệnh cài.
2. Đầu vào của worker chỉ gồm mã app, mã HTX và hành động; không có đường dẫn, tên image hay lệnh.
3. Chỉ ban quản trị của đúng HTX tạo được yêu cầu cho HTX đó.
4. `platform.app_requests` và `platform.app_enablements` gắn trigger `audit.capture_row()`: ai bấm, lúc nào, kết quả gì đều nằm trong chuỗi kiểm toán.
5. Giới hạn giữ nguyên từ Tầng 3: các app dùng chung mạng `dxos-apps-net` và tin nhau (R24). Kho chỉ chứa app trong thư mục `miniapps/` của repo.

## 5. Ba mini-app

Cả ba theo mẫu `tea-tour`: FastAPI + Jinja2, không JavaScript, `/dxos-app.css`, tham số `?theme=`, bảng xếp thành thẻ trên điện thoại, mọi truy vấn lọc theo `htx_code` lấy từ token, giới hạn 8 kết nối database, mọi thao tác ghi là POST và trả 303, lỗi hiện bằng tiếng Việt, tiền là số nguyên VND.

### 5.1. Thu mua búp tươi (`leaf-purchase`)

- **Cán bộ và ban quản trị:** ghi phiếu cân cho một hộ (ngày, loại búp, số kg có một chữ số thập phân, đơn giá lấy từ bảng giá); sửa hoặc huỷ phiếu chưa thuộc kỳ đã chốt; xem tổng theo ngày.
- **Ban quản trị:** đặt bảng giá theo loại búp; chốt kỳ thanh toán (từ ngày – đến ngày) thành bảng tổng kg và tiền theo hộ; đánh dấu đã chi cho từng hộ. Phiếu thuộc kỳ đã chốt bị khoá. Hai kỳ không được chồng ngày.
- **Nông hộ:** xem phiếu cân của hộ mình, tổng kg và tiền theo kỳ, đã nhận hay chưa.
- Danh sách hộ lấy từ lõi qua Hasura bằng token người dùng. Hộ của nông hộ đang đăng nhập cũng tra qua Hasura.
- Đường dẫn: `/` (cán bộ, ban quản trị), `/periods` (ban quản trị), `/mine` (nông hộ). Không có trang công khai.

### 5.2. Cửa hàng chè (`tea-shop`)

- **Ban quản trị:** quản lý sản phẩm (tên, quy cách, giá, tồn kho, mã lô truy xuất tuỳ chọn, đang bán hay ngừng); xử lý đơn: Mới → Đã xác nhận → Đang giao → Hoàn tất; huỷ đơn chưa hoàn tất thì trả lại tồn kho.
- **Khách (công khai, không đăng nhập):** xem sản phẩm của HTX tại `/apps/tea-shop/public/<mã HTX>`; sản phẩm có mã lô thì có link "Xem nguồn gốc" tới `/lot/<mã lô>`; đặt nhiều sản phẩm trong một đơn với họ tên, số điện thoại Việt Nam, địa chỉ, ghi chú; nhận mã đơn; tra đơn bằng mã và số điện thoại.
- Trừ tồn kho trong một transaction có khoá dòng: đặt đồng thời không bán vượt tồn kho.
- Thanh toán khi nhận hàng. Họ tên, số điện thoại, địa chỉ khách chỉ ban quản trị của đúng HTX xem được.
- Đường dẫn: `/` (ban quản trị), `/public/` (công khai).

### 5.3. Vật tư mua chung (`farm-supply`)

- **Ban quản trị:** mở đợt đăng ký (tên, hạn đăng ký, danh mục vật tư gồm tên, đơn vị, đơn giá); đóng đợt; xem tổng hợp theo vật tư và theo hộ; đánh dấu đã giao và đã thu tiền cho từng hộ.
- **Nông hộ:** xem đợt đang mở; đăng ký hoặc sửa số lượng trước hạn; xem các đợt đã đăng ký, số tiền phải trả, trạng thái giao hàng và thu tiền.
- Sau hạn hoặc khi đợt đã đóng, nông hộ không sửa được đăng ký.
- Đường dẫn: `/` (ban quản trị), `/mine` (nông hộ). Không có trang công khai.

### 5.4. Ngoài phạm vi

Thanh toán online; hoá đơn và thuế; trừ nợ vật tư vào tiền thu mua; thông báo đẩy; xuất Excel.

## 6. Kiểm thử

| Lớp | Nội dung |
| --- | --- |
| CLI (pytest) | `catalog-sync`; lấy việc từng cái một; `ENABLE` cài rồi bật; `DISABLE` cuối cùng gỡ container; cài hỏng thành `FAILED` và hoàn tác; mã app lạ bị từ chối; `./dxos install` ghi `'*'` |
| Từng app (pytest, Postgres tạm) | Tách dữ liệu theo HTX; sai vai trò bị chặn; validate; HTML được escape; `tea-shop`: 20 đơn đồng thời cho tồn kho 5 chỉ 5 đơn thành công; `leaf-purchase`: phiếu trong kỳ đã chốt không sửa được, kỳ không chồng ngày; `farm-supply`: không sửa đăng ký sau hạn |
| Web (Jest) | API kho: chỉ `manager`, HTX từ phiên, các trường hợp 404/409; menu và proxy theo HTX đã bật; quy ước trang công khai |
| Tích hợp (`make apps-smoke`) | Bật qua hàng đợi với worker thật; HTX khác nhận 404; gỡ rồi bật lại giữ dữ liệu; smoke lõi vẫn 124 PASS |
| Trình duyệt | Câu chuyện "Kho ứng dụng"; một câu chuyện ngắn cho mỗi app; ảnh chụp 1280 và 390 px, sáng và tối |

## 7. Tổ chức thực hiện

Phiên chính thiết kế, viết kế hoạch và review. Việc triển khai giao cho các phiên khác (mô hình Sonnet 5.5):

| Job | Nội dung | Cách chạy |
| --- | --- | --- |
| 0 | Trường `description`, quy ước trang công khai, mô tả cho `hello` và `tea-tour` | Một phiên, chạy trước |
| A | Kho ứng dụng (§4) | Một phiên, song song với B–D |
| B, C, D | `leaf-purchase`, `tea-shop`, `farm-supply`; mỗi job chỉ sửa trong `miniapps/<id>/` | Ba phiên song song, mỗi phiên một worktree |
| E | Tích hợp: smoke, trình duyệt, CI, tài liệu, hai vòng kiểm tra sạch | Một phiên, sau khi A–D đã gộp |

Tệp dùng chung (CI, smoke, `CHANGELOG.md`, `DEPENDENCIES.md`, README) chỉ job A và job E sửa.

## 8. Tiêu chí hoàn thành

1. Câu chuyện "Kho ứng dụng" và câu chuyện của ba app chạy trọn trên trình duyệt thật.
2. Không hồi quy: `./dxos install/remove`, câu chuyện A3 và đặt tour, smoke lõi 124 PASS.
3. `make build`, `make test`, `make lint` xanh; CI xanh.
4. Phát hành `v1.9.0` khoảng 24–25/11, trước hạn chốt tính năng 02/12.

**Điểm cắt nếu trễ, theo thứ tự:** app `farm-supply`; phần chốt kỳ thanh toán của `leaf-purchase`; trang kho tự cập nhật trạng thái (đổi thành tải lại tay).

**Không cắt:** nút Cài/Gỡ qua worker; bật/tắt theo HTX; ghi phiếu cân; đặt hàng ở `tea-shop`; các ràng buộc ở §4.5.

## 9. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Worker không chạy khi demo | Trang kho báo rõ; README có bước bật worker; job E kiểm bằng worker thật |
| Lần cài đầu phải build image, mất vài phút | Build sẵn image trước buổi demo, như hướng dẫn của Tầng 3 |
| Ba phiên song song sửa trùng tệp | Mỗi app một thư mục và một worktree; tệp dùng chung chỉ job A và E sửa |
| App giữ tiền và thông tin cá nhân nhưng các app tin nhau | Kho chỉ chứa app của dự án; giới hạn ghi trong CHANGELOG và README; cách ly thật để sau |
