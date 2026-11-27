<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 OpenTea Developers
-->
# Đặc tả thiết kế — GĐ1 dự án con 2: Một tài khoản nhiều vai, vai Kế toán và Quản trị nền tảng

> **Trạng thái:** Bản thiết kế (2026-11-28). Nhánh `feat/phase1-value-chain`.
> **Căn cứ:** [product-roadmap.md](../product-roadmap.md) §3 `[H]`, §5 GĐ1 mục 5, §6; [ADR 0005](../adr/0005-multi-tenant-tea-value-chain-dxos.md) quyết định 1; DEV-013.
> **Quyết định của chủ dự án (2026-11-28):** `htx_memberships` cùng bộ chuyển vai; thêm vai `accountant` và `platform_admin`; chuyển cấu hình LLM và ngân sách USD sang `platform_admin`; TOTP của trưởng HTX và cán bộ thành tuỳ chọn (không chặn lần đăng nhập đầu); mời thành viên không bắt buộc email.

## 1. Mục đích

Ở HTX nhỏ, một người thường giữ nhiều việc: giám đốc kiêm cán bộ kỹ thuật, kế toán kiêm chủ hộ. Hệ thống phải cho **một tài khoản (một số điện thoại) giữ nhiều vai trong HTX của mình** và chuyển vai một chạm. Dự án con này cũng tạo hai vai mới:

- **`accountant` (kế toán, bàn cân):** người dùng chính của dự án con 3 và 4.
- **`platform_admin` (quản trị nền tảng SaaS):** tách các cấu hình kỹ thuật khỏi màn hình của giám đốc HTX.

Không ai bị ép TOTP hay email chỉ để đăng nhập được.

## 2. Mục tiêu, ngoài phạm vi, điều cấm

**Mục tiêu**
- M1. Bảng `htx_memberships` và các luồng ghi bảng này. Phiên đăng nhập biết mọi vai của người dùng và vai đang dùng. Có bộ chuyển vai.
- M2. Vai `accountant`: có vai trong Keycloak, có khu `/accountant` với trang tổng quan khung. Màn hình nghiệp vụ thuộc dự án con 3 và 4.
- M3. Vai `platform_admin`, khu `/platform` gồm:
  - danh sách HTX, tạo HTX cùng tài khoản trưởng HTX đầu tiên;
  - cấu hình nhà cung cấp LLM, mô hình và ngân sách USD của từng HTX, chuyển từ màn hình trưởng HTX sang;
  - danh mục thuốc BVTV dùng chung: sửa mức sàn cách ly theo nhãn đã đối chiếu và gỡ cờ "cần đối chiếu nhãn". Bảng dữ liệu và route đọc do dự án con 1 làm; dự án con này làm trang `/platform/pesticides` và route ghi `PUT /api/platform/pesticides/[id]`.
- M4. TOTP tuỳ chọn cho mọi vai; mời thành viên và tạo HTX không cần email.
- M5. Trưởng HTX gán và gỡ vai (`farmer`, `officer`, `accountant`) cho thành viên của HTX mình.

**Ngoài phạm vi**
- Một người thuộc nhiều HTX (đổi HTX). Bảng vẫn có `htx_profile_id` để mở rộng sau.
- Gói dịch vụ và hạn mức (plan); thống kê vùng ẩn danh.
- Vai mới trong mini-app (enum vai của manifest giữ nguyên ba vai).
- Kênh Telegram cho vai mới. `telegram_links.role` vẫn lưu vai lúc liên kết.

**Điều cấm**
- Vai được dùng mà không có trong token Keycloak (`realm_access.roles`), hoặc vai hoạt động lấy từ request do client gửi lên mà không kiểm lại phía server.
- `platform_admin` đọc hay ghi dữ liệu nghiệp vụ của HTX (nhật ký, phiếu cân, tiền) qua các route nghiệp vụ. Vai này chỉ quản trị.
- Đặt tên vai là `admin`: Hasura coi `admin` là siêu quản trị, và test realm cấm.
- Làm hỏng đăng nhập hay quyền của các tài khoản một vai đang có.

## 3. Các cách đã cân nhắc

