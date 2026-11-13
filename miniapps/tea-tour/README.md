<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `tea-tour`: đặt tour đồi chè

Ban quản trị HTX tạo tour trải nghiệm đồi chè, khách du lịch đặt chỗ trên điện thoại không cần đăng nhập, nông hộ dẫn tour xem lịch của mình. Đặc tả: `docs/specs/2026-11-11-tier3-miniapps-design.md` §7. Cách viết một mini-app: `miniapps/hello/README.md`.

## Trang

| Đường dẫn (dưới `/apps/tea-tour`) | Ai vào | Nội dung |
| --- | --- | --- |
| `/` | `manager` | Tổng quan (Tour sắp diễn ra, Chỗ đã giữ, Chờ xác nhận, Khách tháng này), danh sách tour lọc `?show=upcoming\|past\|cancelled\|all`, phân trang 25 dòng; tạo tour trong khối mở ra (người dẫn chọn trong nông hộ của HTX, lấy qua Hasura) |
| `/bookings` | `manager` | Mọi lượt đặt của HTX, lọc `?status=` và tìm `?q=` theo mã, tên hoặc số điện thoại (tìm theo nghĩa đen, không có ký tự đại diện), phân trang |
| `/tours/<id>` | `manager` | Chi tiết tour, lượt đặt kèm số điện thoại; xác nhận hoặc huỷ lượt đặt, huỷ tour |
| `/tours/<id>/guests/export.csv` | `manager` | CSV khách của tour (Mã đặt chỗ, Khách, Số điện thoại, Số người, Ghi chú, Trạng thái) |
| `/tours/<id>/print` | `manager` | Danh sách đoàn để in: lượt đã xác nhận, cột điểm danh, tổng số khách |
| `/tours/<id>/edit` | `manager` | Sửa tour còn mở và chưa diễn ra; cùng kiểm tra như khi tạo |
| `/guide` | `farmer` | Tour sắp tới và tour đã diễn ra của mình, kèm số khách đã xác nhận |
| `/public/<htx>` | công khai | Tour dạng thẻ với số chỗ còn lại, form đặt chỗ |
| `/public/<htx>/booking?code=&phone=` | công khai | Tra cứu lượt đặt (các bước Chờ xác nhận, Đã xác nhận): phải đúng cả mã và số điện thoại |

Mọi thao tác ghi là `POST` và trả 303 về một trang dưới `/apps/tea-tour/`. Trang công khai không bao giờ hiện tên hay số điện thoại của khách khác, và trả cùng một thông báo khi sai mã hoặc sai số điện thoại.

## Đặt chỗ

- Số điện thoại: bỏ khoảng trắng, dấu chấm, gạch ngang; `+84` thành `0`; phải đúng `0` và 9 chữ số.
- Một lượt đặt chạy trong một transaction, khoá dòng tour (`SELECT ... FOR UPDATE`); chỗ đã dùng là tổng `party_size` của lượt `PENDING` và `CONFIRMED`. Đặt đồng thời không bao giờ vượt số chỗ.
- Từ chối: `Tour đã hết chỗ.`, `Tour đã đóng hoặc đã diễn ra.` (đã huỷ hoặc `starts_at <= now()`), `Không tìm thấy tour.` (tour không thuộc HTX trong URL). Không lưu gì.
- Mã đặt chỗ: 8 ký tự trong `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, sinh bằng `secrets`; trùng thì thử lại, tối đa 5 lần.
- Chỉ lượt `PENDING` của tour còn mở mới xác nhận được; lượt đã huỷ không mở lại. Xác nhận hoặc huỷ mà không đổi gì thì trang tour báo "Không có gì thay đổi".
- Sửa tour: không sửa tour đã huỷ hoặc đã diễn ra; số chỗ mới không được ít hơn số chỗ đã đặt, kiểm tra trong transaction có khoá dòng tour như khi đặt chỗ.
- Giờ nhập và hiển thị là giờ Việt Nam (UTC+7), lưu `timestamptz`. Giá hiển thị kiểu `250.000 ₫`.

## Dữ liệu và mạng

- Bảng `tours`, `bookings` trong schema `app_tea_tour` (`migrations/001_init.sql`), đều có `htx_code`; mọi truy vấn lọc theo `htx_code` của token (trang quản trị, trang dẫn tour) hoặc của URL (trang công khai).
- App đọc `DXOS_APP_DB_URL` do `./dxos install` ghi vào tệp env; role `app_tea_tour` chỉ có quyền trên schema của mình (tối đa 10 kết nối). App giữ tối đa 8 kết nối cùng lúc; chờ quá 2 giây thì trả 503 "Hệ thống đang bận". Khoá ngoại của `bookings` gồm cả `htx_code`, nên lượt đặt luôn cùng HTX với tour.
- Nông hộ lấy từ `http://apisix:9081/api/data/graphql` bằng header `Authorization` của người dùng và `x-hasura-role: manager`, hết giờ sau 5 giây. Khi lõi không trả lời, danh sách tour vẫn hiện và form tạo tour báo lỗi. App gọi lõi trước khi mở kết nối database, để lõi chậm không giữ kết nối.
- Giao diện: `/dxos-app.css`, `?theme=light|dark` đặt `data-theme` trên `<html>` và đi theo mọi link, form và chuyển hướng (như `hello`).

## Kiểm thử

Cần Docker và image `opentea-dx-os/postgres:local` (`docker build -t opentea-dx-os/postgres:local platform/postgres`); test dùng Postgres tạm và bước database của `platform/cli`:

```
cd miniapps/tea-tour
python -m pip install -r requirements-dev.txt
python -m pytest tests -q -W error
```

## Cài, gỡ

```
./dxos install miniapps/tea-tour
./dxos remove tea-tour            # giữ schema và dữ liệu
./dxos remove tea-tour --purge    # xoá cả schema app_tea_tour và role
```
