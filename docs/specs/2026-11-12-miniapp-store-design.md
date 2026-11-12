<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Kho mini-app: bật/tắt theo HTX và ba ứng dụng nghiệp vụ

> **Trạng thái:** Đã triển khai trên nhánh `feat/miniapp-store` (2026-11-12 đến 2026-11-13); thân tài liệu giữ nguyên bản thiết kế, xem "Ghi chú sau triển khai" ở cuối. Bước merge vào `main` và gắn tag `v1.9.0` vẫn chờ chủ dự án.
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
- **Nâng cấp từ bản chưa có kho:** lần chạy `platform-init` tạo ra bảng `app_enablements` ghi dòng `'*'` (`enabled_by = 'dxos-upgrade'`) cho mọi app đang có trong `installed_apps`, vì trước đó app cài bằng `./dxos install` phục vụ mọi HTX. Các lần chạy sau không ghi lại: app đã cài mà không còn dòng bật nào là trạng thái hợp lệ (mọi HTX đã gỡ nhưng gỡ container hỏng).
- **Menu:** chỉ hiện mục của app mà HTX của người dùng dùng được.
- **Proxy, trang có đăng nhập:** HTX lấy từ phiên đăng nhập; HTX chưa bật nhận 404.
- **Proxy, trang công khai:** quy ước chung là đoạn đường dẫn ngay sau tiền tố công khai là mã HTX, ví dụ `/apps/tea-shop/public/TC/...`. HTX đó chưa bật thì 404. `tea-tour` đã theo quy ước này.
- Trang khung `/<vai trò>/apps/<id>/...` áp dụng cùng phép kiểm.

### 4.3. Hàng đợi và worker

- Bảng `platform.app_requests(id, app_id, htx_code, action, requested_by, status, error, created_at, started_at, finished_at)`; `action` là `ENABLE` hoặc `DISABLE`; `status` là `PENDING`, `RUNNING`, `DONE` hoặc `FAILED`. Mỗi cặp `(app_id, htx_code)` chỉ có tối đa một yêu cầu đang mở (`PENDING` hoặc `RUNNING`).
- Bảng một dòng `platform.app_worker(seen_at)` giữ nhịp tim của worker.
- `./dxos worker` chạy trên máy chủ bằng tài khoản người vận hành, mỗi lúc một việc:
  1. Lúc khởi động: `catalog-sync`; chuyển yêu cầu `RUNNING` còn sót thành `FAILED` ("worker khởi động lại") và hoàn tác bản cài dở của app đó. Chỉ hoàn tác khi app **chưa** có trong `installed_apps`: app đã đăng ký có thể đang phục vụ HTX khác, nên container của nó không bị đụng tới.
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
- Worker được coi là đang chạy khi có nhịp tim trong 30 giây gần nhất, hoặc khi có một yêu cầu `RUNNING` bắt đầu chưa quá 15 phút (worker không gửi nhịp tim trong lúc cài, và lần cài đầu phải build image). Ngoài hai trường hợp đó, trang hiện cảnh báo "Trình cài đặt chưa chạy. Yêu cầu sẽ được xử lý khi quản trị máy chủ bật `./dxos worker`."
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

## Ghi chú sau triển khai

Thân tài liệu ở trên giữ nguyên bản thiết kế. Phần này ghi những chỗ code cụ thể hơn hoặc khác thiết kế, và các số đo.

### Các quyết định (S1–S11)

| Mã | Quyết định | Cái giá nếu sai |
| --- | --- | --- |
| S1 | `./dxos install` = cài và bật cho `*` (mọi HTX), giữ nguyên hành vi cũ, smoke và các spec đang có | Cài từ máy chủ hiện cho mọi HTX, như trước đây |
| S2 | Worker là tiến trình máy chủ `./dxos worker`, kiểu kéo. `DISABLE` đánh dấu `DONE` trước khi gỡ container, nên HTX thấy app biến mất ngay | Gỡ container hỏng thì app còn đăng ký mà không HTX nào bật (vô hại, tốn một container nhàn rỗi) |
| S3 | `catalog-sync` giữ dòng danh mục của app đã cài dù thư mục của nó không còn, để trang kho vẫn hiện thẻ và cho Gỡ | Thẻ cũ còn lại |
| S4 | Phiên bản gói web là `1.9.0`; app mới khai `requires.core: ">=1.9.0"` vì dựa vào bật tắt theo HTX | Một commit hoàn lại |
| S5 | `leaf-purchase`: kỳ không chồng ngày được bảo đảm trong transaction dưới `pg_advisory_xact_lock`, không dùng ràng buộc `EXCLUDE` (role của app không tạo được `btree_gist`) | Thêm ràng buộc sau |
| S6 | Ba app chép các module phụ trợ của `tea-tour` thay vì dùng chung SDK: build context của Docker là thư mục app, và ba job song song không được dùng chung tệp | Trùng khoảng 150 dòng mỗi app |
| S7 | `leaf-purchase` từ chối phiếu ghi hoặc chuyển vào ngày thuộc kỳ đã chốt ("Ngày cân này thuộc một kỳ đã chốt."); nếu không phiếu đó không bao giờ được trả vì các kỳ không chồng ngày | Trưởng HTX không lùi ngày phiếu vào kỳ đã chốt được; phải mở kỳ mới cho ngày sau |
| S8 | Lần chạy `platform-init` tạo bảng `platform.app_enablements` bật mọi app đã cài cho `*` một lần (`enabled_by = 'dxos-upgrade'`); các lần sau không làm lại, vì app đã cài mà không có enablement là trạng thái hợp lệ (S2) và không được trả lại cho mọi HTX | Muốn bật lại cho mọi HTX thì `./dxos remove` rồi `install` |
| S9 | Worker khởi động lại chỉ hoàn tác lần cài dở của app chưa đăng ký; app đã đăng ký có thể đang phục vụ HTX khác | Một lần cài đã commit mà chưa xong để lại app đã cài không có enablement; "Thử lại" bật nó |
| S10 | Trang coi worker còn sống khi nó gửi nhịp tim trong 30 giây, hoặc có yêu cầu `RUNNING` dưới 15 phút (worker không gửi nhịp tim trong lúc cài) | Sau khi worker sập giữa lúc cài, cảnh báo hiện chậm tới 15 phút |
| S11 | `DISABLE` thất bại không hiện lỗi trên thẻ (enablement thắng yêu cầu cuối): nó chỉ hỏng khi worker sập hoặc app lạ | Trưởng HTX bấm Gỡ lần nữa |

