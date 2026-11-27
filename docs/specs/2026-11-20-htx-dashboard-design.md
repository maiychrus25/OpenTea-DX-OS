<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — Bảng điều hành HTX: mini-app theo dõi tổng thể hợp tác xã

> **Trạng thái:** Đã triển khai `v1.13.0` (2026-11-20); theo [product-roadmap.md](../product-roadmap.md) GĐ3 & [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md) (2026-11-28), lộ trình hợp nhất `/manager/dashboard` và `htx-dashboard` thành 1 Bảng Điều hành Giám đốc duy nhất có đủ số liệu sản xuất – thu mua – chế biến – công nợ. Xem "Ghi chú sau triển khai" và "Ghi chú định hướng tiếp theo" ở cuối.
> **Phạm vi:** đợt 1, mini-app `htx-dashboard` 0.1.0 và một thay đổi nhỏ, dùng chung, ở tầng dữ liệu lõi (§7). Đợt 2 (số liệu của các app khác) chỉ nêu hướng ở §10.
> **Căn cứ:** Trang "Tổng quan" hiện có của trưởng HTX (`/manager/dashboard`) là trang "hôm nay": bốn con số và giá thị trường, không có chuỗi thời gian, không có cảm biến. Đề thi yêu cầu nguyên lý "IT/OT: cảm biến tới bản sao số" và "vòng đời, dòng dõi và chất lượng dữ liệu"; lõi đã thu và lưu số đo cảm biến nhưng chưa có màn hình nào hiện chúng.

## 1. Mục tiêu

1. Trưởng HTX mở một app và thấy tình hình cả HTX trong một trang: quy mô, sản xuất, lô chè, sức khoẻ cây, cảm biến, và những việc cần chú ý.
2. Mỗi thửa chè có một trang "bản sao số": vụ đang trồng, số đo mới nhất và diễn biến theo ngày của từng cảm biến, nhật ký và báo cáo bệnh gần đây.
3. App chỉ đọc. Nó không có database riêng và không sửa dữ liệu nào; mọi con số lấy từ lõi qua cổng API bằng chính token của người đang xem, nên quyền theo HTX do lõi áp.
4. App là một mini-app cài và gỡ bằng `./dxos` hoặc Kho ứng dụng. Lõi không biết riêng app này.

## 2. Ngoài phạm vi (đợt 1)

- Số liệu của mini-app khác (đơn chè, lượt đặt tour, phiếu thu mua, vật tư, sổ tự tạo) và của app quản lý nhân sự: nền tảng chưa có cách để một app đọc số liệu của app khác (§10).
- Cảnh báo theo ngưỡng nông học (đất quá khô, quá lạnh): cần nơi lưu ngưỡng của từng HTX; đợt 1 chỉ cảnh báo trên sự kiện khách quan (§5).
- Tự cập nhật theo thời gian thực, biểu đồ tương tác: trang của mini-app không chạy JavaScript; biểu đồ là SVG do máy chủ vẽ, số mới hiện khi mở hoặc tải lại trang.
- Vai `officer` và `farmer`; gửi thông báo; bản đồ.
- Thay thế trang `/manager/dashboard` của lõi: trang đó giữ nguyên.

## 3. Các cách làm đã cân nhắc

| Cách | Nội dung | Vì sao chọn hoặc không |
| --- | --- | --- |
| **A (chọn)** | Mini-app chỉ đọc, không database, hỏi lõi qua Hasura bằng token của người xem | Đúng yêu cầu "một app"; là ví dụ rõ nhất của tầng 3 dùng dịch vụ tầng 1 (SSO, cổng, API dữ liệu có lọc theo HTX); không thêm dữ liệu phải bảo vệ. Giá phải trả: mỗi lần mở trang là vài truy vấn tới lõi; biểu đồ tĩnh |
| B | Mở rộng trang `/manager/dashboard` trong web lõi (Next.js, có JavaScript) | Biểu đồ mượt hơn và đọc thẳng database, nhưng không phải app cài được, và làm lõi phình thêm |
| C | Mini-app có database riêng, định kỳ chép số liệu lõi về để tính | Trang nhanh hơn, có lịch sử riêng, nhưng thêm một bản sao dữ liệu phải giữ đồng bộ và một tiến trình nền mà mini-app không có |

