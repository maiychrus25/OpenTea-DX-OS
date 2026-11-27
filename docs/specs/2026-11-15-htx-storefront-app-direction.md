<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Định hướng — Gian hàng HTX: một app cho tin tức, tour, sản phẩm, đơn hàng, thanh toán và chatbot

> **Trạng thái:** Tài liệu định hướng lịch sử (2026-11-15); phần app di động riêng (`hub-mobile`) được tạm đóng băng và thương mại hóa gắn tồn kho Lô được hợp nhất theo [product-roadmap.md](../product-roadmap.md) và [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md) (2026-11-28). Xem "Ghi chú định hướng tiếp theo" ở cuối.
> **Nguồn:** các quyết định của chủ dự án ngày 2026-11-15 (§2). Những gì ghi là "đề xuất" là ý của người viết tài liệu này, người triển khai được đổi nếu có lý do và ghi lại trong đặc tả.
> **Thay thế cho:** hướng "tea-tour 1.0 là một app đặt tour riêng" (đã dừng ngày 2026-11-15). Mã đã viết cho hướng đó được giữ lại để dùng lại (§7).

## 1. Sản phẩm cần có

Một app duy nhất, nơi mỗi HTX có một gian riêng:

| Việc | Ai làm | Ở đâu |
| --- | --- | --- |
| Đăng tin: bài viết và video ngắn (reels) | Trưởng HTX | Web DX-OS |
| Tạo tour, mở ngày khởi hành, đăng bán tour | Trưởng HTX | Web DX-OS |
| Đăng bán sản phẩm | Trưởng HTX | Web DX-OS |
| Xem tin, xem tour, xem sản phẩm | Khách | App Android (chính), trang web của gian |
| Đặt tour, mua sản phẩm, thanh toán | Khách | App Android (chính), trang web của gian |
| Theo dõi đơn hàng và lượt đặt tour | Khách | App Android (chính), trang web của gian |
| Hỏi chatbot về tour, sản phẩm, chính sách, đơn của mình | Khách | App Android (chính), trang web của gian |
| Xử lý đơn, lượt đặt, ghi nhận tiền | Trưởng HTX | Web DX-OS |

## 2. Quyết định của chủ dự án (không đổi nếu chưa hỏi lại)

1. **Một app**, không chia thành nhiều app nhỏ cho từng việc.
2. **Mỗi HTX một gian.** Bảng tin, tour, sản phẩm, giỏ hàng và thanh toán đều thuộc một HTX; tiền chuyển thẳng vào tài khoản của HTX đó. Không có chợ chung nhiều HTX.
3. **Android là chính** cho khách: reels vuốt dọc, giỏ hàng, theo dõi đơn, chat. Trưởng HTX làm việc trên web DX-OS. Trang web của gian vẫn xem và mua được, nhưng video phải bấm mới phát.
4. **Khách không cần tài khoản.** Khách tra đơn và lượt đặt bằng mã; app Android tự lưu đơn và vé trong máy. Hệ quả: không có bình luận, thả tim hay lịch sử trên nhiều máy.
5. **Thanh toán bằng chuyển khoản VietQR**, trưởng HTX xác nhận tiền đã về. Không dùng cổng thanh toán.
6. **Mini-app không chạy JavaScript** (quyết định ngày 2026-11-13, vẫn giữ): CSP và sandbox của `/apps/` không đổi.

## 3. Hiện có gì

| Phần | Trên `main` | Ghi chú |
| --- | --- | --- |
| Bài viết, video | Chưa có | Lõi chỉ có bản tin nội bộ (`Bulletin`) do n8n tạo |
| Tour | `tea-tour` 0.2.0 | Một tour một ngày giờ, không ảnh, không thanh toán. Bản 1.0 làm dở ở §7 |
| Sản phẩm, đơn hàng | `tea-shop` 0.2.0 | Sản phẩm, đơn, tra đơn bằng mã và số điện thoại; không ảnh, trả tiền khi nhận hàng |
| Giới thiệu HTX, điểm tham quan, mùa vụ | PR #35 `tea-experience` | Nội dung này thành một phần của gian (§5.1) |
| Thanh toán trực tuyến | Chưa có | VietQR đã viết trong bản tea-tour 1.0 làm dở |
| Chatbot | Lõi, `apps/web/src/app/api/chatbot` | Chỉ cho `manager` và `officer` đã đăng nhập; khách không gọi được |
| App Android | Chưa có dòng mã nào | Đã có bản thiết kế và phần lõi hỗ trợ (§7) |
| Kho tệp cho mini-app | Chưa có | Mini-app chỉ có schema Postgres; xem §6.3 |

