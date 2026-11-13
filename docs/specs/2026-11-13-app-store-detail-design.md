<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Kho ứng dụng: trang chi tiết, xem trước khi cài, tiến trình và lịch sử

> **Trạng thái:** Đã triển khai trên nhánh `feat/app-store-detail` (2026-11-13); thân tài liệu giữ nguyên bản thiết kế, xem "Ghi chú sau triển khai" ở cuối. Bước merge vào `main` và gắn tag `v1.10.0` vẫn chờ chủ dự án.
> **Phạm vi:** milestone `v1.10.0`. Tiếp nối Kho mini-app (`docs/specs/2026-11-12-miniapp-store-design.md`, phát hành `v1.9.0`).
> **Căn cứ:** Phần máy của kho (hàng đợi, worker, bật tắt theo HTX) đã chạy. Phần trưởng HTX nhìn thấy mới là một trang thẻ với nút Cài và Gỡ: không biết app làm gì, cài sẽ thêm gì, đang cài tới đâu, và ai đã cài.

## 1. Mục tiêu

1. Trước khi bấm Cài, trưởng HTX đọc được app làm gì, dành cho ai, giữ dữ liệu gì và cài sẽ thêm gì vào hệ thống của HTX.
2. Trong lúc cài, trang cho biết đang ở bước nào; cài xong có nút mở app; hỏng thì nói hỏng ở bước nào và phải làm gì.
3. Kho tìm được, lọc được, và có lịch sử ai cài, ai gỡ, lúc nào.
4. Mọi thông tin hiển thị lấy từ manifest `app.yaml` của app; web không biết riêng app nào.

## 2. Ngoài phạm vi

- Cập nhật phiên bản app đã cài, ghi chú thay đổi của app.
- Viết thêm mini-app.
- Tải app từ ngoài repo, chấm điểm, bình luận.
- Kiểm soát thật việc app đọc dữ liệu gì: phần "Dữ liệu" là lời khai của nhà phát hành và trang ghi rõ như vậy (giới hạn R24 giữ nguyên).

## 3. Manifest: khối `store`

Khối tuỳ chọn `store` trong `app.yaml`, `additionalProperties: false`. App có khối này khai `requires.core: ">=1.10.0"`. Phiên bản của app không đổi vì mã chạy không đổi.

| Khoá | Kiểu | Giới hạn | Ý nghĩa |
|---|---|---|---|
| `category` | chuỗi | một trong `production`, `sales`, `members`, `tourism`, `sample` | Danh mục |
| `icon` | chuỗi | một trong `leaf`, `scale`, `shopping-bag`, `package`, `map-pinned`, `users`, `calendar`, `clipboard-list`, `truck`, `sparkles` | Biểu tượng; web vẽ từ bộ biểu tượng có sẵn, app không gửi hình |
| `about` | chuỗi | 1–2000 ký tự | Giới thiệu; dòng trống tách đoạn; hiển thị dạng chữ thuần |
| `data` | danh sách chuỗi | 0–8 mục, mỗi mục 1–160 ký tự | App giữ những dữ liệu gì |
| `personal_data` | chuỗi | 1–300 ký tự | Dữ liệu cá nhân nào và ai xem được |
| `core_reads` | danh sách chuỗi | 0–6 mục, mỗi mục 1–160 ký tự | Dữ liệu lõi app đọc bằng token của người dùng |
| `screenshots` | danh sách | 0–4 mục `{ file, caption }` | `file` là đường dẫn tương đối trong thư mục app; `caption` 1–120 ký tự |

Nhãn tiếng Việt của danh mục nằm ở web: Sản xuất và thu mua, Bán hàng, Thành viên và vật tư, Du lịch, Ứng dụng mẫu. App không có `store` vẫn có thẻ như hiện nay, với biểu tượng mặc định và không có danh mục.

