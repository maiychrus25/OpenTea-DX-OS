<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `leaf-purchase`: thu mua búp tươi

Cán bộ HTX ghi phiếu cân chè búp tươi của từng hộ, ban quản trị đặt giá theo loại chè, chốt kỳ và theo dõi chi trả, nông hộ xem phiếu và tiền của chính mình. Đặc tả: `docs/specs/2026-11-12-miniapp-store-design.md` §5. Cách viết một mini-app: `docs/miniapps.md`.

## Trang

| Đường dẫn (dưới `/apps/leaf-purchase`) | Ai vào | Nội dung |
| --- | --- | --- |
| `/?day=YYYY-MM-DD` | `officer`, `manager` | Phiếu cân của một ngày (mặc định hôm nay), tổng ký và tiền trong ngày, form ghi phiếu |
| `/tickets/<id>/edit` | `officer`, `manager` | Sửa phiếu chưa vào kỳ; `POST /tickets/<id>/void` huỷ phiếu |
| `/prices` | `manager` | Loại chè và giá mỗi ký; thêm loại, đổi giá, tạm ngưng |
| `/periods` | `manager` | Các kỳ đã chốt, form chốt kỳ mới |
| `/periods/<id>` | `manager` | Tiền từng hộ trong kỳ, đánh dấu đã trả |
| `/mine` | `farmer` | Phiếu cân và chi trả của hộ mình |

Mọi thao tác ghi là `POST` và trả 303 về một trang dưới `/apps/leaf-purchase/`.

## Quy tắc

- Thành tiền = `round(kg * giá)` (VND nguyên); giá được sao chép từ loại chè lúc ghi phiếu, đổi giá sau đó không đổi phiếu cũ. Số ký nhận dấu phẩy (`12,5`), tối đa 5000, một chữ số lẻ.
- Hộ của phiếu phải nằm trong danh sách nông hộ Hasura trả cho người gọi (vai trò `x-hasura-role` của chính họ); id giả trả 400.
- Chỉ sửa hoặc huỷ được phiếu chưa vào kỳ (`period_id IS NULL`) và chưa huỷ. Không ghi hoặc đổi phiếu sang ngày thuộc kỳ đã chốt.
- Chốt kỳ chạy một transaction dưới `pg_advisory_xact_lock(hashtext(htx_code))` (ghi và sửa phiếu dùng cùng khoá): từ chối khi trùng ngày với kỳ đã chốt hoặc không có phiếu nào; ngược lại tạo kỳ, gắn mọi phiếu chưa huỷ trong khoảng và ghi một dòng chi trả cho mỗi hộ. Phiếu đã huỷ không được trả.
- `/mine`: hộ của nông dân là `households[0]` Hasura trả với vai trò `farmer`; chưa gắn hộ thì hiện thông báo.

## Dữ liệu và mạng

- Bảng `grades`, `tickets`, `periods`, `payouts` trong schema `app_leaf_purchase` (`migrations/001_init.sql`), đều có `htx_code`; mọi truy vấn lọc theo `htx_code` của token. Khoá ngoại gồm cả `htx_code`, nên phiếu luôn cùng HTX với loại chè và kỳ.
- App đọc `DXOS_APP_DB_URL`; tối đa 8 kết nối cùng lúc, chờ quá 2 giây thì trả 503 "Hệ thống đang bận".
- Nông hộ lấy từ `http://apisix:9081/api/data/graphql` bằng header `Authorization` của người dùng, hết giờ sau 5 giây, và luôn gọi trước khi mở kết nối database.
- Giao diện: `/dxos-app.css`, không JavaScript, `?theme=light|dark` đi theo mọi link, form và chuyển hướng. Giờ hiển thị là giờ Việt Nam (UTC+7), giá kiểu `8.000 ₫`.

## Kiểm thử

Cần Docker và image `opentea-dx-os/postgres:local`:

```
cd miniapps/leaf-purchase
python -m pip install -r requirements-dev.txt
python -m pytest tests -q -W error
```

## Cài, gỡ

```
./dxos install miniapps/leaf-purchase
./dxos remove leaf-purchase            # giữ schema và dữ liệu
./dxos remove leaf-purchase --purge    # xoá cả schema app_leaf_purchase và role
```