## 4. Trang

Mọi trang dưới `/apps/htx-dashboard`, vai `manager`, hiện trong khung của DX-OS, dùng bộ giao diện chung (`/dxos-app.css`, `kit.html`) và một stylesheet riêng do app phục vụ cho biểu đồ đường và lưới thửa. Tên app: "Bảng điều hành HTX". Mục menu: "Bảng điều hành".

| Tab | Đường dẫn | Nội dung |
| --- | --- | --- |
| Tổng quan | `/` | Dải chỉ số (§5.1); khối "Cần chú ý" (§5.2); biểu đồ nhật ký theo tuần và lô theo trạng thái; giá chè mới nhất kèm nguồn và giờ cập nhật (cùng quy tắc chọn và cùng nhãn "mô phỏng" như trang `/manager/dashboard` của lõi); liên kết sang trang nghiệp vụ tương ứng của lõi |
| Sản xuất | `/production` | Thửa theo trạng thái; vụ đang canh tác và lịch thu hoạch 30 ngày tới; sản lượng kỳ vọng theo tháng; nhật ký theo tuần và theo loại hoạt động; 10 hộ ghi nhật ký nhiều nhất và các hộ chưa ghi trong kỳ |
| Vùng trồng | `/parcels` | Bảng mọi thửa: mã, hộ, diện tích, cây, trạng thái vụ, số đo mới nhất của từng cảm biến kèm tuổi của số đo, báo cáo bệnh gần nhất. Lọc theo trạng thái, theo "có cảm biến", tìm theo mã thửa hoặc tên hộ; phân trang 25 |
| Thửa | `/parcels/<mã thửa>` | Bản sao số của một thửa: thông tin thửa và hộ; vụ hiện tại; với mỗi cảm biến: số đo mới nhất, nhỏ nhất, lớn nhất và trung bình trong kỳ, biểu đồ đường theo ngày; thời tiết mới nhất của thửa (bảng `weather_cache`) kèm giờ cập nhật; 10 nhật ký và 5 báo cáo bệnh gần nhất; các lô có thửa này |
| Sức khoẻ cây | `/health` | Báo cáo bệnh theo tuần, theo loại bệnh, theo trạng thái xử lý; thửa có nhiều báo cáo nhất. Loại bệnh là chẩn đoán đã được cán bộ xác nhận; báo cáo chưa xác nhận dùng tên do AI dự đoán và được ghi rõ "AI dự đoán" |
| Lô chè | `/lots` | Lô theo trạng thái, lô tạo theo tháng, khối lượng dự kiến theo trạng thái; danh sách lô mới nhất. (Lõi không lưu thời điểm lô sẵn sàng, nên không tính thời gian xử lý lô) |
| Dữ liệu | `/data` | Vòng đời và chất lượng dữ liệu cảm biến: số dòng đang ở kho nóng theo ngày; các lần chuyển sang kho lạnh (ngày, số dòng, dung lượng, mã băm SHA-256, kết quả kiểm chất lượng theo đúng các khoá mà tiến trình lưu trữ của nền tảng ghi vào cột `quality`, trạng thái); cảm biến không gửi số đo quá 6 giờ |

Quy tắc chung:

1. Kỳ xem chọn bằng `?days=7|30|90` (mặc định 30), đi theo mọi liên kết trong app, cùng với `?theme=`. Kho nóng chỉ giữ số đo cảm biến 30 ngày (`DXOS_HOT_RETENTION_DAYS`), nên biểu đồ cảm biến dùng tối đa 30 ngày và ghi rõ điều đó khi kỳ xem là 90 ngày.
2. Mỗi con số ghi rõ kỳ và nguồn; số đo cảm biến luôn kèm thời điểm đo. Không có dữ liệu thì hiện trạng thái trống có lời giải thích, không hiện số 0 gây hiểu lầm (ví dụ "Chưa có cảm biến nào gửi số đo").
3. Lõi không trả lời hoặc hết giờ (5 giây cho mỗi truy vấn): trang vẫn hiện khung và các khối khác, khối bị lỗi ghi "Chưa lấy được dữ liệu, thử tải lại"; không có trang lỗi trắng.
4. Mỗi tab có "Tải CSV" cho bảng chính và "Bản in" (mở ngoài khung, có liên kết quay lại) theo cách của bộ giao diện chung; CSV có BOM, CRLF và chống công thức.
5. Không cuộn ngang ở 390 px; sáng và tối; `:focus-visible`; biểu đồ có bảng số liệu tương đương cho trình đọc màn hình (`<table>` ẩn khỏi mắt nhưng đọc được, hoặc nằm trong `<details>`).
6. Mã thửa trong địa chỉ được kiểm theo mẫu trước khi dùng; thửa của HTX khác hoặc không tồn tại trả trang "Không tìm thấy".

