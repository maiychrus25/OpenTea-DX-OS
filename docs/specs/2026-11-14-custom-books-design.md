<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Sổ tự tạo: trưởng HTX tự tạo ứng dụng ghi chép, không cần lập trình

> **Trạng thái:** Đã triển khai trong `v1.12.0` (2026-11-14), chờ merge và gắn tag; xem "Ghi chú sau triển khai" ở cuối tài liệu. Bản thiết kế (2026-11-14). Chủ dự án đã chốt hướng (người tạo app là trưởng HTX, không cần lập trình; có mẫu sẵn) và cho phép triển khai mà không chờ duyệt thêm; bước merge vào `main` và gắn tag phát hành vẫn hỏi lại.
> **Phạm vi:** milestone `v1.12.0`, đợt M2 của lộ trình trong `docs/specs/2026-11-13-app-kit-design.md`. Tiếp nối `v1.11.0`.
> **Căn cứ:** Mô hình mong muốn là "lõi ở dưới, nhiều mini-app ở trên, người dùng tự tạo được mini-app phục vụ mình". Đến nay mọi mini-app đều phải có người viết mã. HTX nào cũng có những sổ ghi chép riêng (chấm công hái chè, phun thuốc, thu chi, biên bản họp) mà không app viết sẵn nào phủ hết.

## 1. Mục tiêu

1. Trưởng HTX tạo được một ứng dụng ghi chép ("sổ") trong vài phút, ngay trên web, không viết mã: chọn một mẫu hoặc bắt đầu từ trang trắng, đặt tên các ô cần ghi, chọn ai được ghi và ai được xem.
2. Sổ vừa tạo dùng được ngay như một mini-app: có mục riêng trong menu của đúng vai, có trang nhập, danh sách tìm và lọc được, trang tổng hợp, in và xuất CSV, tất cả trên bộ giao diện dùng chung.
3. Sổ có thể yêu cầu trưởng HTX duyệt từng dòng trước khi dòng đó được tính.
4. Lõi không biết riêng app nào: việc "một mini-app sinh ra nhiều ứng dụng con cho từng HTX" là một hợp đồng chung trong manifest.

## 2. Ngoài phạm vi

- Ô ảnh hoặc tệp đính kèm (mini-app chưa có kho tệp), ô tính theo công thức, liên kết giữa các sổ.
- Phân quyền theo từng người; quy trình duyệt nhiều bước.
- Nhập dữ liệu từ tệp; thông báo đẩy.
- JavaScript trong mini-app: trình thiết kế sổ là các biểu mẫu gửi về máy chủ.

## 3. Khái niệm

- **Sổ** thuộc một HTX: tên, mô tả, biểu tượng, danh sách ô, quyền theo vai, có cần duyệt hay không, trạng thái `DRAFT` (đang soạn), `PUBLISHED` (đang dùng) hoặc `ARCHIVED` (ngừng dùng, giữ dữ liệu).
- **Ô** của sổ: nhãn, kiểu, bắt buộc hay không, có hiện trong danh sách không, có tính vào tổng hợp không. Kiểu: chữ ngắn, chữ dài, số (kèm đơn vị), tiền (đồng), ngày, lựa chọn (2–20 mục), có/không, nông hộ (chọn từ danh sách nông hộ của HTX).
- **Dòng** là một lần ghi vào sổ, kèm người ghi và thời điểm.
- **Quyền theo vai** cho cán bộ và nông dân, mỗi vai một mức: không dùng; chỉ xem mọi dòng; ghi và xem dòng của mình; ghi và xem mọi dòng. Trưởng HTX luôn xem, ghi, sửa và xoá được mọi dòng, và là người duy nhất thiết kế sổ.

Giới hạn: mỗi HTX tối đa 50 sổ; mỗi sổ 1–20 ô, tối đa 6 ô hiện trong danh sách.

## 4. Mini-app `custom-books` ("Sổ tự tạo")

Một mini-app như mọi app khác (FastAPI, Jinja, không script, bộ giao diện dùng chung, schema riêng `app_custom_books`, mọi truy vấn lọc theo `htx_code`), cài và gỡ qua Kho ứng dụng.