| Việc | Cách chọn | Cách khác |
|---|---|---|
| Nguồn sự thật về vai | **Vai trong Keycloak (`realm_access.roles`) là nguồn xác thực.** Gateway, Hasura và mini-app đã đọc token này. `htx_memberships` ghi lại vai theo HTX, được ghi cùng lúc với Keycloak trong mọi luồng mời, duyệt và gán vai, và được tự bổ sung khi người dùng đăng nhập. | (a) Chỉ dùng bảng: gateway và Hasura không đọc được bảng. (b) Chỉ dùng Keycloak, không có bảng: trái quyết định của chủ dự án, và không có chỗ cho nhiều HTX sau này. |
| Vai hoạt động | **Lưu trong JWT phiên của NextAuth (`activeRole`), đổi bằng route `POST /api/session/role`.** Server kiểm vai thuộc `roles` của token rồi gọi `update()` của NextAuth. | Cookie riêng: thêm một nguồn trạng thái phải đồng bộ. |
| Khu của `platform_admin` | **Tiền tố `/platform`, dùng Prisma, không qua Hasura.** | Dùng chung màn hình trưởng HTX có cờ: dễ lộ dữ liệu nghiệp vụ. |
| TOTP | **Bỏ required action `CONFIGURE_TOTP` khi tạo người dùng và trong tài khoản mẫu.** Người dùng vẫn tự bật được trong trang tài khoản Keycloak. | Bỏ hẳn OTP: mất lựa chọn bảo mật cho ai muốn dùng. |

Các lựa chọn trên là của em. Chủ dự án giao cách làm ("dốc sức làm đạt kết quả tốt và nhanh").

## 4. Thiết kế

### 4.1. Dữ liệu

```prisma
model HtxMembership {
  id               String     @id @default(cuid())
  keycloak_user_id String
  htx_profile_id   String
  roles            String[]   // tập con của farmer, officer, accountant, manager
  created_at       DateTime   @default(now())
  updated_at       DateTime   @updatedAt
  htx_profile      HtxProfile @relation(fields: [htx_profile_id], references: [id])
  @@unique([keycloak_user_id, htx_profile_id])
  @@index([htx_profile_id])
  @@map("htx_memberships")
}
```

- **Migration:** thêm bảng.
- **Kiểm toán:** thêm `htx_memberships` vào danh sách bảng ở `platform/postgres/init/03-audit-triggers.sql`.
- **Không backfill bằng SQL** (SQL không đọc được Keycloak). Thay vào đó, khi một người đăng nhập mà chưa có dòng membership cho HTX trong token, callback `jwt` lúc đăng nhập tạo dòng đó từ `realm_access.roles` (lọc vai người) và `htx_code`.
- `platform_admin` không có dòng membership: vai này không thuộc HTX nào.

### 4.2. Vai và token

- **Keycloak** (`docker/keycloak/realm-agrimarket.json`):
  - Thêm realm role `accountant` và `platform_admin`.
  - Thêm người dùng mẫu `accountant_tc` (vai `accountant`, `htx_code` TC) và `platform_admin` (vai `platform_admin`, không có `htx_code`). Mật khẩu mẫu theo đúng cách các người dùng mẫu khác.
- **Tên vai:** các vai người dùng là `farmer`, `officer`, `accountant`, `manager`, `platform_admin`. Thêm vào mọi chỗ đang liệt kê ba vai mà vai mới phải đi qua:
  - kiểu dữ liệu trong `types/next-auth.d.ts`;
  - `RECOGNIZED_ROLES` trong `middleware.ts`;
  - `Tenant.role` trong `lib/api/tenant.ts`;
  - `roleFromRealmRoles` (được thay bằng các hàm ở dưới);
  - `app/unauthorized/page.tsx`;
  - `AppShell` (nhãn vai).

  Các chỗ chỉ áp cho ba vai cũ thì giữ nguyên: enum vai trong manifest mini-app, Telegram, agent.
- **Hàm vai** (đặt trong `lib/auth/roles.ts`):
  - `rolesFromRealmRoles(roles: unknown): HumanRole[]`: trả mọi vai người có trong token.
  - `defaultActiveRole(roles: HumanRole[]): HumanRole | undefined`: chọn vai mặc định theo thứ tự ưu tiên `manager` > `officer` > `accountant` > `farmer` > `platform_admin`.
- **Phiên:**
  - JWT và `session.user` có thêm `roles: HumanRole[]` và giữ `role` với nghĩa **vai hoạt động**, để hơn 50 route đang đọc `role` không phải đổi.
  - Lúc refresh token: tính lại `roles`. Nếu vai hoạt động không còn trong `roles`, chuyển về `defaultActiveRole(roles)`.
  - `requireTenant()` giữ chữ ký cũ. `role` trả về là vai hoạt động.
  - Với `platform_admin`, `requireTenant()` ném `ForbiddenError`, vì vai này không có HTX.