## 4. Khung kiến trúc (đề xuất)

1. **Một mini-app mới** cho cả gian (gợi ý: id `tea-hub`, tên "Gian hàng HTX"; tên do người triển khai và chủ dự án chốt). Lý do: nền tảng không cho app đọc dữ liệu của app khác, trong khi giỏ hàng, thanh toán, theo dõi đơn, chatbot và app Android đều cần cả tour lẫn sản phẩm lẫn tin tức. Một app nghĩa là một schema, một API, một sổ thu.
2. **Không sửa và không gỡ `tea-shop`, `tea-tour` 0.2.0.** Hai app này đã phát hành; app mới có id riêng. Có chuyển dữ liệu từ hai app cũ sang hay không là việc quyết sau (§9).
3. **Ba lớp, như bản tea-tour 1.0 làm dở:** `domain/` (quy tắc thuần, không I/O), `store/` (mọi thay đổi trạng thái của đơn và lượt đặt nằm ở một module, mỗi thao tác một transaction), `routes/` (trang HTML và API JSON cùng gọi một lớp `store`). Quy tắc nghiệp vụ không viết hai lần.
4. **Hai mặt giao tiếp của cùng một app:** trang HTML dựng phía máy chủ (quản trị trong khung DX-OS, trang gian cho khách) và API JSON dưới `/public/<htx>/api/v1` cho app Android.
5. **Mọi bảng có `htx_code`**; trang công khai lấy HTX từ địa chỉ, trang quản trị lấy từ token. Khoá ngoại gồm cả `htx_code`.
6. **Khách được nhận ra bằng mã cùng một khoá truy cập ngẫu nhiên**, không để số điện thoại trong địa chỉ trang (cách làm ở đặc tả tea-tour 1.0, §5 quy tắc 2).

## 5. Các phân hệ và yêu cầu tối thiểu

### 5.1 Tin tức

- **Bài viết:** tiêu đề, ảnh bìa, nội dung (văn bản chia đoạn, ảnh chèn giữa; không nhận HTML của người dùng), trạng thái nháp, đã đăng, đã ẩn, ghim lên đầu, gắn tour hoặc sản phẩm liên quan để khách bấm mua ngay.
- **Video ngắn:** tệp MP4, có ảnh bìa và chú thích, gắn được tour hoặc sản phẩm. Giới hạn đề xuất cho bản đầu: tối đa 60 giây, 10 MB, không chuyển mã trên máy chủ (container của app chỉ có 256 MB bộ nhớ).
- **Bảng tin của gian:** mới nhất trước, bài ghim ở trên; app Android hiện video dạng vuốt dọc.
- **Giới thiệu HTX, điểm tham quan, lịch mùa vụ** của `tea-experience` là nội dung tĩnh của gian, đặt cùng phân hệ này.
- Không có bình luận, thả tim (khách không có tài khoản). Đếm lượt xem không định danh là tuỳ chọn.

### 5.2 Tour

Theo `docs/specs/2026-11-15-tea-tour-system-design.md` (trên nhánh `feat/tea-tour-pro`): tour có ảnh và lịch trình, nhiều ngày khởi hành, giá người lớn và trẻ em, giữ chỗ có hạn, đặt cọc, vé có mã QR, điểm danh, đánh giá sau chuyến, trang người dẫn. Phần lớn đã có mã (§7).

### 5.3 Sản phẩm và đơn hàng

- **Sản phẩm:** ảnh, mô tả, quy cách, giá, tồn kho, danh mục, mã lô dẫn tới trang truy xuất nguồn gốc của lõi (đã có ở `tea-shop`), đang bán hay ngừng.
- **Giỏ hàng:** trong app Android, giỏ nằm trong máy. Trên web không có cookie, nên dùng một form nhiều dòng như `tea-shop` hiện nay.
- **Đơn hàng:** người nhận, số điện thoại, địa chỉ, ghi chú; trạng thái chờ xác nhận, đã xác nhận, đang giao, hoàn tất, đã huỷ; trừ tồn kho trong cùng transaction với việc tạo đơn, huỷ thì trả lại; gửi lại form không tạo đơn thứ hai.
- **Phí giao hàng:** quy tắc do HTX khai trong cài đặt (§9 còn phải chốt).