### 4.1. Thiết kế sổ (trưởng HTX)

- **Danh sách sổ:** sổ đang soạn, đang dùng, ngừng dùng; nút "Tạo sổ mới".
- **Tạo sổ:** chọn một trong các mẫu ở mục 4.4 hoặc "Sổ trắng". Sổ mới ở trạng thái đang soạn.
- **Trang thiết kế** là một biểu mẫu: tên, mô tả, biểu tượng; bảng các ô (nhãn, kiểu, mục lựa chọn hoặc đơn vị, bắt buộc, hiện trong danh sách, tính tổng, thứ tự, xoá) kèm ba dòng trống để thêm ô; mức quyền của cán bộ và nông dân; ô đánh dấu "Cần trưởng HTX duyệt". Lưu sai thì trang hiện lại với lỗi cạnh ô sai và giữ những gì đã gõ.
- **Xem thử** hiện đúng biểu mẫu nhập mà người dùng sẽ thấy.
- **Phát hành** đưa sổ vào menu của các vai có quyền. **Ngừng dùng** gỡ sổ khỏi menu và giữ dữ liệu; phát hành lại được. **Xoá sổ** chỉ được khi sổ chưa có dòng nào.
- Khi sổ đã có dòng: đổi được nhãn, thứ tự, thêm ô, bỏ ô (dữ liệu của ô bị bỏ vẫn được giữ); không đổi được kiểu của ô đang có.

### 4.2. Dùng sổ (mọi vai có quyền)

- **Danh sách:** các ô được chọn hiện thành cột, kèm người ghi và ngày; tìm theo chữ; lọc theo khoảng ngày, theo từng ô lựa chọn, theo nông hộ, theo tình trạng duyệt; phân trang; xuất CSV; bản in.
- **Ghi dòng mới**, **sửa**, **xoá** (xoá có trang xác nhận). Người ở mức "dòng của mình" chỉ sửa và xoá dòng mình ghi.
- **Tổng hợp:** số dòng; tổng của từng ô số và ô tiền được đánh dấu tính tổng (tháng này và tất cả); biểu đồ theo tháng cho sáu tháng gần nhất; biểu đồ theo mục cho ô lựa chọn đầu tiên.
- **Ngày của dòng** là giá trị ô ngày đầu tiên của sổ; sổ không có ô ngày thì dùng ngày ghi.
- Nông dân ghi vào ô nông hộ chỉ chọn được hộ của chính mình.

### 4.3. Duyệt

Khi sổ bật "Cần trưởng HTX duyệt": dòng mới ở tình trạng chờ duyệt; trưởng HTX duyệt hoặc từ chối (từ chối phải ghi lý do). Người ghi sửa được dòng đang chờ hoặc bị từ chối, và sửa xong thì dòng quay về chờ duyệt; dòng đã duyệt bị khoá với mọi người trừ trưởng HTX. Trang tổng hợp chỉ tính dòng đã duyệt và nêu số dòng đang chờ.

### 4.4. Mẫu có sẵn

Tám mẫu, mỗi mẫu là một bộ ô và quyền đặt sẵn mà trưởng HTX sửa được trước khi phát hành: Chấm công hái chè; Sổ phun thuốc bảo vệ thực vật; Sổ bón phân; Sổ thu chi; Biên bản họp thành viên; Sổ giao nhận vật tư; Theo dõi sâu bệnh; Sổ khách tham quan.

## 5. Hợp đồng "ứng dụng con" trong manifest

- Khoá tuỳ chọn `feed` trong `app.yaml`: một đường dẫn của app (ví dụ `/feed.json`) nằm dưới một route có đăng nhập.
- Lõi gọi đường dẫn đó bằng token của người đang dùng. App trả `{"entries": [{"label", "path", "icon", "description"}]}`: các ứng dụng con mà người đó được mở.
- Lõi kiểm từng mục trước khi dùng: nhãn 1–60 ký tự, mô tả tối đa 200, đường dẫn là đường dẫn trong app không có đoạn nguy hiểm, biểu tượng thuộc danh sách cho phép của kho; tối đa 30 mục; mục sai bị bỏ.
- **Menu:** mỗi mục hợp lệ là một mục menu dẫn tới `/<vai>/apps/<id><đường dẫn>`, đứng sau các mục cố định của app.
- **Kho ứng dụng:** dưới danh sách app có phần "Ứng dụng do HTX tự tạo", liệt kê các mục của những app đã bật kèm liên kết mở, và liên kết "Tạo sổ mới" khi app có khai `feed`.
- Lõi nhớ kết quả 15 giây cho mỗi bộ (app, HTX, vai), chờ tối đa 1,5 giây; lỗi hoặc quá hạn thì menu chỉ có các mục cố định, không báo lỗi.

