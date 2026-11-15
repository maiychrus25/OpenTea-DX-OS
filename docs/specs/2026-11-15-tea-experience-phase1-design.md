<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế giai đoạn 1: mini-app `tea-experience`

Trạng thái: bản triển khai đầu tiên, ngày 2026-11-15. Nguồn nghiệp vụ: [đặc tả use case](./2026-11-15-tea-experience-usecases.md) (mục 3, 4, 6, 7, 8, 10). Luật mini-app: [docs/miniapps.md](../miniapps.md). Mã nguồn: `miniapps/tea-experience/`.

Quyết định chủ dự án đã chốt (theo mục 9 của đặc tả use case): E1=A (app riêng), E2=A (không có vai trò cán bộ), E3=B (thời tiết để giai đoạn 2), E4=A (danh sách toạ độ và nút "Mở trên bản đồ", không JavaScript), E5=A (không đánh giá ở giai đoạn 1), E6=A (không hiện tên hộ nông dân trên trang công khai).

## 1. Phạm vi

Làm trong giai đoạn 1:
- DL-11: trưởng HTX làm mới bản sao từ dữ liệu lõi (htx_profiles, parcels, parcel_crop_cycles).
- DL-8 (phần soạn): giới thiệu HTX, điểm tham quan, gói trải nghiệm, lịch mùa vụ; ẩn/hiện, sửa, xoá.
- DL-1 (trang giới thiệu), DL-2 (điểm công khai, nút mở bản đồ), DL-3 (gói), DL-4 (mùa vụ, không thời tiết), DL-5 (nút sang `tea-tour`), DL-6 (dòng hướng dẫn quét QR, không có liên kết).
- Nông dân: một trang tổng quan chỉ đọc nội dung đang công khai.

Không làm: đánh giá (DL-7), đăng ký nông hộ (DL-9), thống kê (DL-10), thời tiết, ảnh, bản đồ tương tác, vai trò cán bộ, ghi nhận lượt xem.

## 2. Kiến trúc

Cùng khuôn với `tea-tour`: FastAPI và Jinja2, render phía server, không JavaScript, không cookie. Schema Postgres `app_tea_experience` (role `app_tea_experience`, `CONNECTION LIMIT 10`). Container chạy `uvicorn --root-path /apps/tea-experience`.

Luồng làm mới (DL-11): handler gọi lõi trước, rồi mới mở kết nối database (lõi chậm không giữ slot DB). Lõi lỗi hoặc hết giờ (5 giây) thì giữ bản cũ và ghi một dòng `core_sync_log` với kết quả `ERROR`.

Các thành phần:

| Tệp | Vai trò |
| --- | --- |
| `tea_experience/main.py` | Route, kiểm vai trò, kiểm đầu vào, POST rồi 303 |
| `tea_experience/store.py` | Truy vấn SQL; mọi truy vấn lọc theo `htx_code` (token hoặc URL) |
| `tea_experience/core_client.py` | Gọi Hasura bằng token của trưởng HTX, phân tích và kiểm dữ liệu lõi (hàm thuần, không I/O) |
| `tea_experience/claims.py` | Đọc claim, như `tea-tour` |
| `tea_experience/appkit.py`, `templates/kit.html` | Chép từ `platform/appkit` (xem mục 8) |

## 3. Dữ liệu (`migrations/001_init.sql`, `002_featured.sql`, `003_core_columns.sql`)

Mọi bảng có `htx_code text NOT NULL`, khoá ngoại gồm cả `htx_code`.

