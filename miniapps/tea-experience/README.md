<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `tea-experience`: cẩm nang du lịch đồi chè (giai đoạn 1)

HTX giới thiệu mình với khách du lịch trên điện thoại: trang giới thiệu, điểm tham quan (có nút mở bản đồ), gói trải nghiệm (hái chè, sao chè, pha trà) và lịch mùa vụ theo tháng. Khách không cần đăng nhập. Khi quyết định đi, khách bấm sang `tea-tour` để đặt chỗ.

Đặc tả: [`docs/specs/2026-11-15-tea-experience-phase1-design.md`](../../docs/specs/2026-11-15-tea-experience-phase1-design.md) (giai đoạn 1) và [`docs/specs/2026-11-15-tea-experience-usecases.md`](../../docs/specs/2026-11-15-tea-experience-usecases.md) (nghiệp vụ đầy đủ). Cách viết một mini-app: [`docs/miniapps.md`](../../docs/miniapps.md).

**Chưa có trong giai đoạn 1:** đánh giá của khách, đăng ký nhận khách của nông hộ, thống kê, thời tiết, ảnh, bản đồ tương tác, vai trò cán bộ. Không đặt chỗ và không thu tiền (việc của `tea-tour`).

## Trang

Đường dẫn dưới `/apps/tea-experience`.

| Đường dẫn | Ai vào | Nội dung |
| --- | --- | --- |
| `/` | `manager` | Tổng quan: số điểm và gói công khai, số tháng có ghi chú, lần làm mới gần nhất, nút làm mới |
| `/intro` | `manager` | Đoạn giới thiệu (trưởng HTX soạn); số liệu lõi (chỉ đọc, kèm "Cập nhật lúc"); nút "Làm mới từ dữ liệu lõi" |
| `/sites` | `manager` | Điểm tham quan: thêm, sửa, ẩn/hiện công khai, xoá. Có thể chọn thửa để sao chép toạ độ |
| `/sites/<id>/edit` | `manager` | Sửa một điểm |
| `/experiences` | `manager` | Gói trải nghiệm: thêm, sửa, ẩn/hiện, xoá |
| `/experiences/<id>/edit` | `manager` | Sửa gói, chọn tháng phù hợp và điểm liên quan |
| `/seasons` | `manager` | 12 ô ghi chú theo tháng; gợi ý vụ đang trồng từ lõi (theo cây, không có mã thửa) |
| `/guide` | `farmer` | Chỉ đọc nội dung đang công khai |
| `/public/<htx>` | công khai | Trang chủ du lịch: hero đồi chè, số liệu nhanh, xem trước điểm, gói và lưới 12 tháng; nút sang tea-tour; dòng hướng dẫn quét QR |
| `/public/<htx>/sites` | công khai | Điểm đã đánh dấu công khai, toạ độ và nút "Mở trên bản đồ" (liên kết ra ngoài) |
| `/public/<htx>/experiences` | công khai | Gói đang hiện, dạng thẻ; lọc bằng query `month` (1–12), `q` (tên, tối đa 60 ký tự), `max_price` (đồng), `sort` (`price` hoặc `duration`); chip lọc nhanh; giá trị sai bị bỏ và báo một dòng |
| `/public/<htx>/experiences/<id>` | công khai | Chi tiết gói, tháng phù hợp, điểm liên quan đã công khai, nút sang tea-tour |
| `/experiences/<id>/featured` | `manager` | Bật/tắt "Nổi bật" (POST, 303); tối đa 6 gói nổi bật mỗi HTX |
| `/public/<htx>/seasons` | công khai | Lịch 12 tháng do HTX ghi |
| `/public/<htx>/style.css` | công khai | Stylesheet của trang khách (CSS tĩnh, không script; nằm dưới `/public/<htx>/` vì web chỉ phục vụ tiền tố công khai có mã HTX) |

Mọi thao tác ghi là `POST` rồi trả 303 về một trang dưới `/apps/tea-experience/`. Mọi link và form giữ `?theme=`. Trang không có JavaScript và không dùng cookie.

## Dữ liệu lõi và làm mới

Khách không có token nên không gọi được lõi. Mọi số liệu khách xem là **bản sao** do app lưu, và trưởng HTX làm mới bản sao đó bằng token của mình:

