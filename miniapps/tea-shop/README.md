<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `tea-shop`: cửa hàng chè

Ban quản trị HTX quản lý sản phẩm chè và xử lý đơn hàng; khách đặt hàng trên điện thoại không cần đăng nhập, rồi tra đơn bằng mã đơn và số điện thoại. Thanh toán khi nhận hàng. Đặc tả: `docs/specs/2026-11-12-miniapp-store-design.md` §5.2. Cách viết một mini-app: `miniapps/hello/README.md`.

## Trang

| Đường dẫn (dưới `/apps/tea-shop`) | Ai vào | Nội dung |
| --- | --- | --- |
| `/` | `manager` | Tổng quan: đơn chờ xác nhận, đang giao, doanh thu tháng (đơn hoàn tất), sắp hết hàng (tồn từ 5 trở xuống); biểu đồ doanh thu 14 ngày; năm sản phẩm bán chạy; 10 đơn và 10 sản phẩm mới nhất; thêm sản phẩm |
| `/orders` | `manager` | Danh sách đơn: lọc `status`, `from`, `to`, tìm `q` (mã, tên khách, số điện thoại), 25 dòng một trang (`page`) |
| `/orders/export.csv` | `manager` | CSV của danh sách đang lọc: Mã đơn, Đặt lúc, Khách, Số điện thoại, Địa chỉ, Tổng tiền, Trạng thái |
| `/orders/<id>/print` | `manager` | Phiếu giao hàng để in (mã đơn, khách, điện thoại, địa chỉ, dòng hàng, tổng, thu tiền khi nhận) |
| `/products` | `manager` | Danh sách sản phẩm: tìm `q` theo tên, lọc `show` (`all`, `active`, `hidden`, `low`), phân trang |
| `/products/<id>/edit` | `manager` | Sửa tên, quy cách, giá, tồn kho, mã lô, đang bán hay ngừng |
| `/orders/<id>` | `manager` | Chi tiết đơn kèm họ tên, điện thoại, địa chỉ; các bước trạng thái; chuyển trạng thái hoặc huỷ |
| `/public/<htx>` | công khai | Sản phẩm đang bán dạng thẻ, ô số lượng cho từng sản phẩm, form đặt hàng |
| `/public/<htx>/order?code=&phone=` | công khai | Tra đơn: phải đúng cả mã và số điện thoại; hiện các bước Mới, Đã xác nhận, Đang giao, Hoàn tất (đơn huỷ hiện nhãn Đã huỷ) |

Mọi thao tác ghi là `POST` và trả 303 về một trang dưới `/apps/tea-shop/`. Trang công khai không bao giờ hiện tên, số điện thoại hay địa chỉ của khách khác, và trả cùng một thông báo khi sai mã hoặc sai số điện thoại. Sản phẩm có mã lô có link "Xem nguồn gốc" tới `/lot/<mã lô>` của ứng dụng chính.

## Đặt hàng

- Số điện thoại: bỏ khoảng trắng, dấu chấm, gạch ngang; `+84` thành `0`; phải đúng `0` và 9 chữ số. Mỗi sản phẩm đặt từ 0 đến 99.
- Một đơn chạy trong một transaction: khoá các sản phẩm `FOR UPDATE` theo thứ tự `id` tăng dần (hai đơn đặt cùng hai sản phẩm theo thứ tự ngược nhau không bao giờ khoá chéo), rồi trừ tồn kho. Đặt đồng thời không bao giờ bán vượt tồn kho.
- Từ chối, không lưu gì: `Chọn ít nhất một sản phẩm.`, `Sản phẩm <tên> chỉ còn <n>.`, sản phẩm ngừng bán hoặc của HTX khác.
- Tên, quy cách và giá được sao vào từng dòng đơn lúc đặt; sửa sản phẩm sau đó không đổi đơn cũ. Tổng tiền là số nguyên VND.
- Mã đơn: 8 ký tự trong `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, sinh bằng `secrets`; trùng thì thử lại, tối đa 5 lần.
- Trạng thái: `NEW` → `CONFIRMED` → `SHIPPING` → `DONE`. Huỷ được từ `NEW`, `CONFIRMED`, `SHIPPING` và trả lại tồn kho; đơn `DONE` hoặc `CANCELLED` không đổi nữa.
- Sửa sản phẩm không ghi đè tồn kho: form nhập số điều chỉnh (+/−, từ -9999 đến 9999) và `UPDATE ... stock = stock + delta` chạy một câu, nên đơn đặt giữa lúc mở và lưu form không bị mất. Điều chỉnh làm tồn kho âm thì bị từ chối. Thêm sản phẩm mới vẫn nhập tồn kho tuyệt đối.

## Dữ liệu và mạng

- Bảng `products`, `orders`, `order_items` trong schema `app_tea_shop` (`migrations/001_init.sql`), đều có `htx_code`; mọi truy vấn lọc theo `htx_code` của token (trang quản trị) hoặc của URL (trang công khai). Khoá ngoại của `order_items` gồm cả `htx_code`, nên dòng đơn luôn cùng HTX với đơn và sản phẩm.
- App đọc `DXOS_APP_DB_URL` do `./dxos install` ghi vào tệp env; role `app_tea_shop` chỉ có quyền trên schema của mình (tối đa 10 kết nối). App giữ tối đa 8 kết nối cùng lúc; chờ quá 2 giây thì trả 503 "Hệ thống đang bận". App không gọi lõi nên không có `core_client`.
- Giao diện: `/dxos-app.css`, `?theme=light|dark` đặt `data-theme` trên `<html>` và đi theo mọi link, form và chuyển hướng (như `hello`). Không có JavaScript.

## Kiểm thử

Cần Docker và image `opentea-dx-os/postgres:local` (`docker build -t opentea-dx-os/postgres:local platform/postgres`); test dùng Postgres tạm và bước database của `platform/cli`:

```
cd miniapps/tea-shop
python -m pip install -r requirements-dev.txt
python -m pytest tests -q -W error
```

## Cài, gỡ

```
./dxos install miniapps/tea-shop
./dxos remove tea-shop            # giữ schema và dữ liệu
./dxos remove tea-shop --purge    # xoá cả schema app_tea_shop và role
```