## 6. Dữ liệu của `custom-books`

- `books(id, htx_code, name, description, icon, fields jsonb, officer_access, farmer_access, approval, status, created_by, created_at, updated_at)`.
- `records(id, htx_code, book_id, data jsonb, entry_date, household_id, status, reject_reason, decided_by_name, decided_at, created_by, created_by_name, created_at, updated_at)`; chỉ mục theo `(htx_code, book_id, entry_date)`.
- Mỗi ô có một khoá ổn định (`f1`, `f2`, …) không bao giờ dùng lại, nên đổi nhãn hay thứ tự không làm lệch dữ liệu.
- Giá trị được kiểm theo kiểu của ô lúc ghi; số và tiền lưu dạng số nên cộng được bằng SQL.

## 7. Bảo mật

1. Chỉ trưởng HTX thiết kế, phát hành, ngừng và xoá sổ; app kiểm vai và mã HTX từ token ở mọi route.
2. Mức quyền của vai được kiểm ở máy chủ cho từng thao tác; người ở mức "dòng của mình" không đọc được dòng của người khác kể cả qua tệp CSV, bản in hay địa chỉ gõ tay.
3. Nhãn, mô tả và giá trị do người dùng gõ chỉ hiển thị dạng chữ; ô trong CSV bắt đầu bằng ký tự công thức được vô hiệu hoá như ở `v1.11.0`.
4. Lõi coi nội dung `feed` là dữ liệu không tin cậy: kiểm theo mục 5, hiển thị dạng chữ, biểu tượng chỉ là tên trong danh sách cho phép.
5. Tên ô không bao giờ đi vào SQL: truy vấn chỉ dùng khoá ô do máy chủ sinh, và mọi giá trị là tham số.
6. Giới hạn R24 giữ nguyên.

## 8. Kiểm thử

- **App (pytest):** kiểm thiết kế (giới hạn số ô, kiểu, lựa chọn, khoá ổn định, không đổi kiểu khi đã có dòng); kiểm giá trị theo từng kiểu; ma trận quyền vai × mức × thao tác; duyệt; lọc, tìm, phân trang; tổng hợp; CSV và bản in theo quyền; tám mẫu đều tạo được sổ hợp lệ; hai HTX không thấy sổ và dòng của nhau.
- **Lõi:** schema của `feed`; kiểm và bỏ mục sai; bộ nhớ đệm và thời hạn chờ; menu và phần "Ứng dụng do HTX tự tạo" của kho.
- **Tích hợp:** cài app; tạo sổ từ mẫu qua HTTP; phát hành; `feed` trả đúng theo vai; ghi dòng; duyệt; CSV.
- **Trình duyệt:** trưởng HTX tạo sổ "Chấm công hái chè" từ mẫu và phát hành; cán bộ và nông dân thấy mục mới trong menu; nông dân ghi một dòng trên điện thoại; trưởng HTX duyệt và xem tổng hợp; ảnh màn hình ở 1280 và 390 px, sáng và tối.
- **Không thoái lui:** mọi kiểm thử của `v1.11.0` vẫn qua.

## 9. Tổ chức công việc

| Việc | Nội dung | Cách làm |
|---|---|---|
| F | Hợp đồng `feed`: schema, CLI, lõi đọc và kiểm, menu, kho; phiên bản `1.12.0` | Một phiên, thư mục chính |
| B1 | App `custom-books`: lưu trữ, thiết kế sổ, mẫu, phát hành, `feed` | Một phiên, worktree riêng, song song với F |
| B2 | App `custom-books`: dùng sổ, duyệt, tổng hợp, CSV, in | Cùng phiên với B1, làm sau B1 |
| I | Smoke, trình duyệt, ảnh cho kho, tài liệu, hai vòng kiểm | Một phiên, sau khi gộp |