- Đọc đúng cột của lõi (nguồn: `apps/web/prisma/schema.prisma`, không dùng tài liệu cũ): `htx_profiles` (tên, địa chỉ, danh sách cây `crop_types`, `season_label`, diện tích), `households { id }` (đếm số hộ), `parcels` (mã thửa, cây `crop_type`, tâm thửa) và `parcel_crop_cycles` chưa thu hoạch (`harvested_at` trống: thửa đang trồng, lứa `season`).
- Số hộ thành viên được đếm trong app: role `manager` không có `allow_aggregations` trên `households`.
- Hết giờ 5 giây, lỗi mạng, dữ liệu sai dạng hoặc hồ sơ của HTX khác: không đổi bản sao, ghi `core_sync_log` với kết quả `ERROR` và báo lỗi trên trang. Nội dung trưởng HTX soạn vẫn còn.
- Thửa không có toạ độ hợp lệ bị bỏ và được đếm.
- Lõi không có tên thửa (dùng mã thửa làm tên), chứng nhận, tỉnh, huyện, xã. Chứng nhận và địa phương hiển thị do trưởng HTX nhập tay; không bao giờ bị làm mới ghi đè.

## Quyền và cách ly dữ liệu

- Mã HTX lấy từ token (trang nội bộ) hoặc từ URL (trang công khai). Form không bao giờ mang mã HTX.
- Mọi `id` trong URL đều kiểm thuộc đúng HTX; HTX khác nhận 404.
- Trang công khai không lộ: tên hộ, số điện thoại, mã thửa, toạ độ thửa, người làm đồng bộ, điểm hoặc gói đang ẩn, địa chỉ chi tiết. Chỉ điểm trưởng HTX đánh dấu công khai mới hiện.
- Địa chỉ lõi (`htx_intro.address`) chỉ trưởng HTX thấy. Khách chỉ thấy "Địa phương hiển thị", ô trưởng HTX tự nhập (ví dụ "Tân Cương, Đại Từ"), nên có thể để trống nếu không muốn hiện địa phương.
- Thông báo `?notice=` chỉ nhận khoá cố định; dữ liệu nhập được escape bằng Jinja2.

## Dữ liệu app tự lưu

Schema `app_tea_experience` (migration `migrations/001_init.sql`). Mọi bảng đều có `htx_code NOT NULL`; khoá ngoại gồm cả `htx_code`.

| Bảng | Nội dung |
| --- | --- |
| `htx_intro` | Bản sao từ lõi (tên, địa chỉ lõi, cây, lứa, diện tích, số hộ, thời điểm làm mới); do trưởng HTX nhập (giới thiệu, địa phương hiển thị, chứng nhận) |
| `core_parcels` | Bản sao tối thiểu của thửa (mã thửa làm tên, tâm, cây, lứa, có đang trồng không). Thay toàn bộ mỗi lần làm mới |
| `core_sync_log` | Lần làm mới, người làm (tên hiển thị), số thửa, kết quả |
| `sites` | Điểm tham quan: tên, mô tả, toạ độ, mã thửa tham chiếu (không có khoá ngoại), công khai, thứ tự |
| `experiences` | Gói trải nghiệm: tên, mô tả, thời lượng, giá tham khảo, tháng phù hợp, đang hiện, thứ tự |
| `experience_sites` | Gói và điểm liên quan |
| `season_notes` | Ghi chú mùa vụ, tối đa một dòng mỗi tháng |

App không lưu thông tin khách. Tên người làm đồng bộ và mã thửa chỉ trưởng HTX xem.

## Mạng và giới hạn

- Gọi lõi: `http://apisix:9081/api/data/graphql`, một lần mỗi lần làm mới, với header `Authorization` của trưởng HTX và `x-hasura-role: manager`.
- Liên kết ra ngoài: sang `tea-tour` (`/apps/tea-tour/public/<htx>`, chỉ là đường dẫn trình duyệt, app không gọi tea-tour) và sang OpenStreetMap ở nút "Mở trên bản đồ". Liên kết bản đồ chỉ chứa số (vĩ độ, kinh độ) đã kiểm.
- Không thấy số chỗ còn trống của tour: app không đọc bảng của `tea-tour`. Dòng "Nếu chưa có lịch, liên hệ HTX" luôn hiện kèm nút.
- Chưa có liên kết tới `/lot/<mã lô>`: cần mã lô cụ thể, để giai đoạn sau. Trang giới thiệu chỉ có dòng hướng dẫn quét QR.