- **Đổi vai:** `POST /api/session/role {role}`.
  - Trả 403 nếu `role` không có trong `session.user.roles`.
  - Nếu hợp lệ: cập nhật JWT qua `unstable_update`/`update` của NextAuth 5 rồi trả `{ data: { role, home: '/<role>/dashboard' } }`.
  - Với `platform_admin`, `home` là `/platform`.
  - Ghi một sự kiện kiểm toán `audit.record_event('web','role.switch', <userId>, {from, to})` qua kho kiểm toán đang có, nếu web đã có cách gọi. Nếu chưa có thì ghi log cấu trúc; người làm báo lại.
- **Middleware:**
  - `/manager`, `/officer`, `/farmer`, `/accountant` đòi vai hoạt động tương ứng.
  - `/platform` đòi vai hoạt động `platform_admin`.
  - Người dùng mở một khu mà mình có vai nhưng chưa phải vai hoạt động thì chuyển tới `/unauthorized?switch=<role>`. Trang đó có nút "Chuyển sang vai …".
  - `/` chuyển về trang nhà của vai hoạt động.
- **Gateway và Hasura:**
  - `CoreGatewayClient` tiếp tục nhận vai hoạt động làm `x-hasura-role`. Hasura cho phép mọi vai trong token, nên vai hoạt động phải nằm trong token. Điều này đã đúng vì ta kiểm ở bước đổi vai.
  - `accountant` chưa có quyền Hasura trong dự án con này. Mọi trang của kế toán đọc qua Prisma bằng `requireTenant()`.

### 4.3. Bộ chuyển vai (giao diện)

- **Vị trí:** chỉ hiện khi `roles` có từ 2 vai trở lên, ở hai chỗ:
  - trong popup hồ sơ của `Sidebar`, ngay dưới tên và nhãn vai;
  - trong menu tài khoản trên di động.
- **Mẫu:**

```
┌──────────────────────────────┐
│ Nguyễn Văn Hùng              │
│ Trưởng HTX                   │
│ ── Chuyển vai ─────────────  │
│ ● Trưởng HTX                 │
│ ○ Cán bộ kỹ thuật            │
│ ○ Kế toán                    │
│ ──────────────────────────── │
│ Hồ sơ · Thông báo · Đăng xuất│
└──────────────────────────────┘
```

- **Hành vi:**
  - Bấm một vai thì gọi `POST /api/session/role`, rồi `router.replace(home)` và `router.refresh()`.
  - Trong lúc chờ, nút bị khoá. Nếu lỗi, hiện toast "Không chuyển được vai. Vui lòng thử lại."
- **Truy cập:** điều khiển bằng bàn phím, vai đang dùng có `aria-current="true"`, sáng và tối đúng token, không tràn ở 390 px.

### 4.4. Khu `/accountant` (khung)

- `app/accountant/layout.tsx` theo đúng mẫu ba layout hiện có, với vai `accountant`.
- **Menu:** Tổng quan, Thông báo, Tài khoản. Dự án con 3 và 4 sẽ thêm Bàn cân, Giá thu mua, Vật tư, Quyết toán.
- `app/accountant/dashboard/page.tsx`: lời chào và một trạng thái trống thật: "Bàn cân và quyết toán sẽ có ở đây khi HTX bật." Không có số liệu giả.
- Thông báo và Tài khoản: dùng lại component của các vai khác, nếu dùng lại được bằng tham số vai. Nếu không dùng lại được thì chỉ để Tổng quan, và người làm báo lại.

### 4.5. Khu `/platform`

- **`app/platform/layout.tsx`:** vai `platform_admin`; menu gồm "Hợp tác xã" và "Tài khoản".
- **`app/platform/page.tsx` (danh sách HTX):**
  - Cột: mã, tên, số hộ, số thành viên (đếm từ `htx_memberships`), ngày tạo.
  - Nút "Tạo HTX".
- **`POST /api/platform/htx` (tạo HTX):** chỉ `platform_admin`.
  - Thân request: `{ htx_code: /^[A-Z0-9]{2,6}$/, name, address?, manager: { fullName, phone, pin } }`.
  - Tạo `htx_profiles` và tài khoản trưởng HTX qua `KeycloakAdminAdapter.registerUser(..., 'manager', true)`: không email, không TOTP bắt buộc.
  - Tạo dòng membership `['manager']`.
  - Trả 409 nếu mã HTX hoặc số điện thoại đã tồn tại. Nếu tạo Keycloak lỗi sau khi đã tạo hồ sơ HTX thì xoá hồ sơ vừa tạo (bù trừ), để không để lại HTX không có trưởng HTX.