| Bảng | Nội dung | Ghi chú |
| --- | --- | --- |
| `htx_intro` | khoá `htx_code`; cột lõi (`name`, `address`, `crop_types`, `season_label`, `total_area_ha`, `member_count`, `synced_at`); cột trưởng HTX nhập (`intro_text`, `locality_public`, `certification`) | `address` là địa chỉ lõi, chỉ trưởng HTX xem. Khách chỉ thấy `locality_public`. `certification` lõi không có, nhập tay. Migration 003 bỏ `province`, `district`, `commune`, `primary_crop` |
| `core_parcels` | khoá `(htx_code, parcel_code)`; tâm thửa (lat, lng), cây (`crop` từ `parcels.crop_type`), `season` và `planting` (có chu kỳ chưa thu hoạch) | Bản sao tối thiểu, thay toàn bộ mỗi lần làm mới. Không có cột tên: mã thửa là tên hiển thị (migration 003 bỏ `name`). Chỉ trưởng HTX xem. Mới so với đặc tả (xem mục 9) |
| `core_sync_log` | lần làm mới, người làm (tên hiển thị), số thửa, số vụ, số thửa bị bỏ, kết quả `OK`/`ERROR`, chi tiết cố định | Không lưu nguyên văn lỗi kỹ thuật |
| `sites` | tên, mô tả, vĩ độ, kinh độ (cả hai hoặc không có), `parcel_code` tham chiếu, `is_public`, thứ tự | Tối đa 200 điểm mỗi HTX |
| `experiences` | tên, mô tả, thời lượng (15 đến 1440 phút), giá tham khảo (0 đến 1 tỷ đồng), `months int[]` (tháng 1 đến 12), `is_visible`, thứ tự | Tối đa 100 gói mỗi HTX |
| `experience_sites` | `(experience_id, site_id)` | Khoá ngoại gồm `htx_code`, xoá theo cascade |
| `season_notes` | khoá `(htx_code, month)`, ghi chú 1 đến 300 ký tự | Tối đa một dòng mỗi tháng |

Ràng buộc quan trọng nằm trong SQL (không chỉ trong Python): toạ độ trong khoảng hợp lệ, cặp toạ độ đi cùng nhau, `months <@ ARRAY[1..12]`, giá không âm, thời lượng trong khoảng, độ dài văn bản, số điểm và số gói tối đa do Python kiểm.

## 4. Trang

Đường dẫn dưới `/apps/tea-experience`. Mọi link, form, chuyển hướng đều có tiền tố này và giữ `?theme=`.

| Trang | Vai trò | Nội dung |
| --- | --- | --- |
| `/` | manager | Tổng quan: lần làm mới gần nhất, số điểm công khai, số gói đang hiện, số tháng đã có ghi chú |
| `/intro` | manager | Sửa đoạn giới thiệu; số liệu lõi (chỉ đọc, có "Cập nhật lúc"); `POST /sync` |
| `POST /intro` | manager | Lưu đoạn giới thiệu (tối đa 2000 ký tự) |
| `POST /sync` | manager | Làm mới từ lõi; 303 về `/intro?notice=` |
| `/sites` | manager | Danh sách điểm; khối thêm điểm (có chọn thửa để sao chép toạ độ); ẩn/hiện; xoá |
| `/sites/<id>/edit`, `POST` | manager | Sửa điểm; kiểm `id` thuộc HTX |
| `/experiences` | manager | Danh sách gói; thêm; ẩn/hiện; xoá |
| `/experiences/<id>/edit`, `POST` | manager | Sửa gói, tick tháng, chọn điểm liên quan (chỉ điểm của HTX) |
| `/seasons` | manager | 12 ô ghi chú; gợi ý vụ đang trồng từ lõi (tổng hợp theo cây, không có mã thửa) kèm "Cập nhật lúc" |
| `/guide` | farmer | Tổng quan chỉ đọc nội dung công khai và liên kết trang công khai |
| `/public/<htx>` | công khai | Giới thiệu HTX; nút điểm, gói, mùa vụ, tea-tour; dòng hướng dẫn quét QR |
| `/public/<htx>/sites` | công khai | Điểm có `is_public`; toạ độ; nút "Mở trên bản đồ" nếu có toạ độ |
| `/public/<htx>/experiences` | công khai | Gói đang hiện, dạng thẻ |
| `/public/<htx>/experiences/<id>` | công khai | Chi tiết; tháng phù hợp; điểm liên quan đã công khai; nút sang tea-tour |
| `/public/<htx>/seasons` | công khai | Lịch 12 tháng (ghi chú của trưởng HTX) |