## 5. Chỉ số và cảnh báo

### 5.1 Dải chỉ số ở Tổng quan

Số hộ; số thửa và tổng diện tích; số thửa đang canh tác; sản lượng kỳ vọng của các vụ đang canh tác; lô theo từng trạng thái; nhật ký ghi trong kỳ và nhật ký chờ duyệt; báo cáo bệnh trong kỳ và số đang chờ xử lý; số thửa có cảm biến và số cảm biến đang im lặng.

Định nghĩa từng chỉ số (bảng nào, điều kiện nào) nằm trong một module riêng của app, có kiểm thử trên dữ liệu mẫu cố định; trang chỉ hiển thị. Tên trạng thái lấy đúng theo `apps/web/prisma/schema.prisma`; trạng thái nhật ký là chuỗi dùng trong mã của web (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `REQUEST_CHANGES`).

Định nghĩa đã chốt:

- **Chỉ số nào trang `/manager/dashboard` của lõi đã tính thì dùng đúng định nghĩa đó**, để hai màn hình không lệch nhau.
- **Vụ đang canh tác** của một thửa là chu kỳ có `harvested_at` trống (mới nhất nếu có nhiều). **Thửa đang canh tác** là thửa có vụ như vậy. Trạng thái của thửa (`status`) được hiện nguyên như lõi lưu ở biểu đồ "thửa theo trạng thái".
- **Sản lượng kỳ vọng** = tổng `area_ha × estimated_yield_per_ha` của các thửa đang canh tác. Thửa chưa khai năng suất không được tính và được đếm riêng ("N thửa chưa khai năng suất").
- **Ngày thu hoạch dự kiến** là `estimated_harvest_date` của vụ đang canh tác. Vụ chưa có ngày này được đếm riêng, không vào cảnh báo. **Quá hạn** là vụ đang canh tác có ngày dự kiến trước hôm nay (giờ Việt Nam).
- **Nhật ký chờ duyệt** chỉ gồm `PENDING_APPROVAL`, tuổi tính từ `created_at`; `REQUEST_CHANGES` đếm riêng ("cần sửa").
- **Đếm:** nhật ký đếm bằng truy vấn gộp sẵn có của `journal_entries`. Các bảng khác đếm trên danh sách tải về với giới hạn 5.000 dòng; chạm giới hạn thì con số được ghi kèm "chỉ tính trên 5.000 dòng mới nhất".

### 5.2 "Cần chú ý"

Mỗi dòng nêu việc gì, bao nhiêu, và dẫn tới trang xử lý của lõi. Chỉ hiện dòng có số lớn hơn 0; không có dòng nào thì ghi "Không có việc nào cần chú ý".

- Nhật ký chờ duyệt quá 3 ngày.
- Báo cáo bệnh chờ xử lý, và báo cáo mới trong 7 ngày.
- Cảm biến im lặng: cặp (thửa, cảm biến) có số đo trong kho nóng nhưng không có số đo nào trong 6 giờ gần nhất. Lõi không có danh mục cảm biến, nên cảm biến im lặng quá 30 ngày sẽ không còn hiện; trang ghi rõ giới hạn này.
- Vụ có ngày thu hoạch dự kiến trong 7 ngày tới, và vụ đã quá ngày dự kiến mà chưa thu.
- Lần chuyển dữ liệu sang kho lạnh bị lỗi trong 7 ngày.

Các mốc 3 ngày, 6 giờ, 7 ngày là hằng số của app trong đợt 1.

## 6. Kiến trúc