### 5.4 Thanh toán

- Một cách thanh toán cho cả đơn hàng và lượt đặt tour: mã VietQR có sẵn số tiền và nội dung chuyển khoản, khách bấm "Tôi đã chuyển khoản", trưởng HTX ghi khoản thu. Đơn hàng được thêm lựa chọn trả tiền khi nhận hàng.
- Một sổ thu chỉ thêm, không sửa, không xoá; hoàn tiền là khoản âm; mỗi khoản ghi người ghi nhận.
- Mã dựng VietQR, bảng 21 ngân hàng (đã đối chiếu với danh sách công khai của VietQR ngày 2026-11-15) và vectơ kiểm thử có sẵn ở `miniapps/tea-tour/tea_tour/domain/vietqr.py` trên nhánh `feat/tea-tour-pro`. **Chưa ai quét thử mã bằng app ngân hàng thật.**

### 5.5 Theo dõi đơn

- Trang tra cứu trên web (mã cùng số điện thoại, rồi chuyển sang địa chỉ có khoá truy cập); dòng thời gian trạng thái; lịch sử thay đổi của đơn cho trưởng HTX.
- App Android lưu đơn và vé trong máy, mở được vé khi mất mạng, tải lại khi có mạng.

### 5.6 Chatbot

- Trả lời khách về tour, sản phẩm, chính sách của HTX, và về đơn của chính khách (khi khách đưa mã và khoá). Câu trả lời chỉ dựa trên dữ liệu của gian đó; không trả lời được thì đưa đường dây nóng.
- Không lưu nội dung chat gắn với danh tính; giới hạn số câu hỏi theo IP.
- Phần này phụ thuộc §6.4. Đề xuất làm hai bước: bước một trả lời bằng tìm kiếm trong hỏi đáp, tour và sản phẩm của gian (không cần mô hình ngôn ngữ); bước hai dùng mô hình của lõi khi mini-app có đường gọi.

### 5.7 Quản trị (trong khung DX-OS, vai `manager`)

Các tab đề xuất: Tổng quan, Tin tức, Tour, Lịch khởi hành, Sản phẩm, Đơn hàng, Lượt đặt tour, Thu tiền, Khách, Hỏi đáp cho chatbot, Báo cáo, Cài đặt. Thanh tab phải dùng được ở 390 px. Người dẫn tour (vai `farmer`) giữ trang lịch dẫn và điểm danh.

### 5.8 App Android

Theo `docs/specs/2026-11-15-tour-android-design.md` (nhánh `feat/tour-android`), mở rộng thêm bảng tin, cửa hàng, giỏ hàng và chat: Kotlin, Jetpack Compose, không dùng dịch vụ Google Play, mọi thư viện có giấy phép OSI, dựng được bằng một lệnh, APK đính kèm bản phát hành. Phần cho người của HTX đăng nhập và quét vé đã được chủ dự án chọn cho app tour ngày 2026-11-15; cần xác nhận lại nó còn trong phạm vi hay không (§9).

## 6. Việc phải làm ở nền tảng (PR nhỏ, tách riêng, dùng chung cho mọi mini-app)