Quy ước:
- Mọi ghi là POST rồi 303 về trang dưới `/apps/tea-experience/`.
- Thông báo `?notice=` chỉ nhận khoá cố định (`saved`, `synced`, `sync_failed`, `deleted`, ...), không đưa chữ tự do vào trang.
- Khi lỗi kiểm đầu vào, trang trả 400 và giữ chữ đã gõ, lỗi hiện dưới ô.

## 5. Quyền và ràng buộc dữ liệu

- Trang manager và farmer đọc `htx_code` từ token. Trang công khai đọc từ URL và kiểm bằng regex `^[A-Za-z0-9_-]{1,20}$`. Form không bao giờ mang mã HTX.
- Mọi `id` trong URL truy vấn kèm `htx_code`; không thuộc HTX thì 404.
- Trang công khai không lộ: tên hộ, số điện thoại, mã thửa, toạ độ thửa, địa chỉ chi tiết, người làm đồng bộ, điểm chưa đánh dấu công khai, gói đang ẩn.
- Toạ độ trên trang công khai chỉ đến từ điểm trưởng HTX đánh dấu công khai và nhập/sao chép có chủ đích.
- Giới hạn route: manager và farmer kiểm vai trò trong gateway và trong app (`role()`), thiếu `htx_code` thì 403.

## 6. Làm mới từ lõi (DL-11)

1. Gọi `http://apisix:9081/api/data/graphql` với header `Authorization` của trưởng HTX và `x-hasura-role: manager`, hết giờ 5 giây.
2. Truy vấn (lấy từ `apps/web/prisma/schema.prisma`, nguồn đúng; `docs/database-schema.md` đã cũ): `htx_profiles(limit: 1) { htx_code name address crop_types season_label total_area_ha }`, `households { id }`, `parcels { id parcel_code crop_type centroid_lat centroid_lng }`, `parcel_crop_cycles(where: {harvested_at: {_is_null: true}}) { parcel_id season }`. Truy vấn được khai báo là dữ liệu trong `core_client.ROOTS`; test hợp đồng (`tests/test_contract.py`) đối chiếu từng trường với schema.prisma và quyền đọc của role `manager` trong metadata Hasura.
3. Kiểm trong Python: hồ sơ HTX phải có `htx_code` đúng bằng `htx_code` của token; thửa thiếu toạ độ hoặc toạ độ ngoài khoảng bị bỏ và được đếm; vụ không trỏ tới thửa còn lại bị bỏ.
4. Ghi trong một transaction: cập nhật cột lõi của `htx_intro` (giữ `intro_text`), thay toàn bộ `core_parcels`, thêm `core_sync_log`.
5. Lỗi (mã khác 200, hết giờ, thiếu hồ sơ HTX, dữ liệu sai hình): không đổi bảng dữ liệu, ghi `core_sync_log` với kết quả `ERROR` và chi tiết cố định, 303 kèm `notice=sync_failed`.

Mọi số liệu lấy từ lõi (diện tích, số hộ, cây trồng, vụ đang trồng) đi kèm dòng "Cập nhật lúc ...", lấy từ `htx_intro.synced_at` hoặc dòng `core_sync_log` thành công gần nhất. Chứng nhận không đến từ lõi và không có "Cập nhật lúc".

## 7. Điểm, gói, mùa vụ: quy tắc