- Cùng khuôn với các mini-app hiện có: FastAPI và Jinja2, dựng trang phía máy chủ, không JavaScript, không cookie, container chỉ đọc. Manifest không khai `database`.
- Vai và HTX đọc từ claim của token như các mini-app hiện có (`claims.py`); thiếu vai `manager` hoặc `htx_code` trống thì trả 403.
- Không thêm thư viện: truy vấn song song bằng nhóm luồng của thư viện chuẩn, gọi lõi bằng cách các app hiện có đang dùng.
- Ba phần: `core_client` (gọi `http://apisix:9081/api/data/graphql` với header `Authorization` của người xem và `x-hasura-role: manager`; mỗi truy vấn là một hằng, không ghép chuỗi từ dữ liệu người dùng), `metrics` (hàm thuần: nhận các dòng lõi trả về, cho ra chỉ số, chuỗi theo tuần hoặc ngày, danh sách cảnh báo), `routes` (kiểm vai, gọi hai phần trên, dựng trang).
- Biểu đồ: cột dùng macro của bộ giao diện chung; đường là SVG do app dựng (toạ độ tính ở Python, không thuộc tính `style`, màu qua lớp CSS).
- Các truy vấn của một trang chạy song song; một truy vấn hỏng không làm hỏng trang (§4 quy tắc 3).
- Giới hạn: mỗi truy vấn danh sách có `limit` rõ ràng; khi chạm giới hạn, trang ghi "Chỉ tính trên N dòng mới nhất".

## 7. Thay đổi ở tầng dữ liệu lõi (dùng chung, chỉ đọc)

Số đo cảm biến có thể tới hàng chục nghìn dòng mỗi thửa trong kho nóng, không thể tải thô về để vẽ biểu đồ theo ngày. Thêm:

1. View `telemetry.sensor_daily`: mỗi dòng là một (`htx_code`, `parcel_code`, `sensor`, `day`) với `day` (kiểu `date`) là ngày theo giờ Việt Nam, và `reading_count`, `min_value`, `max_value`, `avg_value`, `first_ts`, `last_ts`. View đọc `telemetry.sensor_readings`; không lưu gì. View được tạo bằng `CREATE OR REPLACE VIEW` trong một tệp khởi tạo của `platform/postgres/init/`: `platform-init` áp lại các tệp này lên database đã có, nên máy đang chạy nhận view sau `make platform-up` (lệnh này cũng khởi động lại Hasura để nạp metadata). View chạy bằng quyền của chủ sở hữu; việc lọc theo HTX do Hasura áp, như với bảng gốc.
2. Hasura theo dõi view này với quyền `select` cho `manager` và `officer`, cùng bộ lọc `htx_code` như `telemetry_sensor_readings` (không có quyền cho `farmer`, như bảng gốc).
3. Số đo mới nhất của từng cảm biến lấy từ bảng gốc bằng `distinct_on`, không cần thay đổi gì.
4. Bộ kiểm dữ liệu của nền tảng (`platform/tests/smoke-dataops.sh`, nơi đang kiểm quyền trên `telemetry`) thêm kiểm tra cho view: trưởng HTX `TC` không đọc được dòng của `LB`; `farmer` không đọc được.

Không đổi quyền nào khác, không bật thêm phép gộp (`aggregate`) cho bảng nào: các bảng nghiệp vụ của một HTX đủ nhỏ để app đếm trên danh sách đã giới hạn.

## 8. Manifest và Kho ứng dụng

`id: htx-dashboard`, `version: 0.1.0`, `license: MIT`, `requires.core: ">=1.13.0"` (phiên bản lõi có view ở §7; web lên `1.13.0` trong cùng thay đổi). Đường dẫn có bảo vệ `/` cho `manager`; không có đường dẫn công khai. Khối `store`: nhóm `production`, một biểu tượng trong danh sách cho phép, mô tả, mục dữ liệu ("App không lưu dữ liệu"), dữ liệu cá nhân ("Hiện tên hộ và mã thửa của HTX cho trưởng HTX; không lưu"), `core_reads` liệt kê các nhóm dữ liệu ở §4, tối đa 4 ảnh màn hình.

## 9. Kiểm thử và nghiệm thu