## Ghi chú liên kết hệ sinh thái (sau này)

- **Mã tham chiếu:** `htx_code` (mã HTX) và `parcel_code` (mã thửa trong bản sao) là mã của lõi. Khi có tầng liên kết, app nên dùng đúng các mã này để nối với lõi và `tea-tour`, không tạo mã riêng.
- **Sang tea-tour:** đường dẫn `/apps/tea-tour/public/<htx>` đã có. Khi có sự kiện chung, tea-tour có thể báo số chỗ còn lại để trang này hiện được.
- **Sang trang lô chè:** khi có mã lô trên gói chè, thêm liên kết `/lot/<mã lô>` của lõi (không gọi lõi, chỉ là liên kết).
- Chưa có tích hợp nào ở giai đoạn 1: app không đợi lõi và không đọc bảng của app khác.

## Giao diện dùng chung

`tea_experience/appkit.py` và `tea_experience/templates/kit.html` là bản chép nguyên văn từ `platform/appkit/` (đừng sửa bản chép). `scripts/appkit-sync.sh` chưa liệt kê gói này, nên `make lint` chưa kiểm bản chép. Đó là bước của chủ dự án.

## Kiểm thử

Cần Postgres. Cách 1 (như `tea-tour`): Docker và image `opentea-dx-os/postgres:local`. Cách 2: một Postgres tạm đã chạy, đặt biến `TEA_EXPERIENCE_TEST_PG_URL` là URL superuser của Postgres đó.

```
cd miniapps/tea-experience
python -m pip install -r requirements-dev.txt
TEA_EXPERIENCE_TEST_PG_URL=postgresql://user:pass@127.0.0.1:5432/db python -m pytest tests -q -W error
```

Test hợp đồng (`tests/test_contract.py`) đọc `apps/web/prisma/schema.prisma` và metadata Hasura: mọi trường truy vấn lõi phải là cột thật và role `manager` phải đọc được. Nếu thêm cột sai, test đỏ.

Test kiểm: đầu vào (toạ độ, giá, thời lượng, tháng, độ dài, số điểm), `htx_code` từ token và cách ly HTX, trang công khai không lộ dữ liệu nhạy cảm, lõi lỗi vẫn hiện trang và giữ bản cũ, escape HTML, quyền theo vai trò, ràng buộc SQL (CHECK, khoá ngoại theo HTX).

Kiểm manifest (từ gốc repo, cần Docker để chạy `./dxos`): `./dxos validate miniapps/tea-experience`.

## Cài, gỡ

```
./dxos install miniapps/tea-experience
./dxos remove tea-experience            # giữ schema và dữ liệu
./dxos remove tea-experience --purge    # xoá schema app_tea_experience và role
```

## Gói nổi bật và trang chủ khách

- Trang chủ khách hiện: hero, dải số liệu, **Tour và trải nghiệm nổi bật** (tối đa 6 gói; chưa có gói nổi bật thì lấy 3 gói hiện mới nhất), điểm tham quan, lịch mùa vụ 12 tháng, chân trang.
- Migration `002_featured.sql` thêm `experiences.is_featured` (mặc định tắt). Trưởng HTX bật/tắt trong danh sách gói hoặc form sửa gói.
- Nút "Đặt chỗ" và "Lịch và đặt chỗ" chỉ là đường dẫn sang `/apps/tea-tour/public/<htx>`.

**Giới hạn (cố ý):** app này **không đọc được lịch tour có ngày giờ và số chỗ còn** của `tea-tour`, vì app không được đọc dữ liệu app khác. Trang chủ không hiện lịch khởi hành giả; khách bấm sang trang đặt chỗ của `tea-tour` để xem lịch thật. Việc hiện lịch thật nằm trong mục "Việc cần làm khi có cổng sự kiện" của `docs/specs/2026-11-15-ecosystem-integration.md`.
