<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Chính sách bảo mật / Security Policy

## Phiên bản được hỗ trợ / Supported versions

| Phiên bản | Hỗ trợ vá bảo mật |
| --- | --- |
| Bản phát hành mới nhất trên [GitHub Releases](https://github.com/maiychrus25/OpenTea-DX-OS/releases) | ✅ |
| Nhánh `main` | ✅ (bản vá đi vào bản phát hành kế tiếp) |
| Các bản cũ hơn | ❌ |

## Báo cáo lỗ hổng / Reporting a vulnerability

**Không** báo lỗ hổng bảo mật qua issue công khai.

1. Dùng tính năng **Private vulnerability reporting** của GitHub: tab **Security → Report a vulnerability** của repository.
2. Mô tả: thành phần bị ảnh hưởng (gateway, Keycloak, Hasura, lưu trữ, ứng dụng web…), phiên bản/commit, các bước tái hiện và mức độ ảnh hưởng (ví dụ: lộ dữ liệu giữa các HTX).
3. Không đính kèm dữ liệu cá nhân thật, mật khẩu hay token còn hiệu lực.

Nhóm **OpenTea Developers** sẽ xác nhận trong vòng 3 ngày làm việc, đánh giá mức độ và thông báo kế hoạch khắc phục. Sau khi có bản vá, lỗ hổng được công bố qua GitHub Security Advisory và ghi vào `CHANGELOG.md`.

## Nguyên tắc bảo mật của nền tảng / Platform security principles

- **Zero-Trust tại biên:** mọi API lõi chỉ truy cập qua APISIX với JWT do Keycloak cấp (kiểm tra chữ ký, issuer, audience `dx-os-core`); gateway loại bỏ header `x-hasura-admin-secret` từ phía client.
- **Cách ly thuê ước:** dữ liệu được lọc theo claim `htx_code` (chỉ admin Keycloak được gán) bằng quyền cấp dòng của Hasura; Hasura chỉ cho đọc.
- **MFA:** TOTP bắt buộc cho Ban quản trị và cán bộ kỹ thuật.
- **Triển khai:** production chỉ chạy image dựng sẵn đã ghim phiên bản; phải thay toàn bộ secret mặc định (Hasura từ chối khởi động với admin secret mẫu).