- **pytest của app:** từng chỉ số và từng cảnh báo ở §5 trên dữ liệu mẫu cố định, kể cả biên (đúng 3 ngày, đúng 6 giờ, kỳ không có dòng nào); chuỗi theo tuần và theo ngày tính theo giờ Việt Nam qua nửa đêm UTC; lõi trả lỗi, trả sai dạng hoặc hết giờ ở từng truy vấn; token thiếu vai hoặc thiếu mã HTX bị từ chối; mã thửa sai mẫu; văn bản thù địch trong tên hộ hoặc ghi chú hiện ra như chữ và bị vô hiệu trong CSV; trang không có `<script>` và không có thuộc tính `style`.
- **Nền tảng:** kiểm tra ở §7.4; `make platform-smoke` và bộ kiểm dữ liệu giữ mọi kiểm tra cũ.
- **`make apps-smoke`:** cài app; trưởng HTX mở được từng tab (200) và trang thửa của một thửa có số đo; `officer` và `farmer` bị cổng từ chối; không token nhận 401; CSV đúng dạng; gỡ app sạch (app không có schema).
- **Trình duyệt:** một câu chuyện (trưởng HTX mở Tổng quan, sang Vùng trồng, mở một thửa có số đo, thấy biểu đồ và số mới nhất khớp với dữ liệu gieo sẵn); ảnh màn hình các tab ở 1280 và 390 px, sáng và tối, không cuộn ngang, không chồng chữ.
- **Dữ liệu thử:** số đo cảm biến gieo bằng công cụ mô phỏng sẵn có của nền tảng hoặc chèn thẳng trong bước chuẩn bị của bộ kiểm; không thêm dữ liệu giả vào lõi khi chạy thật.
- **Không thoái lui:** mọi bộ kiểm hiện có giữ nguyên số lượng và đều qua; hai vòng trên stack sạch (`COMPOSE_PROJECT_NAME=dxos-clean`) trước khi báo xong.

## 10. Đợt 2 (hướng, chưa thiết kế)