Phiên chính viết spec và kế hoạch, giao việc cho các phiên Sonnet và tự review. GitHub Actions đang bị chặn vì hạn mức của tài khoản, nên bằng chứng kiểm thử là các vòng chạy trên máy.

## Ghi chú sau triển khai

Thân tài liệu trên giữ nguyên là bản thiết kế. Những chỗ code khác hoặc bổ sung thêm so với bản thiết kế:

**Các quyết định (rulings) trong lúc triển khai**
- B1: một mini-app dùng chung `custom-books` chứa mọi sổ (định nghĩa và dòng ghi là JSONB), không có một container riêng cho mỗi sổ. Chi phí nếu sai: HTX rất lớn về sau cần chỉ mục riêng cho từng sổ.
- B2: app con đi vào menu qua khoá `feed` chung trong manifest, web gọi bằng token của người dùng, nhớ 15 giây, thời hạn chờ 1,5 giây; web không biết mã app nào, và app không ghi được vào bảng của nền tảng.
- B3: trình thiết kế là biểu mẫu dựng ở máy chủ, không có JavaScript, nằm trong mini-app.
- B4: duyệt một bước bởi trưởng HTX là tuỳ chọn cho từng sổ.
- B5: không có ô ảnh (mini-app chưa có quyền dùng kho đối tượng).
- B6: đường dẫn `feed` là `/feed` (mẫu route của manifest không cho dấu chấm).
- B7: một `feed` hỏng được nhớ 5 giây; nếu không, app hỏng làm mỗi lần dựng trang chờ thêm thời hạn 1,5 giây.

**Khác với thiết kế hoặc bổ sung**
- Dòng do trưởng HTX ghi được duyệt ngay (trưởng HTX là người duyệt); khi trưởng HTX sửa dòng, tình trạng giữ nguyên. Người ghi sửa dòng bị từ chối thì dòng về "chờ duyệt" và xoá lý do.
- Chỉ ghi được khi sổ đã phát hành (409 nếu không); sổ nháp chỉ trưởng HTX thấy.
- Thứ tự mục trong menu là `updated_at` giảm dần (lưu thiết kế cũng làm mới), không có cột `published_at`.
- Tìm chữ cũng tìm cả tên người ghi; khi cần duyệt, các số tổng của danh sách chỉ tính dòng đã duyệt.
- CSV: ô số và ô tiền là số thô (dấu chấm thập phân); ô đã bị bỏ khỏi thiết kế vẫn xuất thành cột phụ đặt tên bằng khoá ô; luôn có cột "Tình trạng". Xuất CSV và bản in tối đa 5000 dòng.
- Ô lựa chọn đã có dữ liệu không được bớt mục (thêm so với thiết kế, để giá trị cũ còn hợp lệ). Các mục viết trên một dòng, cách nhau bằng dấu chấm phẩy.
- Từ chối đi qua một trang riêng `GET|POST /b/<id>/r/<rid>/reject` (lý do 1–200 ký tự). Ô lý do có thuộc tính `required` nên trình duyệt chặn lý do rỗng trước khi gửi; thông báo lỗi của máy chủ chỉ hiện khi gửi trực tiếp.
- Tên nông hộ được lưu cùng dòng khi ghi (`records.household_name`), để người dùng xem mọi dòng thấy tên hộ khác dù Hasura chỉ trả hộ của chính nông dân; chỉ ô nông hộ đầu tiên được lưu tên.
- Khi người dùng đi tiếp bên trong khung của app, địa chỉ của trang bao quanh không đổi (ví dụ sau khi phát hành, trang vẫn ở `/manager/apps/custom-books/books/<id>/design`); mục menu mới có địa chỉ `/<vai trò>/apps/custom-books/b/<id>`.
- Bộ nhớ đệm của `feed` theo (app, HTX, vai trò), không theo người dùng; đủ cho `custom-books` vì danh sách sổ chỉ phụ thuộc vai trò và HTX.

