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
| `/products/<id>/edit` | `manager` | Sửa tên, quy cách, giá, tồn kho, mã lô, đang bán hay ngừng; chọn lô của HTX và nhập trọng lượng tịnh mỗi gói (g) |
| `/promotions` | `manager` | Khuyến mãi của HTX (sản phẩm, % giảm, từ ngày, đến ngày, trạng thái) và nút Kết thúc cho khuyến mãi đang chạy (`POST /promotions/<id>/end`) |
| `/orders/<id>` | `manager` | Chi tiết đơn kèm họ tên, điện thoại, địa chỉ; các bước trạng thái; chuyển trạng thái hoặc huỷ |
| `/agent/suggestions` | token của `dxos-agent` (role `agent`) | Đề xuất cho trợ lý: sản phẩm đang bán, tồn từ 20 gói trở lên, 21 ngày không có dòng đơn nào (đơn huỷ không tính) và chưa có khuyến mãi thì đề xuất giảm 10% trong 7 ngày; tối đa 10 đề xuất |
| `POST /agent/actions/promotion-create` | trưởng HTX duyệt đề xuất | Chỉ web gọi, bằng token `dxos-apps-actor` kèm ba header `X-DXOS-Acting-*`. Body `{product_id, discount_pct 5-30, days 1-14}`; trả `{promotion_id, ends_on}`; 400 sai dữ liệu, 404 không có sản phẩm trong HTX, 409 `Sản phẩm đang có khuyến mãi.` |
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

## Khuyến mãi

- Bảng `promotions` (`migrations/002_promotions.sql`): giảm theo phần trăm (5 đến 30) cho một sản phẩm, từ ngày tạo đến `ends_on`, tính cả hai ngày theo giờ Việt Nam. `ended_at` ghi lúc trưởng HTX kết thúc sớm; dòng vẫn giữ làm lịch sử. Mỗi sản phẩm chỉ có một khuyến mãi chạy cùng lúc: tạo trong transaction khoá dòng sản phẩm, trùng thì bị từ chối.
- Trang công khai hiện giá gốc gạch ngang, giá đã giảm (làm tròn lên đến đồng) và nhãn `-n%`. Đơn tính theo giá đã giảm và dòng đơn lưu giá đó, nên sửa hay kết thúc khuyến mãi sau đó không đổi đơn cũ.
- Khối `agent` trong `app.yaml` khai báo hành động `promotion.create` (`money: true`, người duyệt là `manager`). App tự kiểm lại khi hành động chạy như khi bấm trên giao diện: dữ liệu, sản phẩm thuộc HTX của người duyệt, không trùng khuyến mãi. Khuyến mãi ghi người duyệt vào `created_by`.
- App kit: `appkit.read_claims(authorization, headers)` chỉ tin ba header `X-DXOS-Acting-*` khi token có `azp` là `dxos-apps-actor` và role trong header là `manager` hoặc `officer`; với token khác thì bỏ qua header.

## Bán từ lô của HTX

- `migrations/003_core_lots.sql`: `products.lot_id` và `products.pack_net_g` (1 đến 100000 gam), cùng có hoặc cùng rỗng; `orders.core_order_no`. Mã lô truy xuất cũ (`lot_code`) vẫn dùng cho link nguồn gốc; khi chọn lô mà ô đó để trống, app điền mã của lô.
- Trang sửa sản phẩm lấy danh sách lô từ `GET /api/internal/apps/sales/sellable-lots` (mã lô, hạng, còn bao nhiêu kg). Lõi không trả lời được thì danh sách rỗng và trang vẫn lưu được.
- Xác nhận đơn `NEW` có dòng gắn lô: app gửi `POST /api/internal/apps/sales/retail-orders` với `external_ref` là id đơn và mỗi dòng `{lot_id, pack_count, pack_net_g, amount_vnd}`; lõi trừ `pack_count x pack_net_g` gam (4 gói 250 g là đúng 1.000 g). Thành công thì lưu `core_order_no` và chuyển `CONFIRMED`. Gửi lại cùng `external_ref` (sau khi quá thời gian chờ) không tạo đơn thứ hai. Đơn không có dòng gắn lô chuyển trạng thái như trước, không gọi lõi.
- Huỷ đơn đã có `core_order_no` gọi `POST .../retail-orders/<external_ref>/cancel` trước; lõi báo không có đơn đó thì coi như xong.
- Lỗi hiện trên trang đơn và đơn giữ nguyên trạng thái: `Lô <mã> chỉ còn <kg> kg, không đủ cho đơn này.` (409), `Chưa ghi được vào sổ bán hàng của HTX. Thử lại sau.` (503, lõi không trả lời hoặc 5xx).
- Cấu hình: `DXOS_CORE_INTERNAL_URL` (mặc định `http://apisix:9081`); app chuyển nguyên header `Authorization` của người dùng, chờ tối đa 5 giây, chỉ dùng thư viện chuẩn. Chỉ trưởng HTX xác nhận và huỷ đơn.

## Dữ liệu và mạng

- Bảng `products`, `orders`, `order_items`, `promotions` trong schema `app_tea_shop` (`migrations/001_init.sql`), đều có `htx_code`; mọi truy vấn lọc theo `htx_code` của token (trang quản trị) hoặc của URL (trang công khai). Khoá ngoại của `order_items` gồm cả `htx_code`, nên dòng đơn luôn cùng HTX với đơn và sản phẩm.
- App đọc `DXOS_APP_DB_URL` do `./dxos install` ghi vào tệp env; role `app_tea_shop` chỉ có quyền trên schema của mình (tối đa 10 kết nối). App giữ tối đa 8 kết nối cùng lúc; chờ quá 2 giây thì trả 503 "Hệ thống đang bận". Từ 0.4.0 app gọi API nội bộ của lõi, xem mục Bán từ lô của HTX.
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