Để dashboard gộp được số liệu kinh doanh, thêm một hợp đồng chung trong manifest, cùng kiểu với `feed`: mỗi mini-app có thể khai một đường dẫn có bảo vệ trả về vài chỉ số của mình cho người đang gọi (tên, giá trị, đơn vị, kỳ, liên kết). `htx-dashboard` gọi các đường dẫn đó qua cổng bằng token của người xem và hiện thành một khối "Kinh doanh"; app nào không khai thì không hiện. App quản lý nhân sự (PR #46) và app di động (nhánh `feat/39-hub-mobile`) hiện không đưa dữ liệu qua cổng hay Hasura, nên muốn có mặt trên dashboard thì phải đi theo hợp đồng này hoặc được Hasura theo dõi.

## 11. Rủi ro

| Rủi ro | Cách xử lý |
| --- | --- |
| Trang chậm vì nhiều truy vấn tới lõi | Truy vấn song song, giới hạn số dòng, view theo ngày cho cảm biến; đo thời gian mở từng tab trên dữ liệu gieo sẵn và ghi vào báo cáo |
| Chỉ số bị hiểu sai (ví dụ sản lượng kỳ vọng) | Mỗi chỉ số có một dòng định nghĩa ngay trên trang |
| View mới làm lệch bộ kiểm nền tảng đang đếm số bảng | Người triển khai đọc các bộ kiểm trước, cập nhật con số có chủ đích và ghi rõ trong PR |
| Stack sạch không có số đo cảm biến để kiểm | Bước chuẩn bị của bộ kiểm tự gieo số đo (§9) |

## Ghi chú sau triển khai

Chỗ mã khác với thân tài liệu ở trên (thân tài liệu giữ nguyên):

- **Sản lượng kỳ vọng (§5.1).** §5.1 vừa nói "chu kỳ mở" vừa nói "dùng đúng định nghĩa của `/manager/dashboard`". Đã chốt theo lõi: **các thửa có `status` không phải `HARVESTED` và không phải `DRAFT`**, cộng `area_ha × estimated_yield_per_ha`; thửa chưa khai năng suất được đếm riêng. Nhờ vậy hai màn hình cho cùng một số.
- **Giá thị trường (§4).** Khối "Giá thị trường mới nhất" chỉ hiện các dòng của chè (`commodity = "Tea"`, tối đa 3 dòng mới nhất); không còn bổ sung bằng hàng hoá khác như trang của lõi (gạo, ngũ cốc không có ý nghĩa với HTX chè). Không có dòng chè thì hiện trạng thái trống. Tên chỉ số dịch bằng bảng của `apps/web/src/app/manager/dashboard/page.tsx`, thêm `export_price`, `import_tariff`, `production_volume`, là các chỉ số lõi chưa có tên tiếng Việt.
- **Truy vấn của tab Dữ liệu (§6).** Tab này chỉ cần số dòng theo ngày nên xin hai cột (`day`, `reading_count`) của view với giới hạn 50.000 dòng (330 thửa × 5 cảm biến × 30 ngày); quá giới hạn thì trang nói số đã bị cắt. Truy vấn một thửa (`PARCEL_DAILY`) giới hạn 1.000 dòng (một thửa × cảm biến × 30 ngày). Các danh sách còn lại giữ giới hạn 5.000 dòng.
- **Bộ kiểm nền tảng (§7.4, §11).** `smoke-platform.sh` nạp `smoke-dataops.sh`, nên CI chạy các kiểm tra của view: thêm kiểm tra cho `officer` và đổi ngày số đo thử sang hôm qua và hôm nay (cố định giờ 16:59Z và 18:30Z của ngày hôm trước để qua nửa đêm Việt Nam), vì ngày 2026-03-10 cũ hơn thời hạn kho nóng 30 ngày. Số PASS của `make platform-smoke` từ 124 thành 131 (5 của view và 2 của `officer`); `make apps-smoke` kiểm lại số này.
- **Ảnh cho Kho ứng dụng.** Bốn ảnh trong `miniapps/htx-dashboard/store/` được chụp từ bản xem trước với dữ liệu mẫu, không chụp lại trên runner.

### 0.2.0: bảng điều hành biểu đồ

- **Giao diện.** Mỗi tab là một lưới biểu đồ phục vụ trên máy chủ (SVG và HTML/CSS, không JavaScript, không thuộc tính `style`). Bộ vẽ nằm ở `charts.py` (cột xếp chồng hoặc ghép, bánh donut, sparkline, đồng hồ đo, vòng tiến độ, lịch nhiệt, phễu, lịch Gantt, phân tán, chênh lệch so với kỳ trước); mỗi biểu đồ có bảng số liệu hoặc chú giải bằng chữ. Bảng màu danh mục `tone-N` và dải tuần tự `seq-N` định nghĩa một lần trong `dashboard.css`, cho cả hai giao diện sáng và tối.
- **Truy vấn mới.** `JOURNAL_COUNTS` đếm thêm kỳ trước (`previous`), `SENSOR_DAILY` xin số đo theo ngày của mọi thửa và cảm biến, `PRICES` lấy lịch sử giá chè (tối đa 120 dòng) để vẽ xu hướng. Vẫn là hằng số, vẫn lọc theo `htx_code` từ token.
- **Giá thị trường.** Thay cho "tối đa 3 dòng mới nhất" của 0.1.0: trang hiện giá mới nhất của mỗi chỉ số (tối đa 3) và vẽ xu hướng giá xuất khẩu khi có ít nhất hai điểm.
- **Số liệu mới.** So sánh kỳ trước dùng cùng độ dài kỳ xem; sparkline không vẽ khi kỳ không có số nào; phễu lô đếm mỗi lô ở mọi giai đoạn nó đã qua, giả định trạng thái lô đi theo thứ tự nháp, sẵn sàng, đã xuất QR.
- **Xem trước.** `python tests/preview.py [cổng] [--empty]` phục vụ app với dữ liệu mẫu dưới CSP của sản phẩm.

## Ghi chú định hướng tiếp theo (2026-11-28)

Theo [product-roadmap.md](../product-roadmap.md) (§4, §5 GĐ3) và [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md):
- Tránh tách đôi nhận thức cho Giám đốc HTX giữa `/manager/dashboard` và `htx-dashboard`, lộ trình GĐ3 gộp hai màn hình thành **1 Bảng Điều hành Giám đốc duy nhất** tích hợp đủ số liệu sản xuất, sản lượng búp thu mua, tồn kho chè khô, công nợ xã viên và công nợ thương lái.
- Kiến trúc Bản sao số IT/OT và Kho lạnh Parquet/DuckDB được giữ nguyên và mở rộng sang **cảm biến xưởng sao sấy chè** gắn với `ProcessingBatch`.