### Khác thân tài liệu

- §4.3: ngoài hàng đợi, worker còn dùng bảng `platform.app_worker` (nhịp tim) và khoá thư mục `docker/runtime/<project>/worker.lock` (một worker cho mỗi compose project); `./dxos worker` đồng bộ danh mục khi khởi động.
- §4.4: nút Thử lại hiện ở thẻ `failed`; thẻ "Đã cài cho mọi HTX (quản trị máy chủ)" không có nút Gỡ.
- §5.2: `tea-shop` điều chỉnh tồn kho theo số gia (`+/-`) khi sửa sản phẩm, không ghi đè, để không mất đơn đặt xen giữa lúc mở và lưu biểu mẫu.
- §5.3: biểu mẫu thêm hoặc sửa mặt hàng của `farm-supply` báo lỗi bằng trang lỗi chung (tiêu đề và một dòng báo lỗi, không có biểu mẫu và liên kết quay lại), không báo ngay trên biểu mẫu; không lưu gì. Đã nhìn trên trình duyệt ở 1280 và 390 px. Chưa thiết kế lại.
- §6: tích hợp (`make apps-smoke`) còn kiểm cả vai trò sai qua gateway (`/tickets/*` và `/periods/*` của `leaf-purchase`), việc đọc nông hộ qua Hasura bằng token cán bộ, trưởng HTX và nông hộ, và một thao tác ghi cho mỗi app; câu chuyện trình duyệt chạy với worker thật.

### Số đo

Hai vòng kiểm tra sạch (stack `dxos-clean` dựng mới từ `down -v`, `platform-up`, seed, `platform-smoke`, mọi spec trình duyệt theo thứ tự của CI, `apps-smoke`, rồi `down -v` lại) cho cùng kết quả:

| Hạng mục | Kết quả |
| --- | --- |
| `make platform-smoke` | 124 PASS (65–132 giây) |
| `make apps-smoke` | 215 PASS khi container `web` đang chạy (213 PASS và một dòng SKIP khi không có web); trước job E là 117 PASS. 591 và 597 giây |
| Trình duyệt | core-tenant 5, câu chuyện A3 1, câu chuyện tour 1 và kiểm tra gỡ 1, ảnh chụp màn hình ưu tiên 56 (gồm trang Kho ứng dụng), câu chuyện Kho ứng dụng 1 (42 giây), câu chuyện ba app 2 (8 giây), ảnh chụp ba app và trang kho 32 (22 giây) |
| `make test` / `make lint` / `make build` / `npx tsc --noEmit` | 1521 test qua (3 bỏ qua) / không cảnh báo, `actionlint` sạch / dựng xong mọi image / sạch |
| pytest | CLI 104, `tea-tour` 44, `leaf-purchase` 26, `tea-shop` 34, `farm-supply` 16, scanner 39, dataops 78, `apps/disease-api` 17 (Python 3.11 trong container); `hello` 7 (unittest); kiểm tra realm 13; `seed-test.sh` sạch |
| Sau khi chạy | `./dxos list` rỗng, không còn schema hay role `app_*`, `dxos-clean` không còn container, volume hay mạng; sáu volume `docker_*` còn nguyên |

Thời gian trên máy phát triển: dựng một image app lạnh 13 giây; bước worker, hai câu chuyện, ảnh chụp, cài và gỡ app của job CI `platform-smoke` mất khoảng 3,5 phút. Giới hạn thời gian của job nâng từ 45 lên 60 phút (ước tính khoảng 41 phút trên runner của CI).