1. **Giới hạn truy cập công khai tách đọc và ghi.** Trên `main`, mọi yêu cầu công khai dùng chung mức 10 lần một phút cho mỗi IP, tính cả tệp CSS và ảnh; một trang có stylesheet riêng (kể cả `tea-experience`) chạm trần sau vài lượt xem. Đã làm xong và đã kiểm: commit `55c67c22` trên `feat/tea-tour-pro` (đọc 300, ghi 30, giữ `cache-control` cho trang công khai, chặn thân yêu cầu trên 10 MiB). Nên tách thành PR riêng và gộp trước.
2. **Phát video qua proxy.** `forward-to-app.ts` đặt hết giờ 10 giây cho cả yêu cầu và không chuyển header `Range`. Cần kiểm bằng thử nghiệm xem việc tải một tệp lâu hơn 10 giây có bị cắt không, rồi sửa cho đường dẫn công khai (hết giờ chỉ tính tới khi có header phản hồi; chuyển `Range` và giữ `Content-Range`, `Accept-Ranges`). **Người viết tài liệu này chưa thử điểm này.**
3. **Kho tệp cho mini-app.** Ảnh đã đo được là lưu trong Postgres ổn (mỗi ảnh mã hoá lại còn khoảng 300 KB). Video thì không nên. Lõi đã có SeaweedFS (giao diện S3); cần một năng lực mới của nền tảng để `./dxos install` cấp cho app một vùng lưu và thông tin truy cập, như đang cấp schema. Việc này cần một ADR và là điều kiện của video.
4. **Đường gọi mô hình ngôn ngữ cho mini-app.** Cổng chỉ cho gọi `/api/ai/llm` khi có token của người dùng; khách không có token và container của app không ra được ngoài. Cần thiết kế một cách để app gọi mô hình thay mặt khách mà không mở cổng cho mọi người (kèm giới hạn theo app). Điều kiện của bước hai ở §5.6.
5. **Hỗ trợ app di động ở lõi** (đã làm trên `feat/tour-android`, commit `c7eddfbe` và `76f62cf3`): proxy nhận `Authorization: Bearer` trên đường dẫn có bảo vệ, `GET /api/apps/<id>/tenants` (danh bạ HTX bật app), `GET /api/mobile/config`, client Keycloak `dxos-mobile` (PKCE). Chỉ cần khi app Android có phần đăng nhập. Lệnh `make mobile-client` chưa được chạy với Keycloak thật.

## 7. Mã có sẵn để dùng lại

Các nhánh dưới đây đã được đẩy lên GitHub, chưa gộp vào `main`. Mã viết cho mini-app `tea-tour` 1.0; dùng lại nghĩa là chuyển các module vào app mới hoặc lấy `tea-tour` làm điểm xuất phát, tuỳ người triển khai.

| Nhánh | Nội dung | Tình trạng |
| --- | --- | --- |
| `feat/tea-tour-pro` | Sửa proxy (§6.1); nền của tea-tour 1.0: migration 002 kèm chuyển dữ liệu 0.2.0, `domain/` (tiền, chính sách, VietQR, bỏ dấu, 4 mẫu tour), `store/core.py` (đặt chỗ, giữ chỗ, xác nhận, khoản thu, huỷ, đổi chuyến, điểm danh, đánh giá), xử lý ảnh bằng Pillow, mã QR, khung trang, máy chủ xem thử có dữ liệu mẫu; trang người dẫn; quầy bán hàng (tổng quan, lượt đặt, sổ thu, khách, đánh giá, báo cáo) | Đã được xem lại từng phần; 346 kiểm thử qua |
| `feat/tea-tour-pro-site` | Trang web cho khách: trang chủ, danh mục, chi tiết tour, đặt chỗ hai bước, lượt đặt có VietQR, vé, đánh giá, yêu cầu tour riêng; `DESIGN.md` của trang khách | **Chưa ai xem lại.** Tác giả báo 95 kiểm thử của phần này qua |
| `feat/tea-tour-pro-catalog` | Quản trị tour, ảnh, lịch khởi hành (kể cả tạo hàng loạt và lịch tháng), cài đặt | **Chưa ai xem lại, dừng giữa chừng:** commit cuối là một điểm lưu khi đang sửa hàm đóng và mở chuyến |
| `feat/tour-android` | Phần lõi cho app di động (§6.5), bản thiết kế và kế hoạch app Android | Đã được xem lại; chưa chạy với Keycloak thật |

Gộp thử `feat/tea-tour-pro-site` và `feat/tea-tour-pro-catalog` vào `feat/tea-tour-pro` không xung đột và qua 588 kiểm thử (`python -m pytest tests -q -W error` trong `miniapps/tea-tour`, ngày 2026-11-15).

Chưa làm cho bất kỳ nhánh nào: cài app trong container thật, `platform/tests/smoke-apps.sh`, các câu chuyện Playwright, ảnh cho Kho ứng dụng, README, `CHANGELOG.md`, `DEPENDENCIES.md` (thư viện mới: Pillow, segno; phông Be Vietnam Pro; các đường vẽ biểu tượng của Lucide), hai vòng kiểm trên stack sạch.