**Quan sát trên stack thật (`dxos-clean`)**
- Phần "Ứng dụng do HTX tự tạo" hiện ngay sau khi cài app, có câu "Chưa có ứng dụng nào. Bấm "Tạo sổ mới" để bắt đầu." và nút mở bảng chọn mẫu trong khung. Sau khi trưởng HTX phát hành, mục mới hiện trong menu của cán bộ và nông dân ở lần tải trang kế tiếp (đo: trong khoảng nhớ 15 giây), vai đặt "Không dùng sổ này" không có mục.
- Khi container của app tắt, `feed` hỏng ngay (không chờ hết 1,5 giây); bốn lần tải trang liên tiếp của trưởng HTX mất 121–210 ms, trang vẫn dựng đủ menu tĩnh.
- Trình thiết kế: cột tên ô ở 1280 px chỉ rộng khoảng 110 px nên tên 30 ký tự bị cắt; đã thêm lớp `form-table` trong `dxos-app.css`, chia bề rộng bảng theo tỷ lệ (cột tên 28%, kiểu 15%, lựa chọn 13%, đơn vị 11%, thứ tự 8%, đệm ô hẹp lại): ô tên rộng khoảng 230 px và bảng không tràn khung. Bản đầu dùng bề rộng tối thiểu cố định (14,5rem cho cột tên); tổng các mức tối thiểu vừa khít khung với phông của macOS nên tràn trên máy Linux của CI, nơi phông rộng hơn và thanh cuộn chiếm 15 px. Tỷ lệ thì không phụ thuộc phông chữ: tên 30 ký tự hiện đủ với phông macOS, khoảng 27 ký tự với phông Linux. Ở 390 px mỗi ô là một thẻ, không tràn trang.

**Số đo trên stack sạch** (`down -v`, `platform-up`, seed, `platform-smoke`, mọi spec trình duyệt theo thứ tự CI, `apps-smoke`, gỡ và xoá mọi app, `down -v`):

| Hạng mục | Kết quả |
| --- | --- |
| `make platform-smoke` | 124 PASS |
| `make apps-smoke` | 322 PASS, 0 FAIL (267 trước đợt này, thêm phần `[custom-books]`; 740 và 681 giây) |
| Trình duyệt | core-tenant 5, câu chuyện A3 1, tour 1, `app-kit` tea-tour 1, ảnh màn hình ưu tiên 72, kiểm tra gỡ 1, Kho ứng dụng 1, ba app 2, `app-kit` ba app và giao diện 4, ảnh màn hình ba app 68, **câu chuyện Sổ tự tạo 1**, **ảnh màn hình Sổ tự tạo 28** (kiểm tra tràn ngang và chữ chồng nhau, 1280 và 390 px, sáng và tối), **kiểm tra khi app tắt 1** |
| `make test` / `make lint` / `npx tsc --noEmit` | 1704 test qua (3 bỏ qua) / `eslint`, `actionlint`, `appkit-sync --check` sạch / sạch |
| pytest | CLI 154, `custom-books` 107, `tea-shop` 62, `tea-tour` 63, `leaf-purchase` 42, `farm-supply` 25, app kit 19 |
| Sau khi chạy | không còn container, volume hay worker của `dxos-clean`; sáu volume `docker_*` còn nguyên |

Hai vòng sạch là vòng 2 và vòng 3. Vòng 1 không sạch: `app-kit` ba app lỗi vì một điều kiện đua trong chính spec (gõ vào khung đang chuyển trang) và `apps-smoke` có một lần "the product is gone after the second enable" ở kiểm tra tea-shop có sẵn (phần `[custom-books]` qua hết; nguyên nhân chưa chứng minh, không lặp lại ở vòng 2 và 3, đã thêm đoạn in trạng thái trang công khai khi kiểm tra này lỗi). Vòng 3 đầu tiên bị dừng vì chỗ chờ đầu tiên của spec là chờ vô nghĩa (ô nhập đã giữ sẵn chữ vừa gõ); đã đổi sang chờ địa chỉ của khung có tham số lọc.