**Ảnh màn hình.** PNG, WebP hoặc JPEG, nhận theo byte đầu của tệp chứ không theo đuôi tệp; mỗi ảnh tối đa 400 KB; đường dẫn không được ra ngoài thư mục app. `./dxos validate <thư mục>` báo lỗi khi ảnh thiếu, sai loại hoặc quá cỡ. `catalog-sync` bỏ qua ảnh hỏng kèm một dòng cảnh báo và vẫn đưa app lên kho: kho không mất một app vì một tấm ảnh.

## 4. Dữ liệu

Mở rộng `platform/postgres/init/06-app-store.sql` tại chỗ, không thêm tệp init mới (thêm tệp là thêm một mount, và `postgres` bị tạo lại một lần khi nâng cấp). Mọi câu lệnh idempotent; dòng `set_config` vẫn là câu đầu và dòng ghi `'*'` vẫn là câu cuối (quyết định S8).

- `platform.app_catalog` thêm `store jsonb NOT NULL DEFAULT '{}'` (khối `store` đã kiểm, không gồm `screenshots`), `requires_core text NOT NULL DEFAULT ''`, `has_database boolean NOT NULL DEFAULT false`.
- Bảng mới `platform.app_catalog_screenshots(app_id, position, caption, content_type, bytes)`, khoá chính `(app_id, position)`, khoá ngoại tới `app_catalog(id)` xoá theo. `content_type` chỉ là `image/png`, `image/webp` hoặc `image/jpeg`.
- `platform.app_requests` thêm `phase text` và `requested_by_name text`.

`phase` là bước worker đang làm của một yêu cầu `RUNNING`: `prepare`, `build` hoặc `register`; rỗng khi chưa bắt đầu hoặc khi app đã có sẵn trên máy chủ. Yêu cầu `FAILED` giữ nguyên `phase` của bước hỏng.

## 5. CLI và worker

- `catalog-sync` ghi thêm `store`, `requires_core`, `has_database` và thay toàn bộ ảnh của app trong một transaction.
- `./dxos validate` kiểm thêm các tệp ảnh của khối `store`.
- Lệnh mới `worker-progress <job> <phase>`: chỉ nhận ba giá trị trên và chỉ sửa yêu cầu đang `RUNNING`.
- Hàm `install()` của `./dxos` báo bước trước `cli prepare` (`prepare`), trước `up --build --wait` (`build`) và trước `cli commit` (`register`). Việc báo chỉ xảy ra khi worker đặt biến `DXOS_JOB`; `./dxos install` gõ tay không đổi hành vi, và báo bước hỏng không bao giờ làm hỏng lần cài.

## 6. Web

### 6.1. Trang kho `/manager/app-store`

- Ô tìm kiếm lọc theo tên và mô tả, không phân biệt dấu và hoa thường.
- Hàng nút danh mục (chỉ hiện danh mục đang có app) và ba nút trạng thái: Tất cả, Đã cài, Chưa cài.
- Mỗi thẻ có biểu tượng, tên, mô tả ngắn, danh mục, trạng thái; cả thẻ dẫn tới trang chi tiết; nút Cài, Gỡ, Thử lại vẫn bấm được ngay trên thẻ.
- Tab thứ hai "Lịch sử": 50 yêu cầu gần nhất của HTX: thời điểm, app, Cài hoặc Gỡ, người yêu cầu, kết quả.
- Trạng thái rỗng riêng cho "kho chưa có app" và "không có app khớp bộ lọc".

### 6.2. Trang chi tiết `/manager/app-store/<id>`

Từ trên xuống:

1. **Đầu trang:** biểu tượng, tên, phiên bản, nhà phát hành, giấy phép, danh mục, trạng thái và nút hành động. Khi đã cài: nút **Mở ứng dụng** dẫn tới mục menu đầu tiên của app dành cho trưởng HTX; app không có trang cho trưởng HTX thì ghi "Ứng dụng này dành cho …".
2. **Tiến trình** (chỉ khi có yêu cầu đang mở hoặc vừa hỏng): các bước Đã gửi yêu cầu → Chuẩn bị → Dựng và khởi động → Đăng ký. Yêu cầu còn `PENDING`: "Đang chờ trình cài đặt". App đã có trên máy chủ: chỉ một dòng "Đang bật cho HTX…". Hỏng: bước hỏng được đánh dấu, kèm lý do và hướng xử lý theo bước.
3. **Ảnh màn hình:** dải cuộn ngang có chú thích; không có ảnh thì không hiện mục này.
4. **Giới thiệu:** `about` theo từng đoạn.
5. **Khi cài, ứng dụng sẽ:** danh sách dựng từ manifest, xem mục 6.3.
6. **Dữ liệu:** `data`, `personal_data`, `core_reads`, kèm dòng "Theo khai báo của nhà phát hành; gỡ ứng dụng vẫn giữ dữ liệu".
7. **Thông tin:** phiên bản, giấy phép, nhà phát hành, yêu cầu phiên bản lõi; khi đã cài và app có trang công khai: địa chỉ `/apps/<id>/public/<mã HTX>` kèm nút chép.
8. **Lịch sử của app này:** 20 yêu cầu gần nhất của HTX cho app.

Trang tự hỏi lại mỗi 3 giây khi có yêu cầu đang mở và làm mới menu khi xong, như trang kho.

### 6.3. "Khi cài, ứng dụng sẽ"

Một hàm thuần dựng danh sách từ dữ liệu danh mục, theo thứ tự:

1. Mỗi mục menu: "Thêm mục "<nhãn>" cho <các vai>".
2. Có trang công khai: "Mở trang công khai tại /apps/<id>/public/<mã HTX>, ai có địa chỉ cũng xem được".
3. Có cơ sở dữ liệu: "Tạo kho dữ liệu riêng cho ứng dụng; dữ liệu của mỗi HTX tách theo mã HTX".
4. Mỗi mục `core_reads`: "Đọc <mục> bằng quyền của người đang dùng".
5. App chưa có trên máy chủ: "Lần cài đầu trên máy chủ phải dựng ứng dụng, mất vài phút"; đã có: "Ứng dụng đã có trên máy chủ nên được bật ngay".

### 6.4. API

Chỉ vai `manager`; HTX lấy từ `requireTenant()`.

- `GET /api/app-store`: như cũ, mỗi app thêm `category`, `icon`, `installedOnServer`, `phase`, `openHref`.
- `GET /api/app-store/apps/<id>`: chi tiết một app, gồm danh sách xem trước, ảnh (`position`, `caption`, `url`) và lịch sử của app. App không có trong kho: 404.
- `GET /api/app-store/apps/<id>/screenshots/<position>`: byte của ảnh với `content-type` đã lưu, `x-content-type-options: nosniff`, `cache-control: private, max-age=300`. Không có: 404.
- `GET /api/app-store/history`: 50 yêu cầu gần nhất của HTX.
- `POST /api/app-store/requests`: như cũ; ghi thêm tên người yêu cầu lấy từ phiên đăng nhập (tối đa 120 ký tự).

### 6.5. Giao diện

Theo `DESIGN.md`: chỉ dùng token, sáng và tối nhất quán, không tràn ngang ở 390 px, có trạng thái rỗng, đang tải và lỗi, dùng được bằng bàn phím (thẻ là liên kết, bộ lọc là nút có `aria-pressed`, tiến trình có `aria-current`). Thành phần mới (dải ảnh, tiến trình theo bước, nút lọc) được ghi vào `DESIGN.md` cùng commit.

## 7. Bảo mật

1. Chữ từ manifest (`about`, chú thích, `data`…) chỉ hiển thị dạng chữ thuần; không dựng HTML hay Markdown từ nó.
2. Biểu tượng là tên trong danh sách cho phép; app không đưa được SVG hay hình tuỳ ý vào giao diện của lõi.
3. Ảnh chỉ nhận ba loại theo byte đầu, giới hạn cỡ và số lượng; phục vụ kèm `nosniff`; không nhận SVG.
4. Đường dẫn ảnh không ra ngoài thư mục app; `catalog-sync` chỉ đọc tệp trong `miniapps/<id>/`.
5. `worker-progress` chỉ nhận mã yêu cầu dạng UUID và ba tên bước.
6. Lịch sử chỉ gồm yêu cầu của HTX người gọi; tên người yêu cầu lấy từ phiên, không lấy từ thân request.