Tài liệu đi kèm trên các nhánh đó: `docs/specs/2026-11-15-tea-tour-system-design.md`, `docs/plans/2026-11-15-tea-tour-system.md`, `docs/specs/2026-11-15-tour-android-design.md`, `docs/plans/2026-11-15-tour-android.md`.

## 8. Các mốc đề xuất

Mỗi mốc là một bản chạy được, có đặc tả riêng, có kiểm thử, và không làm hỏng app đã phát hành.

| Mốc | Nội dung | Xong khi |
| --- | --- | --- |
| M0 | Nền tảng: §6.1 gộp vào `main`; kiểm và sửa §6.2 | Trang công khai có CSS và ảnh không còn gặp 429 khi xem bình thường |
| M1 | App mới với tour và sản phẩm: quản trị, trang gian cho khách, đơn hàng, lượt đặt, VietQR, tra cứu | Trên stack sạch, khách đặt một tour và mua một sản phẩm, trưởng HTX ghi khoản thu, khách thấy trạng thái đổi |
| M2 | API JSON cho mọi thứ của M1 | Mỗi đường dẫn có kiểm thử thành công và từ chối; có bộ mẫu JSON cho app Android |
| M3 | App Android cho khách: tour, cửa hàng, giỏ hàng, thanh toán, đơn và vé lưu trong máy | APK dựng trong CI; chạy trọn một lượt đặt và một đơn hàng trên máy ảo |
| M4 | Tin tức: bài viết có ảnh, trên web và trong app | Trưởng HTX đăng bài gắn một sản phẩm; khách bấm từ bài sang mua |
| M5 | Video ngắn: §6.3, tải lên, phát trên web, vuốt dọc trong app | Video 60 giây phát được trên điện thoại qua mạng di động |
| M6 | Chatbot bước một, rồi §6.4 và bước hai | Chatbot trả lời đúng giá và ngày khởi hành của gian, không trả lời về HTX khác |

Thứ tự này đặt bán hàng và app Android trước tin tức và chatbot, vì hai mốc sau phụ thuộc vào việc nền tảng còn phải thiết kế (§6.3, §6.4). Chủ dự án có thể đổi thứ tự.

## 9. Điểm còn mở, cần chủ dự án chốt

1. Tên và id của app mới; tên app Android.
2. `tea-shop` và `tea-tour` 0.2.0: giữ song song, hay có lệnh chuyển dữ liệu sang app mới rồi ngừng phát triển.
3. PR #35 `tea-experience`: gộp như một app riêng trước, hay đưa nội dung của nó vào app mới ngay.
4. Phí giao hàng: cố định, theo khu vực, hay miễn phí từ một mức tiền.
5. Phần đăng nhập và quét vé cho người của HTX trong app Android còn trong phạm vi không.
6. Chatbot dùng mô hình nào của lõi và được phép trả lời những gì ngoài dữ liệu của gian.

## 10. Quy tắc làm việc trong repo

- Theo `AGENTS.md`: tên trong mã bằng tiếng Anh, chữ hiển thị bằng tiếng Việt, commit theo Conventional Commits bằng tiếng Anh, header SPDX trên tệp mới, không đưa bí mật vào repo.
- Thư viện mới phải có giấy phép OSI, ghim phiên bản và khai trong `DEPENDENCIES.md`; thay đổi ghi vào `CHANGELOG.md` mục `[Unreleased]` (tiêu chí PoF của đề thi).
- Mọi PR qua CI; gộp vào `main` do chủ dự án quyết định.
- Mốc thời gian của cuộc thi theo kế hoạch đang dùng: ngừng thêm tính năng ngày 02/12/2026, nộp bài ngày 05/12/2026.

## Ghi chú định hướng tiếp theo (2026-11-28)

Theo [product-roadmap.md](../product-roadmap.md) và [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md):
- Không phát triển thêm ứng dụng Flutter/Android thương mại riêng (`apps/hub-mobile`) hay tính năng video ngắn `Reels`.
- Mảng bán lẻ/bán sỉ chè của HTX ở GĐ3 nối trực tiếp vào tồn kho của `Lot` đã xuất QR (bắt buộc lưu `lot_id` trên từng dòng đơn hàng để phục vụ truy hồi); mảng du lịch (`tea-tour`) giữ ở vai trò Mini-app ngoại vi Tầng 3.