- **`app/platform/htx/[code]/ai/page.tsx` (cấu hình AI của một HTX):** dùng lại `AgentSettingsPanel` và `AgentSettingsUseCase`, đọc và ghi cho `htx_code` của đường dẫn.
  - Route `GET/PUT /api/platform/htx/[code]/agent-settings` chỉ cho `platform_admin`. Thân request giống `PUT /api/agent/settings` hiện nay.
- **`/api/agent/settings` (route hiện có):**
  - `GET` vẫn cho `manager` và `officer` đọc.
  - `PUT` trả 403 với mọi vai và nêu rõ "Cấu hình AI do quản trị nền tảng đặt."
  - `can_edit` luôn `false`. Màn hình `/manager/ai/settings` và `/officer/ai/settings` thành chỉ xem, có dòng "Do quản trị nền tảng cấu hình".

### 4.6. Thành viên và vai

- **`POST /api/members/invite`:**
  - `role` cho phép `farmer | officer | accountant`.
  - Thêm `roles?: (farmer|officer|accountant)[]` (mặc định `[role]`) để mời một người với nhiều vai.
  - Gán đủ các realm role và ghi một dòng membership.
  - Không email, không `CONFIGURE_TOTP` cho bất kỳ vai nào.
  - Hộ nông dân vẫn được tạo khi `roles` có `farmer`.
- **`PUT /api/members/[id]/roles` (mới), chỉ `manager`, chỉ thành viên cùng HTX:**
  - Thân request: `{ roles: (farmer|officer|accountant)[] }`, không rỗng.
  - Đồng bộ realm role trong Keycloak: thêm vai thiếu, gỡ vai thừa trong ba vai này; không đụng `manager` hay `platform_admin`.
  - Ghi lại membership.
  - Không cho tự gỡ hết vai của chính mình.
- **`GET /api/members`:** gộp theo người, trả `roles: string[]`, không còn mỗi vai một dòng. Danh sách có cả trưởng HTX.
- **Màn hình `/manager/members`:**
  - Cột "Vai" hiện các nhãn.
  - Nút "Sửa vai" mở hộp chọn nhiều vai, có kiểm tra hợp lệ và trạng thái lỗi.
  - Biểu mẫu mời có ô chọn nhiều vai.
- **`KeycloakAdminAdapter`:**
  - Thêm `setRealmRoles(userId, add: string[], remove: string[])`.
  - `registerUser` nhận một mảng vai và bỏ `requiredActions: ['CONFIGURE_TOTP']`.
- **Realm:**
  - Bỏ `CONFIGURE_TOTP` khỏi `requiredActions` của các người dùng mẫu là trưởng HTX và cán bộ.
  - Trong user profile, `email` không còn `required`.
  - Sửa `platform/tests/test_realm_policy.py` theo luật mới:
    - không người dùng mẫu nào có `CONFIGURE_TOTP` trong `requiredActions`;
    - có realm role `accountant` và `platform_admin`;
    - `email` không bắt buộc;
    - người dùng mẫu `platform_admin` không có `htx_code`.

## 5. Ràng buộc

- Mọi kiểm tra vai làm ở server: middleware, route handler, `requireTenant()`. Client chỉ ẩn hoặc hiện.
- Mỗi route mới theo đúng mẫu hiện có (`withErrorHandler`, zod ở tầng route, envelope `{data}`/`{error}`), có test vai và test khác HTX.
- Không phá test hiện có của ba vai cũ. Test nào khẳng định đúng một vai thì sửa theo luật mới và nêu lý do trong commit.
- Theo các quy tắc trong `AGENTS.md`: định danh tiếng Anh, token màu, sáng và tối, 390 px.

## 6. Kiểm chứng

