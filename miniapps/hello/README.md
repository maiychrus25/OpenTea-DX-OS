<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Mini-app `hello`: viết mini-app đầu tiên

`hello` là mini-app nhỏ nhất của DX-OS: khoảng 50 dòng Python, chỉ dùng thư viện chuẩn, không có database. Trang chào người dùng bằng tên, mã HTX và vai trò lấy từ access token. Đặc tả đầy đủ ở `docs/specs/2026-11-11-tier3-miniapps-design.md`.

## 1. Cấu trúc thư mục

```
miniapps/hello/
├── app.yaml     # manifest: id, phiên bản, giấy phép, route, menu
├── Dockerfile   # image của app
├── app.py       # máy chủ HTTP
└── test_app.py  # kiểm thử: python -m unittest (trong thư mục này)
```

## 2. Manifest `app.yaml`

- `id` khớp `^[a-z][a-z0-9-]{1,30}$`; mọi route của app nằm dưới `/apps/<id>/`.
- `requires.core` là phiên bản lõi tối thiểu (`apps/web/package.json`).
- `license` phải là giấy phép OSI (MIT, Apache-2.0, ...).
- `runtime.build: .` build image từ thư mục này; `runtime.port` là cổng app nghe; `runtime.health` là đường dẫn health check.
- `routes.protected` liệt kê tiền tố đường dẫn và các vai trò được vào (`farmer`, `officer`, `manager`). Gateway kiểm token và vai trò trước khi chuyển request cho app.
- `menu` thêm mục vào menu của ứng dụng chính.

Kiểm tra manifest: `./dxos validate miniapps/hello`.

## 3. Viết app

- Gateway cắt tiền tố `/apps/<id>` trước khi chuyển request: app nhận `/`, `/echo`, `/healthz`.
- Mọi link và form trong trang phải ghi lại tiền tố `/apps/<id>`, vì trình duyệt đi qua web và gateway.
- Đọc claim từ header `Authorization: Bearer <token>` (`name` hoặc `preferred_username`, `htx_code`, `realm_access.roles`). App không kiểm chữ ký: chỉ gateway với tới được container của app, và gateway đã kiểm token.
- Trang không chạy JavaScript (`script-src 'none'`); dùng form HTML và chuyển hướng 303.
- Thoát HTML mọi dữ liệu do người dùng gửi (`html.escape`).
- Dùng stylesheet chung `/dxos-app.css`.

## 4. Ràng buộc container

`dxos` sinh compose cho app với các thiết lập cố định: user `10001:10001`, root filesystem chỉ đọc (chỉ `/tmp` ghi được), bỏ mọi capability, 256 MB RAM, 0,5 CPU, không mở cổng ra máy chủ, chỉ nằm trên mạng nội bộ `dxos-apps-net` (không ra internet). Image phải có `python` cho health check, và mọi tệp của app phải đọc được bởi uid 10001.

## 5. Cài, xem, gỡ

```
./dxos install miniapps/hello   # kiểm tra, sinh route và compose, chạy container, đăng ký
./dxos list                     # app đã cài, phiên bản, trạng thái container
./dxos remove hello             # tắt container, gỡ route, xoá đăng ký
```

Nếu container không healthy, `install` hoàn tác mọi bước và thoát với mã 1. Cài lại một app đã cài chỉ bảo đảm container đang chạy.