- Toạ độ: nhập số có dấu chấm hoặc dấu phẩy; lat trong [-90, 90], lng trong [-180, 180]; hoặc để trống cả hai. Chỉ một trong hai là lỗi.
- Chọn thửa: chỉ thửa có trong `core_parcels` của HTX; nếu ô toạ độ trống thì sao chép toạ độ của thửa, trưởng HTX sửa được sau đó.
- Điểm không có toạ độ thì không hiện nút bản đồ.
- Gói: tháng phù hợp là tập con của 1 đến 12 (trống nghĩa là chưa ghi). Điểm liên quan phải thuộc cùng HTX.
- Giá tham khảo không phải giá tour; trang ghi rõ "giá tham khảo, giá tour xem ở lịch tour".
- Gói ẩn: không hiện công khai. Gói chi tiết của gói ẩn trả 404.
- Mùa vụ: 12 ô, mỗi ô tối đa 300 ký tự; ô trống thì không lưu.

## 8. Bộ giao diện dùng chung

`platform/appkit/appkit.py` và `platform/appkit/kit.html` được chép nguyên văn vào `miniapps/tea-experience/tea_experience/appkit.py` và `templates/kit.html`. Stylesheet `/dxos-app.css` do web cấp. Không có `style=` và không có `<script>` trong template.

`scripts/appkit-sync.sh` hiện liệt kê bốn app. Gói mới chưa được thêm vào danh sách đó (nằm ngoài phạm vi giai đoạn 1), nên `make lint` chưa kiểm bản chép này. Việc thêm `miniapps/tea-experience/tea_experience` vào danh sách là bước của chủ dự án.

## 9. Chỗ khác với đặc tả và quyết định tại chỗ

1. **Bảng `core_parcels` (mới).** Đặc tả chỉ ghi `parcels` là nguồn toạ độ điểm (DL-2) và DL-11 nói "lưu bản sao tối thiểu". Cần một bảng để trưởng HTX chọn thửa và sao chép toạ độ. Bảng giữ mã thửa (cũng là tên hiển thị), tâm thửa, cây trồng và vụ, và chỉ trưởng HTX xem.
2. **`sites.parcel_code` không có khoá ngoại.** Làm mới thay toàn bộ `core_parcels`, khoá ngoại sẽ chặn hoặc xoá điểm đã chọn. Đây chỉ là mã tham chiếu để trưởng HTX biết điểm lấy từ thửa nào.
3. **Lõi không gắn `htx_code` lên `parcels` và `parcel_crop_cycles`.** Cách ly theo HTX dựa vào Hasura lọc theo token (như `leaf-purchase`) và kiểm `htx_profiles.htx_code`. Đây là rủi ro đã nêu; xem README.
4. **Nút bản đồ dùng OpenStreetMap.** Đặc tả chỉ nói "dịch vụ bản đồ bên ngoài". Liên kết được dựng từ toạ độ đã kiểm (chỉ số, không có chữ tự do): `https://www.openstreetmap.org/?mlat=<lat>&mlon=<lng>#map=16/<lat>/<lng>`. Chủ dự án có thể đổi dịch vụ.
5. **DL-5 luôn hiện nút sang tea-tour**, kèm dòng "Nếu chưa có lịch, liên hệ HTX". App không đọc được bảng tour của `tea-tour` nên không biết còn chỗ, cũng không biết HTX đã bật `tea-tour` hay chưa.
6. **DL-6 chỉ là dòng hướng dẫn**, không có liên kết. Trang `/lot/<mã lô>` cần mã lô cụ thể mà giai đoạn 1 chưa có. Liên kết theo lô cần quyết định sau.
7. **Mùa vụ từ lõi chỉ hiện cho trưởng HTX** (tổng hợp theo cây, không có mã thửa), làm gợi ý cho ghi chú. Trang công khai không hiện dữ liệu vụ từ lõi.
8. **Người làm đồng bộ** (tên hiển thị của trưởng HTX) được ghi trong `core_sync_log`. Đây là dữ liệu của cán bộ, được khai trong `personal_data`.
9. **Tháng phù hợp trống** nghĩa là "chưa ghi", không phải "quanh năm".
10. **Nông dân** chỉ có `/guide`, đọc nội dung công khai. Không có mục soạn.

