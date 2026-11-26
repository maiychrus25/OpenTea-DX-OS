<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# MCP bridge cho agent bên ngoài

`dxos_mcp.py` cho phép một MCP client (Claude Desktop, Claude Code, Codex hoặc client khác) dùng các công cụ của trợ lý DX-OS với đúng quyền của chính bạn. Bridge chỉ dùng thư viện chuẩn của Python 3.12 và nói MCP qua stdio.

Client có các công cụ đọc của trợ lý và đúng một công cụ ghi là `create_proposal`. Mọi đề xuất đều chờ bạn xác nhận trên web hoặc Telegram. Không có công cụ nào thực thi thao tác khi client gọi.

## Đăng nhập

Chạy một lần (và chạy lại khi phiên hết hạn):

```sh
python3 platform/mcp/dxos_mcp.py login --server https://<địa-chỉ-web>
```

Lệnh in một đường dẫn và một mã. Mở đường dẫn, đăng nhập bằng tài khoản Keycloak của bạn và nhập mã. Khi được duyệt, lệnh lưu token vào `~/.config/dxos-mcp/token.json` với quyền `0600`. Bridge tự làm mới token trước khi hết hạn. Nếu refresh token cũng hết hạn, bridge trả lời kèm thông báo `Phiên đăng nhập đã hết...` và bạn chạy lại `login`.

Môi trường phát triển (Keycloak mở ở cổng 8080, gateway ở cổng 9080):

```sh
python3 platform/mcp/dxos_mcp.py login --server http://localhost:9080 \
  --issuer http://localhost:8080/realms/agrimarket
```

`--issuer` mặc định là `<server>/auth/realms/agrimarket`. Chỉ đổi khi Keycloak không nằm sau đường dẫn đó.

Bridge không bao giờ in token ra stdout hay stderr. Stdout chỉ dành cho giao thức MCP khi chạy `serve`.

## Cấu hình client

Thay `/ĐƯỜNG-DẪN-TUYỆT-ĐỐI` bằng đường dẫn đầy đủ tới thư mục repo.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "dxos": {
      "command": "python3",
      "args": ["/ĐƯỜNG-DẪN-TUYỆT-ĐỐI/platform/mcp/dxos_mcp.py", "serve"]
    }
  }
}
```

**Claude Code:**

```sh
claude mcp add dxos -- python3 /ĐƯỜNG-DẪN-TUYỆT-ĐỐI/platform/mcp/dxos_mcp.py serve
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.dxos]
command = "python3"
args = ["/ĐƯỜNG-DẪN-TUYỆT-ĐỐI/platform/mcp/dxos_mcp.py", "serve"]
```

## Lưu ý

- Bridge gọi `/api/mcp/tools` và `/api/mcp/tools/<tên>` trên gateway. Gateway chỉ nhận token có `azp` là `dxos-mcp`.
- Vai trò, HTX và trạng thái tài khoản được web đọc mỗi lần gọi. Tài khoản bị khóa hoặc đổi vai trò có hiệu lực ngay.
- Đề xuất tạo từ MCP có người gửi là bạn. Chỉ người có quyền duyệt loại đề xuất đó mới xác nhận được.