1. `make test`, `make lint`, `npx tsc --noEmit`, `npx next build`, `python -m pytest platform/tests/test_realm_policy.py` đều xanh.
2. Test đơn vị:
   - `rolesFromRealmRoles` và `defaultActiveRole`;
   - đổi vai hợp lệ, đổi sang vai không có (403), vai hoạt động mất sau refresh;
   - middleware cho 5 khu;
   - `requireTenant` với `platform_admin`;
   - tạo HTX (thành công, mã trùng, bù trừ khi Keycloak lỗi);
   - sửa vai (khác HTX trả 404, tự gỡ hết vai bị chặn, đồng bộ add/remove);
   - `PUT /api/agent/settings` trả 403;
   - route cấu hình AI của `platform_admin`.
3. Giao diện, 2 vòng ở 1366 px và 390 px, sáng và tối:
   - bộ chuyển vai của một tài khoản 3 vai;
   - `/accountant/dashboard`;
   - `/platform` cùng trang cấu hình AI;
   - `/manager/members` với hộp sửa vai.

## 7. Quyết định bổ sung sau lượt đọc thử (ràng buộc, thay cho chỗ mâu thuẫn ở trên)

1. **Vai hoạt động là ngữ cảnh giao diện, không phải ranh giới bảo mật.**
   - Người dùng được cấp mọi vai mình giữ. Mini-app, Hasura, Telegram và app di động vẫn xét theo mọi vai trong token. Đây là giới hạn đã chấp nhận và phải ghi vào tài liệu.
   - Route web xét vai hoạt động, tức là chặt hơn.
2. **Ghi `htx_memberships` không nằm trong callback `jwt`**, vì `middleware.ts` chạy ở Edge và không dùng được Prisma.
   - Việc ghi diễn ra trong `requireTenant()` (Node), qua `MembershipRepository.sync(userId, htxProfileId, roles)`: nếu chưa có dòng, hoặc `roles` khác vai trong token, thì upsert theo token.
   - Mỗi tiến trình nhớ các khoá đã đồng bộ trong bộ nhớ, để không truy vấn ở mọi request.
   - Lỗi khi ghi thì ghi log rồi cho qua, không chặn đăng nhập.
   - Cách này cũng tự chữa lệch giữa Keycloak và bảng theo cả hai chiều (thêm và gỡ vai).
3. **Refresh token:**
   - Giữ vai hoạt động nếu vai đó còn trong `roles`, ngược lại về `defaultActiveRole(roles)`. `refreshAccessToken` không được ghi đè vai hoạt động còn hợp lệ.
   - Độ trễ thu hồi vai bằng vòng đời access token của Keycloak, và chấp nhận được.
4. **Keycloak là nguồn sự thật.**
   - Mời, sửa vai và tạo HTX ghi Keycloak trước, rồi bảng. Nếu ghi bảng lỗi thì trả 500 có thông điệp; việc đồng bộ ở điểm 2 sẽ chữa sau.
   - `GET /api/members` vẫn đọc từ Keycloak (gộp theo người).
5. **`platform_admin`:**
   - Có người dùng mẫu như các người dùng mẫu khác.
   - Môi trường thật tạo tài khoản bằng `kcadm`; lệnh mẫu ghi trong `docs/dev-setup.md`.
   - Khu `/platform` không gọi Hasura nên không cần vai mặc định cho Hasura.
6. **Phiên cũ và `dev-login`:**
   - Cookie cũ chỉ có `role` thì coi là `roles = [role]`.
   - `/api/dev-login` nhận thêm `accountant` và `platform_admin` và đặt `roles = [role]`.
7. **Sửa vai thành viên:**
   - Chỉ sửa trong tập `farmer`, `officer`, `accountant`.
   - Trưởng HTX sửa được vai phụ của chính mình (vai `manager` giữ nguyên, nên được để trống tập này).
   - Trưởng HTX không sửa được trưởng HTX khác.
   - Với người không phải trưởng HTX, tập vai không được rỗng.
   - Thêm `farmer` thì tạo hoặc liên kết hộ như khi mời. Gỡ `farmer` thì giữ nguyên hộ và lịch sử, chỉ gỡ quyền.
8. **TOTP:**
   - Người dùng đang chạy thật còn treo `CONFIGURE_TOTP` không bị sửa tự động. `docs/dev-setup.md` ghi lệnh `kcadm` để gỡ khi chủ dự án muốn.
   - Cổng "đăng nhập lại trong 5 phút" (`authTime`) của chế độ tự vận hành giữ nguyên.

## 8. Phần để người làm tự quyết

- Tên component cụ thể.
- Cách gọi `update()` của NextAuth 5 (theo phiên bản đang cài).
- Câu chữ của trạng thái trống và trạng thái lỗi.
- Cách chia commit.