11. **Lệch cột với tài liệu cũ (sửa ở giai đoạn 1, bản 2).** Bản đầu đọc cột từ `docs/database-schema.md`, tài liệu đã cũ. Lõi thật không có `province`, `district`, `commune`, `primary_crop`, `certification`, `parcels.name`, `parcel_crop_cycles.crop`, `is_active`; Hasura sẽ báo lỗi "field not found" và nút làm mới luôn lỗi. Đã sửa theo `schema.prisma` và thêm test hợp đồng để lệch như vậy làm test đỏ.
12. **Địa chỉ không hiện cho khách.** Lõi có `htx_profiles.address`, có thể là địa chỉ chi tiết. Trang công khai chỉ hiện `locality_public`, ô do trưởng HTX nhập (ví dụ "Tân Cương, Đại Từ, Thái Nguyên"). Không có ô đó thì khách không thấy địa phương. Địa chỉ lõi chỉ hiện trên trang giới thiệu của trưởng HTX.
13. **Chứng nhận nhập tay.** Lõi không có chứng nhận. `htx_intro.certification` do trưởng HTX nhập và không bao giờ bị làm mới ghi đè.
14. **Số hộ thành viên đếm phía app.** Vai trò `manager` không có `allow_aggregations` trên `households` (metadata Hasura), nên không dùng `households_aggregate`. App đọc `households { id }` của HTX và đếm. Với HTX có rất nhiều hộ, truy vấn sẽ nặng hơn; chấp nhận được ở quy mô HTX hiện nay.
15. **Tên thửa.** Lõi không có tên thửa. Mã thửa `parcel_code` là tên hiển thị. Mã này cũng nằm trong `sites.parcel_code` (mã tham chiếu).
16. **Vụ đang trồng.** Một thửa đang trồng nếu có chu kỳ `parcel_crop_cycles` với `harvested_at` trống. Lứa lấy từ chu kỳ đó (`season`); cây lấy từ `parcels.crop_type`. Chu kỳ đã thu hoạch không tính.
17. **Migration 003** (không sửa 001 và 002). Thêm `address`, `locality_public`, `crop_types`, `season_label`; chép `primary_crop` sang `crop_types` rồi bỏ `province`, `district`, `commune`, `primary_crop`; bỏ `core_parcels.name`, thêm `core_parcels.planting`. Dữ liệu đồng bộ cũ (lấy từ tài liệu cũ) không đáng tin và sẽ được làm mới lại.

## 10. Kiểm thử

- Pytest trong `miniapps/tea-experience/tests/`:
  - Kiểm đầu vào (độ dài, toạ độ, giá, thời lượng, tháng, số điểm tối đa).
  - `htx_code` lấy từ token; id của HTX khác trả 404; form không đổi được HTX.
  - Trang công khai không lộ tên hộ, số điện thoại, mã thửa, toạ độ thửa, người làm, điểm/gói ẩn.
  - Lõi lỗi (hết giờ, mã lỗi, hồ sơ sai HTX) vẫn hiện trang, giữ bản cũ, ghi log `ERROR`.
  - Escape HTML (dữ liệu có `<script>` không được thoát thành thẻ).
  - Quyền theo vai trò (farmer không vào `/`, manager không vào `/guide` là 403 ở app).
  - Ràng buộc SQL (CHECK, khoá ngoại gồm `htx_code`).
- Test hợp đồng (`tests/test_contract.py`): mọi trường truy vấn lõi phải là cột thật trong `apps/web/prisma/schema.prisma`, và role `manager` phải đọc được chúng theo metadata Hasura. Có test lệch cột mẫu để chứng minh test đỏ.
- Kiểm thử cần Postgres: docker tắt, nên test dùng biến `TEA_EXPERIENCE_TEST_PG_URL` trỏ tới Postgres tạm; nếu không có biến thì dùng fixture của `platform/cli` như `tea-tour`.
- `./dxos validate miniapps/tea-experience` phải hợp lệ.
