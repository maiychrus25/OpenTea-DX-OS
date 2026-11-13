<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `farm-supply`: vật tư mua chung

Ban quản trị HTX mở đợt đăng ký mua chung phân bón và thuốc bảo vệ thực vật; nông hộ ghi số lượng cần mua; ban quản trị đóng đợt, xem tổng hợp theo mặt hàng và theo hộ, rồi đánh dấu đã giao, đã thanh toán. Đặc tả: `docs/specs/2026-11-12-miniapp-store-design.md` §5.3. Cách viết một mini-app: `docs/miniapps.md`.

## Trang

| Đường dẫn (dưới `/apps/farm-supply`) | Ai vào | Nội dung |
| --- | --- | --- |
| `/` | `manager` | Các đợt của HTX trong token, mở đợt mới |
| `/rounds/<id>` | `manager` | Mặt hàng, tổng hợp theo mặt hàng và theo hộ, thêm/sửa mặt hàng, đóng đợt, đánh dấu đã giao / đã thanh toán |
| `/mine` | `farmer` | Đợt đang nhận đăng ký (một ô số lượng cho mỗi mặt hàng), đợt đã qua kèm số tiền và trạng thái |
| `/healthz` | gateway | `ok` |

Mọi thao tác ghi là `POST` và trả 303 về một trang dưới `/apps/farm-supply/`.

## Quy tắc

- Hộ đăng ký, đổi hoặc bỏ số lượng chỉ khi đợt `OPEN` và `now() < deadline`; ngược lại: `Đợt đăng ký đã đóng.` Việc kiểm tra và ghi nằm trong một transaction, khoá dòng đợt bằng `FOR SHARE`; đóng đợt cập nhật dòng đó nên chờ các lượt đăng ký đang chạy, và không có yêu cầu nào được ghi sau khi đóng.
- Nông hộ của người đăng ký chỉ lấy từ Hasura với `x-hasura-role: farmer` (`households[0]`), không bao giờ lấy từ form. Token chưa gắn nông hộ thì trang `/mine` báo như vậy và không ghi gì.
- Số lượng: 0 đến 10.000, tối đa một chữ số thập phân, dấu phẩy hoặc dấu chấm (`2,5`); để trống là bỏ mặt hàng.
- Mặt hàng thêm được khi đợt còn `OPEN`; tên, đơn vị, đơn giá chỉ sửa được khi chưa có hộ nào đăng ký (kiểm tra dưới khoá dòng đợt).
- Đóng đợt là một chiều, và tạo dòng đối soát cho từng hộ đã đăng ký. Đánh dấu đã giao / đã thanh toán chỉ có cho đợt `CLOSED` và hộ có đăng ký.
- Số tiền một hộ phải trả = tổng `round(số lượng × đơn giá)` của các mặt hàng hộ đăng ký, đồng nguyên. Hạn đăng ký nhập và hiển thị theo giờ Việt Nam (UTC+7), lưu `timestamptz`.

## Dữ liệu và mạng

- Bảng `rounds`, `items`, `requests`, `settlements` trong schema `app_farm_supply` (`migrations/001_init.sql`), đều có `htx_code`; khoá ngoại gồm cả `htx_code` nên dữ liệu con luôn cùng HTX với đợt. Mọi truy vấn lọc theo `htx_code` của token.
- App đọc `DXOS_APP_DB_URL`; giữ tối đa 8 kết nối cùng lúc, chờ quá 2 giây thì trả 503. Nông hộ lấy từ `http://apisix:9081/api/data/graphql` bằng token của chính người dùng, hết giờ sau 5 giây, và gọi trước khi mở kết nối database.

## Kiểm thử

Cần Docker và image `opentea-dx-os/postgres:local`:

```
cd miniapps/farm-supply
python -m pip install -r requirements-dev.txt
python -m pytest tests -q -W error
```

## Cài, gỡ

```
./dxos install miniapps/farm-supply
./dxos remove farm-supply            # giữ schema và dữ liệu
./dxos remove farm-supply --purge    # xoá cả schema app_farm_supply và role
```