## 8. Nội dung cho năm app

`leaf-purchase` (production, `scale`), `tea-shop` (sales, `shopping-bag`), `farm-supply` (members, `package`), `tea-tour` (tourism, `map-pinned`), `hello` (sample, `sparkles`) có khối `store` đầy đủ. Ba app nghiệp vụ có hai ảnh mỗi app, `tea-tour` một ảnh, chụp từ app thật ở 1280×800, giao diện sáng, lưu trong `miniapps/<id>/store/` và không đưa vào image của app.

## 9. Kiểm thử

- **CLI (pytest):** schema nhận và từ chối từng khoá của `store`; đồng bộ ghi đúng cột và ảnh; ảnh sai loại, quá cỡ, ra ngoài thư mục bị bỏ qua khi đồng bộ và bị báo lỗi khi `validate`; `worker-progress` chỉ sửa yêu cầu `RUNNING` và từ chối tên bước lạ.
- **Web (jest):** hàm xem trước; trạng thái và `openHref`; SQL của repository; các route (401, 403, 404, HTX từ phiên, `content-type` của ảnh); bộ lọc, tìm kiếm không dấu, tiến trình, trạng thái rỗng.
- **Tích hợp (`make apps-smoke`):** đồng bộ đưa khối `store` và ảnh vào kho; trong một lần cài qua worker quan sát được ít nhất một `phase` và kết thúc `DONE`; lần cài hỏng giữ `phase` của bước hỏng; `./dxos install` gõ tay không ghi `phase`.
- **Trình duyệt:** trưởng HTX tìm app, mở trang chi tiết, đọc phần xem trước và ảnh, bấm Cài, thấy tiến trình, bấm Mở ứng dụng, thấy dòng lịch sử; ảnh màn hình của trang kho và trang chi tiết ở 1280 và 390 px, sáng và tối.
- **Không thoái lui:** mọi kiểm thử của `v1.9.0` vẫn qua; app không có khối `store` vẫn cài, gỡ và hiển thị được.

## 10. Tổ chức công việc

| Việc | Nội dung | Cách làm |
|---|---|---|
| 0 | Phiên bản `1.10.0`, schema của khối `store`, SQL | Một phiên riêng, làm trước |
| P | CLI: đồng bộ, kiểm ảnh, `worker-progress`; `./dxos` báo bước | Song song, worktree riêng |
| W | Web: kiểu dữ liệu, repository, API, hai trang, `DESIGN.md` | Song song, worktree riêng |
| C | Khối `store` (phần chữ) của năm app | Song song, worktree riêng |
| I | Chụp ảnh màn hình, smoke, trình duyệt, CI, tài liệu, hai vòng kiểm | Một phiên riêng, sau khi gộp P, W, C |

Phiên chính viết spec và kế hoạch, giao việc cho các phiên Sonnet và tự review.

## Ghi chú sau triển khai

Code khớp thiết kế; các quyết định và chỗ khác bản thiết kế:

- **T1** `06-app-store.sql` được mở rộng tại chỗ thay vì thêm tệp init mới: tệp mới cần một mount mới trong compose và sẽ tạo lại `postgres` một lần khi nâng cấp. Câu lệnh `set_config('dxos.store_first_run', …)` vẫn đứng đầu sau schema và dòng chèn `'*'` vẫn đứng cuối.
- **T2** Ba bước (`prepare`, `build`, `register`); dựng và khởi động vẫn là một lệnh `up --build --wait`, nên trang chỉ có một bước "Dựng và khởi động". Tách đôi sẽ đổi đường cài dùng chung.
- **T3** Ảnh màn hình lưu dạng `bytea` trong PostgreSQL do CLI đồng bộ: container web không đọc được `miniapps/`, và SeaweedFS thêm một bộ phận chuyển động cho tối đa 4 × 400 KB mỗi app.
- **T4** Tên người yêu cầu được chép vào `app_requests` lúc tạo yêu cầu (không có bảng nào ánh xạ id Keycloak sang tên cho trưởng HTX); người đổi tên sau đó vẫn thấy tên cũ trong lịch sử.
- **T5** Phiên bản app không đổi khi chỉ thêm khối `store`; `requires.core` thành `>=1.10.0`. Chưa có luồng cập nhật nên tăng phiên bản chỉ tạo ra chênh lệch không ai xử lý được.
- Ảnh chụp bằng công cụ `apps/web/tests/e2e/tools/store-screenshots.spec.ts` (cờ `E2E_STORE_SHOTS=1`): iframe của app được phóng ra toàn cửa sổ 1280×800 rồi chụp, nên mỗi ảnh chỉ có phần trang của app. Bảy ảnh, 48–81 KB mỗi ảnh.
- Trang chi tiết chưa có tiến trình khi worker chưa báo bước: hiện dòng "Đang chờ trình cài đặt" (hoặc "Đang bật cho HTX…" nếu app đã có trên máy chủ) cho tới khi có `phase`. Với image đã dựng sẵn, cả lần cài có thể chỉ vài giây, nên câu chuyện trình duyệt chấp nhận cả dòng chờ lẫn danh sách bước.
- Smoke kiểm `phase` bằng cách hỏi lặp trong lúc worker cài `tea-shop`; vì cache image ấm có thể xong giữa hai lần hỏi, smoke cũng đòi yêu cầu đã xong giữ `phase = register`. Bước kiểm "nâng cấp từ stack chưa có kho" phải xoá cả bảng `app_catalog_screenshots` (khoá ngoại tới `app_catalog`).
- Giới hạn đã biết: dữ liệu app khai báo không được kiểm chứng; chưa có luồng cập nhật app; danh sách trên trang chi tiết dùng kiểu không dấu đầu dòng.

Kết quả đo (stack `dxos-clean` dựng mới từ `down -v`, `platform-up`, seed, `platform-smoke`, mọi spec trình duyệt theo thứ tự CI, `apps-smoke`, gỡ và xoá mọi app, `down -v`). Vòng đầu có một lần hỏng của câu chuyện tea-tour (danh sách người dẫn tour không có hộ `hh_tc_1`, quá 120 giây; app tea-tour không bị đổi trên nhánh này), không lặp lại ở hai vòng sau; hai vòng sạch liên tiếp (vòng 2 và 3) cho cùng kết quả:

| Hạng mục | Vòng 2 | Vòng 3 |
| --- | --- | --- |
| `make platform-smoke` | 124 PASS (129 giây) | 124 PASS (131 giây) |
| core-tenant / A3 / tour / tour đã gỡ | 5 / 1 / 1 / 1 qua | 5 / 1 / 1 / 1 qua |
| Ảnh màn hình ưu tiên (gồm kho, lịch sử, chi tiết) | 64 qua | 64 qua |
| Câu chuyện Kho ứng dụng | 1 qua (58 giây) | 1 qua (56 giây) |
| Câu chuyện ba app / ảnh màn hình app và kho | 2 / 40 qua | 2 / 40 qua |
| `make apps-smoke` | 224 PASS (662 giây); trước đó 215 | 224 PASS (680 giây) |
| Sau khi chạy | không còn container, volume hay mạng của `dxos-clean` | giống vòng 2 |

`make build` xong; `make test` 1624 qua (3 bỏ qua, 138 suite); `make lint` và `actionlint` sạch; `npx tsc --noEmit` sạch; pytest: CLI 133, `leaf-purchase` 26, `tea-shop` 34, `farm-supply` 16, `hello` 7 (unittest); `./dxos validate` hợp lệ cho cả năm app.
